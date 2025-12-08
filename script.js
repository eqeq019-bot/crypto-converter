// ======================
// Config (請勿公開於公開 repo)
// ======================
const CONFIG = {
    COINGECKO_API_KEY: 'CG-uv86KDk1FuMqbYqFmxtuAUL8', // ← 你提供的 Key
    COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    UPDATE_INTERVAL: 30000,
    CACHE_DURATION: 60000
};

// 幣種映射
const CRYPTO_IDS = {
    'BTC': 'bitcoin','ETH': 'ethereum','DOGE': 'dogecoin','PEPE': 'pepe',
    'USDT': 'tether','BNB': 'binancecoin','XRP': 'ripple','ADA': 'cardano','SOL':'solana'
};

const FIAT_CURRENCIES = {
    'HKD': { symbol: 'HK$', name: '港幣' },
    'USD': { symbol: '$', name: '美元' },
    'CNY': { symbol: '¥', name: '人民幣' },
    'JPY': { symbol: '¥', name: '日圓' },
    'EUR': { symbol: '€', name: '歐元' },
    'TWD': { symbol: 'NT$', name: '新台幣' }
};

let rateCache = {};
let cacheTime = {};
let cryptoChart = null;
let calculatorValue = '0';

// ----------------------
// Helpers: fetch with PRO header
// ----------------------
async function cgFetch(url) {
    return fetch(url, {
        headers: {
            'x-cg-pro-api-key': CONFIG.COINGECKO_API_KEY,
            'Accept': 'application/json'
        }
    });
}

// ----------------------
// Get crypto -> fiat rate
// ----------------------
async function getCryptoToFiatRate(cryptoCode, fiatCode) {
    const id = CRYPTO_IDS[cryptoCode];
    if (!id) return null;

    try {
        const url = `${CONFIG.COINGECKO_BASE_URL}/simple/price?ids=${id}&vs_currencies=${fiatCode.toLowerCase()}&include_24hr_change=false&precision=full`;
        const res = await cgFetch(url);
        if (!res.ok) throw new Error('API error ' + res.status);
        const json = await res.json();
        const val = json[id] && json[id][fiatCode.toLowerCase()];
        return val !== undefined ? Number(val) : null;
    } catch (e) {
        console.error('getCryptoToFiatRate error', e);
        return null;
    }
}

// ----------------------
// Crypto <-> Crypto via USD
// ----------------------
async function getCryptoToCryptoRate(fromCrypto, toCrypto) {
    const fromUsd = await getCryptoToFiatRate(fromCrypto, 'USD');
    const toUsd = await getCryptoToFiatRate(toCrypto, 'USD');
    if (!fromUsd || !toUsd) return null;
    return fromUsd / toUsd;
}

// ----------------------
// getExchangeRate unified
// ----------------------
async function getExchangeRate(fromCurrency, toCurrency) {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const now = Date.now();
    if (rateCache[cacheKey] && (now - cacheTime[cacheKey]) < CONFIG.CACHE_DURATION) {
        return rateCache[cacheKey];
    }

    let rate = null;
    const isFromCrypto = !!CRYPTO_IDS[fromCurrency];
    const isToCrypto = !!CRYPTO_IDS[toCurrency];

    if (fromCurrency === toCurrency) {
        rate = 1;
    } else if (isFromCrypto && !isToCrypto) {
        rate = await getCryptoToFiatRate(fromCurrency, toCurrency);
    } else if (isFromCrypto && isToCrypto) {
        rate = await getCryptoToCryptoRate(fromCurrency, toCurrency);
    } else if (!isFromCrypto && isToCrypto) {
        const cryptoToFiat = await getCryptoToFiatRate(toCurrency, fromCurrency);
        rate = cryptoToFiat ? (1 / cryptoToFiat) : null;
    } else {
        // fiat -> fiat (簡單保守處理: 1：1) 需要改成真實匯率可接 FIAT API
        rate = 1;
    }

    if (rate !== null) {
        rateCache[cacheKey] = rate;
        cacheTime[cacheKey] = now;
    }
    return rate;
}

// ----------------------
// UI: convert
// ----------------------
async function convertCurrency() {
    const amount = parseFloat(document.getElementById('amount').value);
    const from = document.getElementById('fromCurrency').value;
    const to = document.getElementById('toCurrency').value;

    if (isNaN(amount) || amount <= 0) {
        showError('請輸入有效金額');
        return;
    }

    document.getElementById('resultAmount').innerHTML = `<span class="loading">計算中...</span>`;
    document.getElementById('currentRate').textContent = '正在獲取匯率...';

    const rate = await getExchangeRate(from, to);
    if (!rate) {
        showError('無法獲取匯率，請稍後重試');
        return;
    }

    const result = amount * rate;
    updateDisplay(amount, from, result, to, rate);
    updateTimestamp();
}

function updateDisplay(amount, from, result, to, rate) {
    const formattedResult = formatCurrency(result, to);
    const formattedRate = formatCurrency(rate, to);

    document.getElementById('resultAmount').innerHTML =
        `${amount} ${from} = <span class="result-highlight">${formattedResult}</span>`;
    document.getElementById('currentRate').textContent = `1 ${from} = ${formattedRate}`;

    const btn = document.getElementById('convertBtn');
    btn.innerHTML = '<i class="fas fa-check"></i> 轉換完成';
    btn.classList.add('success');
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-calculator"></i> 立即轉換';
        btn.classList.remove('success');
    }, 1400);
}

function formatCurrency(value, currencyCode) {
    if (FIAT_CURRENCIES[currencyCode]) {
        try {
            return new Intl.NumberFormat('zh-HK', { style: 'currency', currency: currencyCode }).format(value);
        } catch (e) {
            return `${value.toFixed(2)} ${currencyCode}`;
        }
    }
    // crypto
    if (Math.abs(value) >= 1) return `${value.toFixed(6)} ${currencyCode}`;
    return `${value.toFixed(8)} ${currencyCode}`;
}

function showError(msg) {
    document.getElementById('resultAmount').innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${msg}</div>`;
}

// ----------------------
// Banner: show popular coins
// ----------------------
async function renderCryptoBanner() {
    const ids = 'bitcoin,ethereum,solana,dogecoin,tether,pepe';
    const url = `${CONFIG.COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&precision=full`;
    try {
        const res = await cgFetch(url);
        if (!res.ok) throw new Error('banner API ' + res.status);
        const data = await res.json();
        const container = document.getElementById('cryptoBanner');
        container.innerHTML = '';

        for (const id of Object.keys(data)) {
            const info = data[id];
            const price = info.usd;
            const change = info.usd_24h_change;
            const sign = change >= 0 ? '+' : '';
            const color = change >= 0 ? 'limegreen' : 'red';

            const el = document.createElement('div');
            el.className = 'banner-item';
            el.innerHTML = `<strong>${id.toUpperCase()}</strong><span>$${Number(price).toLocaleString()}</span><span style="color:${color}">${sign}${Number(change).toFixed(2)}%</span>`;
            container.appendChild(el);
        }
    } catch (e) {
        console.error('renderCryptoBanner error', e);
        document.getElementById('cryptoBanner').textContent = '無法載入熱門行情';
    }
}

// ----------------------
// Chart: 24h price
// ----------------------
function getSelectedChartCoin() {
    return document.getElementById('chartCoin').value;
}
async function renderCryptoChart(coin = 'bitcoin') {
    try {
        const url = `${CONFIG.COINGECKO_BASE_URL}/coins/${coin}/market_chart?vs_currency=usd&days=1&interval=hourly`;
        const res = await cgFetch(url);
        if (!res.ok) throw new Error('chart API ' + res.status);
        const json = await res.json();
        const prices = json.prices || [];
        const labels = prices.map(p => new Date(p[0]).toLocaleTimeString('zh-HK'));
        const data = prices.map(p => p[1]);

        const ctx = document.getElementById('cryptoChart').getContext('2d');
        if (cryptoChart) cryptoChart.destroy();
        cryptoChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: `${coin.toUpperCase()} (24h)`, data, tension:0.25, borderWidth:2, pointRadius:0 }] },
            options: { responsive:true, scales: { y: { beginAtZero:false } } }
        });
    } catch (e) {
        console.error('renderCryptoChart error', e);
    }
}
function onChartCoinChange() {
    const coin = getSelectedChartCoin();
    renderCryptoChart(coin);
}

// ----------------------
// Quick buttons
// ----------------------
function initQuickButtons() {
    const quick = [
        { from:'BTC', to:'HKD', label:'BTC → HKD' },
        { from:'ETH', to:'HKD', label:'ETH → HKD' },
        { from:'DOGE', to:'HKD', label:'DOGE → HKD' },
        { from:'USDT', to:'HKD', label:'USDT → HKD' },
        { from:'BTC', to:'USD', label:'BTC → USD' },
        { from:'ETH', to:'USD', label:'ETH → USD' }
    ];
    const container = document.getElementById('quickButtons');
    container.innerHTML = '';
    quick.forEach(q => {
        const btn = document.createElement('button');
        btn.textContent = q.label;
        btn.onclick = () => {
            document.getElementById('fromCurrency').value = q.from;
            document.getElementById('toCurrency').value = q.to;
            convertCurrency();
        };
        container.appendChild(btn);
    });
}

// ----------------------
// swap & clear
// ----------------------
function swapCurrencies() {
    const from = document.getElementById('fromCurrency');
    const to = document.getElementById('toCurrency');
    [from.value, to.value] = [to.value, from.value];
    convertCurrency();
}
function clearAmount() {
    document.getElementById('amount').value = '1';
    convertCurrency();
}

// ----------------------
// calculator
// ----------------------
function updateCalculatorDisplay() {
    const d = document.getElementById('calcDisplay');
    d.value = calculatorValue;
}
function calcInput(v) {
    if (calculatorValue === '0' || calculatorValue === '錯誤') calculatorValue = v;
    else calculatorValue += v;
    updateCalculatorDisplay();
}
function calcCalculate() {
    try {
        // 安全計算（注意風險）
        calculatorValue = Function('"use strict"; return (' + calculatorValue + ')')();
        updateCalculatorDisplay();
    } catch (e) {
        calculatorValue = '錯誤';
        updateCalculatorDisplay();
    }
}
function calcClear() { calculatorValue = '0'; updateCalculatorDisplay(); }
function calcBackspace() {
    if (calculatorValue.length > 1) calculatorValue = calculatorValue.slice(0,-1);
    else calculatorValue = '0';
    updateCalculatorDisplay();
}
function useCalcResult() {
    const num = parseFloat(calculatorValue);
    if (!isNaN(num) && num >= 0) {
        document.getElementById('amount').value = num;
        convertCurrency();
    }
}

// ----------------------
// timestamp & auto update
// ----------------------
function updateTimestamp() {
    document.getElementById('lastUpdate').textContent = `最後更新: ${new Date().toLocaleTimeString('zh-HK')}`;
}
function startAutoUpdate() {
    setInterval(() => {
        convertCurrency();
        renderCryptoBanner();
        document.getElementById('updateStatus').textContent = `自動更新: ${new Date().toLocaleTimeString('zh-HK')}`;
    }, CONFIG.UPDATE_INTERVAL);
}

// ----------------------
// init
// ----------------------
async function initApp() {
    // event listeners for inputs
    document.getElementById('amount').addEventListener('input', () => {});
    document.getElementById('fromCurrency').addEventListener('change', convertCurrency);
    document.getElementById('toCurrency').addEventListener('change', convertCurrency);

    initQuickButtons();
    updateCalculatorDisplay();
    await renderCryptoBanner();
    await renderCryptoChart(getSelectedChartCoin());
    await convertCurrency();
    startAutoUpdate();
}

document.addEventListener('DOMContentLoaded', initApp);

// ----------------------
// small test helper (開發時使用)
// ----------------------
async function testPing() {
    try {
        const r = await cgFetch(`${CONFIG.COINGECKO_BASE_URL}/ping`);
        const t = await r.text();
        console.log('ping:', t);
    } catch (e) {
        console.error('ping failed', e);
    }
}
