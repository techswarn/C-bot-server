const Binance = require('node-binance-api');
const LOGS = process.env.BINANCE_LOGS === 'true';
const logger = require('./logger');

function getUrl(url, fallback) {
    if (!url) return fallback;
    return url.endsWith('/') ? url : url + "/";
}

function getApiUrl() {
    const API_URL = process.env.BINANCE_API_URL;
    return getUrl(API_URL, "https://testnet.binance.vision/api/");
}

function getSApiUrl() {
    const SAPI_URL = process.env.BINANCE_SAPI_URL;
    return getUrl(SAPI_URL, "https://api.binance.com/sapi/v1/");
}

function getFApiUrl() {
    const FAPI_URL = process.env.BINANCE_FAPI_URL;
    return getUrl(FAPI_URL, "https://testnet.binancefuture.com/fapi/");
}

function getStreamUrl() {
    const WS_URL = process.env.BINANCE_WS_URL;
    return getUrl(WS_URL, "wss://testnet.binance.vision/ws/");
}

function getFStreamUrl() {
    const FWS_URL = process.env.BINANCE_FWS_URL;
    return getUrl(FWS_URL, "wss://stream.binancefuture.com/ws/");
}

module.exports = class Exchange {

    constructor(user = {}, isFuture = false) {
        const key = isFuture ? user.futuresKey : user.accessKey;
        const secret = isFuture ? user.futuresSecret : user.secretKey;

        this.binance = new Binance().options({
            APIKEY: key,
            APISECRET: secret,
            recvWindow: 60000,
            family: 0,
            urls: {
                base: getApiUrl(),
                stream: getStreamUrl(),
                fapi: getFApiUrl(),
                fstreamSingle: getFStreamUrl()
            },
            verbose: LOGS
        });

        this.binance.APIKEY = key;
        this.binance.APISECRET = secret;
    }

    exchangeInfo() {
        return this.binance.exchangeInfo();
    }

    futuresExchangeInfo() {
        return this.binance.futuresExchangeInfo();
    }

    async balance() {
        await this.binance.useServerTime();
        return this.binance.balance();
    }

    async futuresBalance() {
        await this.binance.useServerTime();
        return this.binance.futuresBalance();
    }

    futuresPositions(symbol = '') {
        return this.binance.futuresPositionRisk(symbol ? { symbol, timestamp: Date.now() } : undefined);
    }

    buy(symbol, quantity, price, options) {
        if (!options || options.type === 'MARKET')
            return this.binance.marketBuy(symbol, quantity, options);

        return this.binance.buy(symbol, quantity, price, options);
    }

    sell(symbol, quantity, price, options) {
        if (!options || options.type === 'MARKET')
            return this.binance.marketSell(symbol, quantity, options);

        return this.binance.sell(symbol, quantity, price, options);
    }

    futuresBuy(symbol, quantity, price, options) {
        if (!options || options.type === 'MARKET')
            return this.binance.futuresMarketBuy(symbol, quantity, options);

        return this.binance.futuresBuy(symbol, quantity, price, options);
    }

    futuresSell(symbol, quantity, price, options) {
        if (!options || options.type === 'MARKET')
            return this.binance.futuresMarketSell(symbol, quantity, options);

        return this.binance.futuresSell(symbol, quantity, price, options);
    }

    cancel(symbol, orderId) {
        return this.binance.cancel(symbol, orderId);
    }

    futuresCancel(symbol, orderId) {
        return this.binance.futuresCancel(symbol, { orderId });
    }

    orderStatus(symbol, orderId) {
        return this.binance.orderStatus(symbol, `${orderId}`);
    }

    async orderTrade(symbol, orderId) {
        const trades = await this.binance.trades(symbol);
        return trades.find(t => t.orderId === orderId);
    }

    futuresOrderStatus(symbol, orderId) {
        return this.binance.futuresOrderStatus(symbol, { orderId });
    }

    async futuresOrderTrade(symbol, orderId) {
        const trades = await this.binance.futuresUserTrades(symbol);
        return trades.find(t => t.orderId === orderId);
    }

    withdraw(coin, amount, address, network, addressTag) {
        try {
            const data = { coin, amount, address };
            if (addressTag) data.addressTag = addressTag;
            if (network) data.network = network;
            return this.privateCall(getSApiUrl() + 'capital/withdraw/apply', data, 'POST');
        } catch (err) {
            throw new Error(err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }

    async getCoins() {
        try {
            const coins = await this.privateCall(getSApiUrl() + 'capital/config/getall', null, 'GET');
            return coins.map(c => {
                return {
                    coin: c.coin,
                    networks: c.networkList.map(n => {
                        return {
                            network: n.network,
                            withdrawIntegerMultiple: n.withdrawIntegerMultiple,
                            isDefault: n.isDefault,
                            name: n.name,
                            withdrawFee: n.withdrawFee,
                            withdrawMin: n.withdrawMin,
                            minConfirm: n.minConfirm
                        }
                    })
                }
            })
        } catch (err) {
            throw new Error(err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }

    async publicCall(apiUrl, data = {}, method = 'GET') {

        if (!this.binance.APIKEY) throw new Error(`The APIKEY is required to connect on exchange!`);

        const axios = require('axios');
        const queryString = new URLSearchParams();
        Object.entries(data).map(prop => queryString.append(prop[0], `${prop[1]}`));

        const result = await axios({
            method,
            url: `${apiUrl}?${queryString.toString()}`,
            headers: { 'X-MBX-APIKEY': this.binance.APIKEY }
        })

        return result.data;
    }

    async privateCall(apiUrl, data = {}, method = 'GET') {

        if (!this.binance.APIKEY || !this.binance.APISECRET) throw new Error(`The settings object is required to connect on exchange!`);

        const timestamp = Date.now();
        const recvWindow = 60000;

        const axios = require('axios');
        const queryString = new URLSearchParams();
        Object.entries({ ...data, timestamp, recvWindow }).map(prop => queryString.append(prop[0], `${prop[1]}`));

        const signature = require('crypto')
            .createHmac('sha256', this.binance.APISECRET)
            .update(queryString.toString())
            .digest('hex');

        queryString.append('signature', signature);

        const result = await axios({
            method,
            url: `${apiUrl}?${queryString.toString()}`,
            headers: { 'X-MBX-APIKEY': this.binance.APIKEY }
        })

        return result.data;
    }

    bookStream(callback) {
        this.binance.websockets.bookTickers(order => {
            callback(order)
        });
    }

    async candles(symbol, interval, startTime, endTime, limit = 1000) {
        const binance = new Binance().options({
            family: 0
        });
        
        const candles = await binance.candlesticks(symbol, interval, false, {
            limit: limit > 1000 ? 1000 : limit,
            startTime,
            endTime
        })

        const ohlc = { open: [], close: [], high: [], low: [], volume: [], time: [] };

        candles.forEach(candle => {
            let [openTime, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVolume, buyAssetVolume, ignored] = candle;
            ohlc.open.push(parseFloat(open));
            ohlc.close.push(parseFloat(close));
            ohlc.high.push(parseFloat(high));
            ohlc.low.push(parseFloat(low));
            ohlc.volume.push(parseFloat(volume));
            ohlc.time.push(closeTime);
        })
        return ohlc;
    }

    chartStream(symbol, interval, callback) {
        const streamUrl = this.binance.websockets.chart(symbol, interval, (symbol, interval, chart) => {

            const tick = this.binance.last(chart);
            const isIncomplete = tick && chart[tick] && chart[tick].isFinal === false;

            if ((!process.env.INCOMPLETE_CANDLES || process.env.INCOMPLETE_CANDLES === 'false')
                && isIncomplete) {
                return;
            }

            const ohlc = this.binance.ohlc(chart);
            ohlc.isComplete = !isIncomplete;
            callback(ohlc);
        });
        if (LOGS) logger('system', `Chart Stream connected at ${streamUrl}`);
    }

    terminateChartStream(symbol, interval) {
        this.binance.websockets.terminate(`${symbol.toLowerCase()}@kline_${interval}`);
        logger('system', `Chart Stream ${symbol.toLowerCase()}@kline_${interval} terminated!`);
    }

    terminateUserDataStream() {
        const url = getApiUrl() + 'v3/userDataStream';

        try {
            const data = { listenKey: this.binance.options.listenKey };
            return this.publicCall(url, data, 'DELETE');
        }
        catch (err) {
            throw new Error(err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }

    terminateFuturesUserDataStream() {
        const url = getFApiUrl() + 'v1/listenKey';

        try {
            const data = { listenKey: this.binance.options.futuresListenKey };
            return this.publicCall(url, data, 'DELETE');
        }
        catch (err) {
            throw new Error(err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }

    userDataStream(updateCallback, listStatusCallback) {
        this.binance.websockets.userData(
            data => updateCallback(data),
            true,
            subscribedData => {
                logger('system', `userDataStream:subscribeEvent: ${JSON.stringify(subscribedData)}`)
                this.binance.options.listenKey = subscribedData;
            },
            listStatusData => listStatusCallback(listStatusData));
    }

    futuresUserDataStream(marginCallback, balanceCallback, orderCallback, accountCallback) {
        this.binance.websockets.userFutureData(
            data => marginCallback(data),
            data => balanceCallback(data),
            data => orderCallback(data),
            data => {
                logger('system', `futuresUserDataStream:subscribeEvent: ${JSON.stringify(data)}`)
                this.binance.options.futuresListenKey = data;
            },
            data => accountCallback(data)
        )
    }

    markPriceStream(callback, speed = '') {
        this.binance.futuresMarkPriceStream(false, callback, speed);
    }

    liquidationStream(callback) {
        this.binance.futuresLiquidationStream(callback);
    }

    tickerStream(callback) {
        this.binance.websockets.prevDay(null, (data, converted) => {
            callback(converted);
        }, true);
    }

    futuresMargin(symbol, marginType){
        return this.binance.futuresMarginType(symbol, marginType)
    }

    futuresLeverage(symbol, leverage){
        return this.binance.futuresLeverage(symbol, leverage);
    }
}