// ======================
// 配置設定
// ======================
const CONFIG = {
    COINGECKO_API_KEY: '你的_API_Key_這裡', // 👈 替換成你的 CoinGecko API Key
    COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    UPDATE_INTERVAL: 30000, // 30秒更新一次
    CACHE_DURATION: 60000, // 1分鐘緩存
};

// ======================
// 貨幣映射
// ======================
const CRYPTO_IDS = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'DOGE': 'dogecoin',
    'PEPE': 'pepe',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'SOL': 'solana',
    'MATIC': 'matic-network',
    'AVAX': 'avalanche-2',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'LTC': 'litecoin',
    'DOT': 'polkadot'
};

const FIAT_CURRENCIES = {
    'HKD': { symbol: 'HK$', name: '港幣' },
    'USD': { symbol: '$', name: '美元' },
    'CNY': { symbol: '¥', name: '人民幣' },
    'JPY': { symbol: '¥', name: '日圓' },
    'EUR': { symbol: '€', name: '歐元' },
    'TWD': { symbol: 'NT$', name: '新台幣' },
    'GBP': { symbol: '£', name: '英鎊' },
    'AUD': { symbol: 'A$', name: '澳元' },
    'KRW': { symbol: '₩', name: '韓元' },
    'SGD': { symbol: 'S$', name: '新加坡幣' }
};

// ======================
// 全局變數
// ======================
let rateCache = {};
let cacheTime = {};
let autoUpdateInterval = null;
let lastUpdateTime = null;
let calculatorValue = '0';

// ======================
// CoinGecko API 函數
// ======================

/**
 * 從 CoinGecko 獲取匯率
 */
async function getExchangeRate(fromCurrency, toCurrency) {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const now = Date.now();
    
    // 檢查緩存
    if (rateCache[cacheKey] && (now - cacheTime[cacheKey]) < CONFIG.CACHE_DURATION) {
        return rateCache[cacheKey];
    }
    
    // 如果是相同貨幣
    if (fromCurrency === toCurrency) {
        return 1;
    }
    
    try {
        // 判斷是加密貨幣還是法幣
        const isFromCrypto = CRYPTO_IDS.hasOwnProperty(fromCurrency);
        const isToCrypto = CRYPTO_IDS.hasOwnProperty(toCurrency);
        
        let rate = null;
        
        if (isFromCrypto && !isToCrypto) {
            // 加密貨幣 → 法幣
            rate = await getCryptoToFiatRate(fromCurrency, toCurrency);
        } else if (isFromCrypto && isToCrypto) {
            // 加密貨幣 → 加密貨幣
            rate = await getCryptoToCryptoRate(fromCurrency, toCurrency);
        } else if (!isFromCrypto && isToCrypto) {
            // 法幣 → 加密貨幣 (需要反轉計算)
            const cryptoToFiat = await getCryptoToFiatRate(toCurrency, fromCurrency);
            rate = cryptoToFiat ? 1 / cryptoToFiat : null;
        } else {
            // 法幣 → 法幣 (目前不直接支援，返回 1)
            rate = 1;
        }
        
        if (rate !== null) {
            // 更新緩存
            rateCache[cacheKey] = rate;
            cacheTime[cacheKey] = now;
        }
        
        return rate;
        
    } catch (error) {
        console.error('獲取匯率失敗:', error);
        return null;
    }
}

/**
 * 獲取加密貨幣到法幣的匯率
 */
async function getCryptoToFiatRate(cryptoCode, fiatCode) {
    const cryptoId = CRYPTO_IDS[cryptoCode];
    if (!cryptoId) return null;
    
    try {
        const url = `${CONFIG.COINGECKO_BASE_URL}/simple/price?ids=${cryptoId}&vs_currencies=${fiatCode.toLowerCase()}`;
        
        const response = await fetch(url, {
            headers: {
                'x-cg-demo-api-key': CONFIG.COINGECKO_API_KEY,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API 錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        return data[cryptoId][fiatCode.toLowerCase()];
        
    } catch (error) {
        console.error(`獲取 ${cryptoCode}/${fiatCode} 匯率失敗:`, error);
        return null;
    }
}

/**
 * 獲取加密貨幣之間的匯率
 */
async function getCryptoToCryptoRate(fromCrypto, toCrypto) {
    const fromId = CRYPTO_IDS[fromCrypto];
    const toId = CRYPTO_IDS[toCrypto];
    
    if (!fromId || !toId) return null;
    
    try {
        // 通過 USD 作為中間貨幣計算
        const fromToUsd = await getCryptoToFiatRate(fromCrypto, 'USD');
        const toToUsd = await getCryptoToFiatRate(toCrypto, 'USD');
        
        if (fromToUsd && toToUsd) {
            return fromToUsd / toToUsd;
        }
        return null;
        
    } catch (error) {
        console.error(`獲取 ${fromCrypto}/${toCrypto} 匯率失敗:`, error);
        return null;
    }
}

// ======================
// 主要轉換功能
// ======================

/**
 * 執行貨幣轉換
 */
async function convertCurrency() {
    const amount = parseFloat(document.getElementById('amount').value);
    const fromCurrency = document.getElementById('fromCurrency').value;
    const toCurrency = document.getElementById('toCurrency').value;
    
    // 驗證輸入
    if (isNaN(amount) || amount <= 0) {
        showError('請輸入有效的金額');
        return;
    }
    
    // 顯示載入中
    document.getElementById('resultAmount').innerHTML = 
        '<span class="loading">計算中...</span>';
    document.getElementById('currentRate').textContent = '正在獲取匯率...';
    
    // 獲取匯率
    const rate = await getExchangeRate(fromCurrency, toCurrency);
    
    if (rate === null) {
        showError('無法獲取匯率，請稍後再試');
        return;
    }
    
    // 計算結果
    const result = amount * rate;
    
    // 更新顯示
    updateDisplay(amount, fromCurrency, result, toCurrency, rate);
    
    // 更新時間戳
    updateTimestamp();
    
    // 保存到歷史記錄
    saveToHistory(amount, fromCurrency, result, toCurrency, rate);
}

/**
 * 更新顯示結果
 */
function updateDisplay(amount, fromCurrency, result, toCurrency, rate) {
    // 格式化結果
    const formattedResult = formatCurrency(result, toCurrency);
    const formattedRate = formatCurrency(rate, toCurrency);
    
    // 更新結果顯示
    document.getElementById('resultAmount').innerHTML = `
        <div class="result-main">
            ${amount} ${fromCurrency} = 
            <span class="result-highlight">${formattedResult}</span>
        </div>
    `;
    
    // 更新匯率顯示
    document.getElementById('currentRate').innerHTML = `
        1 ${fromCurrency} = ${formattedRate}
    `;
    
    // 更新按鈕狀態
    document.getElementById('convertBtn').innerHTML = `
        <i class="fas fa-check"></i>
        轉換完成
    `;
    document.getElementById('convertBtn').classList.add('success');
    
    setTimeout(() => {
        document.getElementById('convertBtn').innerHTML = `
            <i class="fas fa-calculator"></i>
            立即轉換
        `;
        document.getElementById('convertBtn').classList.remove('success');
    }, 2000);
}

/**
 * 格式化貨幣
 */
function formatCurrency(value, currencyCode) {
    // 處理過大的數字
    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(2)}M ${currencyCode}`;
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}K ${currencyCode}`;
    }
    
    // 獲取貨幣資訊
    const currencyInfo = FIAT_CURRENCIES[currencyCode];
    
    if (currencyInfo) {
        // 法幣格式化
        const formatter = new Intl.NumberFormat('zh-HK', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        });
        
        return formatter.format(value).replace(currencyCode, currencyInfo.symbol);
    } else {
        // 加密貨幣格式化（更多小數位）
        const cryptoFormatter = new Intl.NumberFormat('zh-HK', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8
        });
        
        return `${cryptoFormatter.format(value)} ${currencyCode}`;
    }
}

// ======================
// 輔助功能
// ======================

/**
 * 交換貨幣
 */
function swapCurrencies() {
    const fromSelect = document.getElementById('fromCurrency');
    const toSelect = document.getElementById('toCurrency');
    
    const tempValue = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = tempValue;
    
    // 重新計算
    convertCurrency();
}

/**
 * 清空金額
 */
function clearAmount() {
    document.getElementById('amount').value = '1';
    convertCurrency();
}

/**
 * 顯示錯誤訊息
 */
function showError(message) {
    document.getElementById('resultAmount').innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            ${message}
        </div>
    `;
}

/**
 * 更新時間戳
 */
function updateTimestamp() {
    lastUpdateTime = new Date();
    const timeStr = lastUpdateTime.toLocaleTimeString('zh-HK');
    document.getElementById('lastUpdate').textContent = `最後更新: ${timeStr}`;
}

/**
 * 開始自動更新
 */
function startAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }
    
    autoUpdateInterval = setInterval(() => {
        convertCurrency();
        document.getElementById('updateStatus').textContent = 
            `自動更新: ${new Date().toLocaleTimeString('zh-HK')}`;
    }, CONFIG.UPDATE_INTERVAL);
}

// ======================
// 計算機功能
// ======================

/**
 * 計算機輸入
 */
function calcInput(value) {
    if (calculatorValue === '0' || calculatorValue === '錯誤') {
        calculatorValue = value;
    } else {
        calculatorValue += value;
    }
    updateCalculatorDisplay();
}

/**
 * 計算機計算
 */
function calcCalculate() {
    try {
        // 安全計算，避免使用 eval
        calculatorValue = Function('"use strict"; return (' + calculatorValue + ')')();
        updateCalculatorDisplay();
    } catch (error) {
        calculatorValue = '錯誤';
        updateCalculatorDisplay();
    }
}

/**
 * 清空計算機
 */
function calcClear() {
    calculatorValue = '0';
    updateCalculatorDisplay();
}

/**
 * 刪除最後一個字符
 */
function calcBackspace() {
    if (calculatorValue.length > 1) {
        calculatorValue = calculatorValue.slice(0, -1);
    } else {
        calculatorValue = '0';
    }
    updateCalculatorDisplay();
}

/**
 * 使用計算機結果
 */
function useCalcResult() {
    const calcValue = parseFloat(calculatorValue);
    if (!isNaN(calcValue) && calcValue > 0) {
        document.getElementById('amount').value = calculatorValue;
        convertCurrency();
    }
}

/**
 * 更新計算機顯示
 */
function updateCalculatorDisplay() {
    const display = document.getElementById('calcDisplay');
    if (display) {
        display.value = calculatorValue;
    }
}

// ======================
// 快捷貨幣功能
// ======================

/**
 * 初始化快捷貨幣按鈕
 */
function initQuickButtons() {
    const quickButtons = [
        { from: 'BTC', to: 'HKD', label: 'BTC → HKD' },
        { from: 'ETH', to: 'HKD', label: 'ETH → HKD' },
        { from: 'DOGE', to: 'HKD', label: 'DOGE → HKD' },
        { from: 'USDT', to: 'HKD', label: 'USDT → HKD' },
        { from: 'BTC', to: 'USD', label: 'BTC → USD' },
        { from: 'ETH', to: 'USD', label: 'ETH → USD' },
        { from: 'BTC', to: 'CNY', label: 'BTC → 人民幣' },
        { from: 'BTC', to: 'JPY', label: 'BTC → 日圓' }
    ];
    
    const container = document.getElementById('quickButtons');
    container.innerHTML = '';
    
    quickButtons.forEach(button => {
        const btn = document.createElement('button');
        btn.textContent = button.label;
        btn.onclick = () => {
            document.getElementById('fromCurrency').value = button.from;
            document.getElementById('toCurrency').value = button.to;
            convertCurrency();
        };
        container.appendChild(btn);
    });
}

// ======================
// 歷史記錄功能
// ======================

/**
 * 保存到歷史記錄
 */
function saveToHistory(amount, from, result, to, rate) {
    const history = JSON.parse(localStorage.getItem('conversionHistory') || '[]');
    
    history.unshift({
        timestamp: new Date().toISOString(),
        amount,
        from,
        result,
        to,
        rate
    });
    
    // 只保留最近10條記錄
    if (history.length > 10) {
        history.pop();
    }
    
    localStorage.setItem('conversionHistory', JSON.stringify(history));
}

// ======================
// 初始化
// ======================

/**
 * 初始化應用程式
 */
async function initApp() {
    console.log('初始化加密貨幣轉換器...');
    
    // 設置事件監聽
    document.getElementById('amount').addEventListener('input', convertCurrency);
    document.getElementById('fromCurrency').addEventListener('change', convertCurrency);
    document.getElementById('toCurrency').addEventListener('change', convertCurrency);
    
    // 初始化快捷按鈕
    initQuickButtons();
    
    // 初始化計算機
    updateCalculatorDisplay();
    
    // 執行首次轉換
    await convertCurrency();
    
    // 開始自動更新
    startAutoUpdate();
    
    // 更新狀態
    document.getElementById('updateStatus').textContent = 
        `每${CONFIG.UPDATE_INTERVAL/1000}秒自動更新`;
    
    console.log('應用程式初始化完成');
}

// ======================
// 頁面載入
// ======================

// 當 DOM 完全載入時初始化
document.addEventListener('DOMContentLoaded', initApp);

// ======================
// 錯誤處理
// ======================

// 全局錯誤處理
window.addEventListener('error', function(event) {
    console.error('應用程式錯誤:', event.error);
    showError('應用程式發生錯誤，請刷新頁面');
});

// 離線檢測
window.addEventListener('offline', function() {
    showError('網路連接已斷開，請檢查網路連接');
});

window.addEventListener('online', function() {
    convertCurrency();
});
