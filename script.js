// ======================
// 配置設定
// ======================
const CONFIG = {
    COINGECKO_API_KEY: '你的API_KEY',  // ⭐請在這裡填入你的 PRO API KEY
    COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    UPDATE_INTERVAL: 30000,
    CACHE_DURATION: 60000,
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
let cryptoChart;

// ======================
// API：獲取加密貨幣 → 法幣
// ======================
async function getCryptoToFiatRate(cryptoCode, fiatCode) {
    const cryptoId = CRYPTO_IDS[cryptoCode];
    if (!cryptoId) return null;

    try {
        const url =
            `${CONFIG.COINGECKO_BASE_URL}/simple/price?ids=${cryptoId}&vs_currencies=${fiatCode.toLowerCase()}&precision=full`;

        const response = await fetch(url, {
            headers: {
                "x-cg-pro-api-key": CONFIG.COINGECKO_API_KEY,
                "Accept": "application/json"
            }
        });

        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);

        const data = await response.json();
        return Number(data[cryptoId][fiatCode.toLowerCase()]);

    } catch (error) {
        console.error(`${cryptoCode}/${fiatCode} API 失敗`, error);
        return null;
    }
}

// ======================
// API：加密貨幣 → 加密貨幣
// ======================
async function getCryptoToCryptoRate(fromCrypto, toCrypto) {
    const fromUSD = await getCryptoToFiatRate(fromCrypto, "USD");
    const toUSD = await getCryptoToFiatRate(toCrypto, "USD");

    if (!fromUSD || !toUSD) return null;
    return fromUSD / toUSD;
}

// ======================
// API：統一的匯率運算邏輯
// ======================
async function getExchangeRate(fromCurrency, toCurrency) {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const now = Date.now();

    if (rateCache[cacheKey] && (now - cacheTime[cacheKey]) < CONFIG.CACHE_DURATION)
        return rateCache[cacheKey];

    let rate = null;

    const isFromCrypto = CRYPTO_IDS[fromCurrency];
    const isToCrypto = CRYPTO_IDS[toCurrency];

    if (fromCurrency === toCurrency) {
        rate = 1;
    }
    else if (isFromCrypto && !isToCrypto) {
        rate = await getCryptoToFiatRate(fromCurrency, toCurrency);
    }
    else if (isFromCrypto && isToCrypto) {
        rate = await getCryptoToCryptoRate(fromCurrency, toCurrency);
    }
    else if (!isFromCrypto && isToCrypto) {
        const fiatToCrypto = await getCryptoToFiatRate(toCurrency, fromCurrency);
        rate = fiatToCrypto ? 1 / fiatToCrypto : null;
    }
    else {
        rate = 1;
    }

    if (rate) {
        rateCache[cacheKey] = rate;
        cacheTime[cacheKey] = now;
    }

    return rate;
}

// ======================
// UI：執行貨幣轉換
// ======================
async function convertCurrency() {
    const amount = parseFloat(document.getElementById('amount').value);
    const from = document.getElementById('fromCurrency').value;
    const to = document.getElementById('toCurrency').value;

    if (isNaN(amount) || amount <= 0) {
        showError("請輸入有效金額");
        return;
    }

    document.getElementById('resultAmount').innerHTML = `<span class="loading">計算中...</span>`;
    document.getElementById('currentRate').textContent = "正在獲取匯率...";

    const rate = await getExchangeRate(from, to);

    if (!rate) {
        showError("無法獲取匯率");
        return;
    }

    const result = rate * amount;
    updateDisplay(amount, from, result, to, rate);
    updateTimestamp();
}

// ======================
// UI：更新結果顯示
// ======================
function updateDisplay(amount, from, result, to, rate) {
    const formattedResult = formatCurrency(result, to);
    const formattedRate = formatCurrency(rate, to);

    document.getElementById("resultAmount").innerHTML =
        `${amount} ${from} = <span class="result-highlight">${formattedResult}</span>`;

    document.getElementById("currentRate").innerHTML =
        `1 ${from} = ${formattedRate}`;
}

// ======================
// UI：格式化貨幣
// ======================
function formatCurrency(value, currencyCode) {
    const currencyInfo = FIAT_CURRENCIES[currencyCode];

    if (currencyInfo) {
        return new Intl.NumberFormat('zh-HK', {
            style: 'currency',
            currency: currencyCode
        }).format(value).replace(currencyCode, currencyInfo.symbol);
    }

    return `${value.toFixed(8)} ${currencyCode}`;
}

// ======================
// 即時走勢圖（Chart.js）
// ======================
async function renderCryptoChart(crypto = "bitcoin") {
    const url =
        `${CONFIG.COINGECKO_BASE_URL}/coins/${crypto}/market_chart?vs_currency=usd&days=1`;

    const response = await fetch(url, {
        headers: { "x-cg-pro-api-key": CONFIG.COINGECKO_API_KEY }
    });

    const data = await response.json();
    const prices = data.prices.map(p => p[1]);
    const times = data.prices.map(p =>
        new Date(p[0]).toLocaleTimeString("zh-HK")
    );

    if (cryptoChart) cryptoChart.destroy();

    const ctx = document.getElementById("cryptoChart").getContext("2d");

    cryptoChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: times,
            datasets: [{
                label: `${crypto.toUpperCase()} 24小時價格`,
                data: prices,
                borderWidth: 2,
                borderColor: "#00c0ff",
                fill: false,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

// ======================
// 熱門幣 Banner
// ======================
async function renderCryptoBanner() {
    const coins = "bitcoin,ethereum,solana,dogecoin,tether,pepe";

    const url =
        `${CONFIG.COINGECKO_BASE_URL}/simple/price?ids=${coins}&vs_currencies=usd&include_24hr_change=true`;

    const response = await fetch(url, {
        headers: { "x-cg-pro-api-key": CONFIG.COINGECKO_API_KEY }
    });

    const data = await response.json();

    const container = document.getElementById("cryptoBanner");
    container.innerHTML = "";

    for (const id in data) {
        const p = data[id];
        const change = p.usd_24h_change.toFixed(2);
        const color = change >= 0 ? "limegreen" : "red";

        container.innerHTML += `
            <div class="banner-item">
                <strong>${id.toUpperCase()}</strong>
                <span>$${p.usd.toLocaleString()}</span>
                <span style="color:${color}">${change}%</span>
            </div>`;
    }
}

// ======================
// 其它 UI 功能（swap, error...）
// ======================
function swapCurrencies() {
    let from = document.getElementById("fromCurrency");
    let to = document.getElementById("toCurrency");

    [from.value, to.value] = [to.value, from.value];
    convertCurrency();
}

function showError(msg) {
    document.getElementById("resultAmount").innerHTML =
        `<div class="error-message">${msg}</div>`;
}

function updateTimestamp() {
    const t = new Date().toLocaleTimeString("zh-HK");
    document.getElementById("lastUpdate").textContent = `最後更新：${t}`;
}

// ======================
// 初始化 App
// ======================
async function initApp() {
    convertCurrency();
    renderCryptoChart("bitcoin");
    renderCryptoBanner();

    setInterval(renderCryptoBanner, 15000);
    setInterval(() => convertCurrency(), CONFIG.UPDATE_INTERVAL);
}

document.addEventListener("DOMContentLoaded", initApp);
