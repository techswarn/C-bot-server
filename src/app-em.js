const ordersRepository = require('./repositories/ordersRepository');
const { orderStatus } = require('./repositories/ordersRepository');
const { monitorTypes, getActiveSystemMonitors } = require('./repositories/monitorsRepository');
const { execCalc, indexKeys } = require('./utils/indexes');
const logger = require('./utils/logger');
const push = require('./utils/push');
const Exchange = require('./utils/exchange');

let WSS, hydra, anonymousExchange;

function convertTicker(ticker) {
    const copy = {};
    copy.priceChange = parseFloat(ticker.priceChange);
    copy.percentChange = parseFloat(ticker.percentChange);
    copy.averagePrice = parseFloat(ticker.averagePrice);
    copy.prevClose = parseFloat(ticker.prevClose);
    copy.close = parseFloat(ticker.close);
    copy.closeQty = parseFloat(ticker.closeQty);
    copy.bestBid = parseFloat(ticker.bestBid);
    copy.bestBidQty = parseFloat(ticker.bestBidQty);
    copy.bestAsk = parseFloat(ticker.bestAsk);
    copy.bestAskQty = parseFloat(ticker.bestAskQty);
    copy.open = parseFloat(ticker.open);
    copy.high = parseFloat(ticker.high);
    copy.low = parseFloat(ticker.low);
    copy.volume = parseFloat(ticker.volume);
    copy.quoteVolume = parseFloat(ticker.quoteVolume);
    return copy;
}

function startTickerMonitor(monitorId, broadcastLabel, logs) {
    if (!anonymousExchange) return new Error('Exchange Monitor not initialized yet.');
    anonymousExchange.tickerStream(async (markets) => {
        if (logs) logger('M:' + monitorId, markets);

        try {
            markets.map(mkt => hydra.updateMemory(mkt.symbol, indexKeys.TICKER, null, convertTicker(mkt)));

            const obj = {};
            markets.map(mkt => obj[mkt.symbol] = mkt);
            if (broadcastLabel && WSS) WSS.broadcast({ [broadcastLabel]: obj });

            //simulação de book
            const books = markets.map(mkt => {
                const book = { symbol: mkt.symbol, bestAsk: mkt.close, bestBid: mkt.close };
                hydra.updateMemory(mkt.symbol, indexKeys.BOOK, null, book);
                return book;
            })

            if (WSS) WSS.broadcast({ book: books });
            //fim simulação de book
        } catch (err) {
            if (logs) logger('M:' + monitorId, err)
        }
    })
    logger('M:' + monitorId, 'Ticker Monitor has started!');
}

let book = [];
function startBookMonitor(monitorId, broadcastLabel, logs) {
    if (!anonymousExchange) return new Error('Exchange Monitor not initialized yet.');
    anonymousExchange.bookStream(async (order) => {
        if (logs) logger('M:' + monitorId, order);

        try {
            if (book.length === 200) {
                if (broadcastLabel && WSS) WSS.broadcast({ [broadcastLabel]: book });
                book = [];
            }
            else book.push({ ...order });

            hydra.updateMemory(order.symbol, indexKeys.BOOK, null, order);
        } catch (err) {
            if (logs) logger('M:' + monitorId, err);
        }
    })
    logger('M:' + monitorId, 'Book Monitor has started!');
}

async function loadWallet(user, executeAutomations = true) {
    const exchange = new Exchange(user);

    try {
        const info = await exchange.balance();

        const wallet = Object.entries(info).map(async (item) => {
            hydra.updateMemory(item[0], `${indexKeys.WALLET}_${user.id}`, null, parseFloat(item[1].available), executeAutomations);

            return {
                symbol: item[0],
                available: item[1].available,
                onOrder: item[1].onOrder
            }
        })
        return Promise.all(wallet);
    } catch (err) {
        throw new Error(err.body ? JSON.stringify(err.body) : err.message);//evita 401 da Binance
    }
}

function stopUserDataMonitor(user, monitorId, logs) {
    const exchange = EXCHANGES[user.id];
    if (!exchange) return;

    exchange.terminateUserDataStream();
    if (logs) logger(`M:${monitorId}-${user.id}`, `User Data Monitor ${monitorId}-${user.id} stopped!`);

    hydra.clearWallet(user.id);
}

function stopFuturesMonitor(user, monitorId, logs) {
    const exchange = EXCHANGES['F' + user.id];
    if (!exchange) return;

    exchange.terminateFuturesUserDataStream();
    if (logs) logger(`M:${monitorId}-${user.id}`, `Futures User Data Monitor ${monitorId}-${user.id} stopped!`);

    hydra.clearWallet(user.id);
}

function notifyOrderUpdate(userId, order) {
    let type = '';
    switch (order.status) {
        case 'FILLED': type = 'success'; break;
        case 'REJECTED':
        case 'CANCELED':
        case 'NEW_INSURANCE':
        case 'NEW_ADL':
        case 'EXPIRED': type = 'error'; break;
        default: type = 'info'; break;
    }

    sendMessage(userId, { notification: { text: `Order #${order.orderId} was updated as ${order.status}`, type } });
}

function processExecutionData(userId, monitorId, executionData, broadcastLabel) {
    if (executionData.x === orderStatus.NEW) return;//ignora as novas, pois podem ter vindo de outras fontes

    const order = {
        symbol: executionData.s,
        orderId: executionData.i,
        clientOrderId: executionData.X === orderStatus.CANCELED ? executionData.C : executionData.c,
        side: executionData.S,
        type: executionData.o,
        status: executionData.X,
        isMaker: executionData.m,
        transactTime: executionData.T
    }

    if (order.status === orderStatus.FILLED) {
        const quoteAmount = parseFloat(executionData.Z);
        order.avgPrice = quoteAmount / parseFloat(executionData.z);
        order.commission = executionData.n;
        order.quantity = executionData.q;
        const isQuoteCommission = executionData.N && order.symbol.endsWith(executionData.N);
        order.net = isQuoteCommission ? quoteAmount - parseFloat(order.commission) : quoteAmount;
    }

    if (order.status === orderStatus.REJECTED) order.obs = executionData.r;

    scheduleOrderUpdate(order, userId, indexKeys.LAST_ORDER, broadcastLabel, monitorId);
}

async function processBalanceData(user, monitorId, broadcastLabel, logs, data) {
    if (logs) logger(`M:${monitorId}-${user.id}`, data);

    try {
        const wallet = await loadWallet(user, true);
        if (broadcastLabel && WSS) WSS.direct(user.id, { [broadcastLabel]: wallet });
    } catch (err) {
        if (logs) logger(`M:${monitorId}-${user.id}`, err);
    }
}

const EXCHANGES = {};

function startUserDataMonitor(user, monitorId, broadcastLabel, logs) {
    const [balanceBroadcast, executionBroadcast] = broadcastLabel ? broadcastLabel.split(',') : [null, null];

    try {
        loadWallet(user, false);

        const exchange = new Exchange(user, false);
        exchange.userDataStream(data => {
            if (data.e === 'executionReport')
                processExecutionData(user.id, monitorId, data, executionBroadcast);
            else if (data.e === 'balanceUpdate' || data.e === 'outboundAccountPosition')
                processBalanceData(user, monitorId, balanceBroadcast, logs, data)
        })

        EXCHANGES[user.id] = exchange;
        logger(`M:${monitorId}-${user.id}`, 'User Data Monitor has started!');
    }
    catch (err) {
        logger(`M:${monitorId}-${user.id}`, 'User Data Monitor has NOT started!\n' + err.message);
    }
}

async function processChartData(monitorId, symbol, indexes, interval, ohlc, logs) {
    if (typeof indexes === 'string') indexes = indexes.split(',');
    if (!indexes || !Array.isArray(indexes) || indexes.length === 0) return false;

    const calculatedIndexes = {};
    let executeAutomations = false;

    indexes.forEach(index => {
        const params = index.split('_');
        const indexName = params[0];
        params.splice(0, 1);

        try {
            const calc = execCalc(indexName, ohlc, ...params);
            if (logs) logger('M:' + monitorId, `${index}_${interval} calculated: ${JSON.stringify(calc.current ? calc.current : calc)}`);

            calculatedIndexes[index] = calc;
            if (!executeAutomations) executeAutomations = !!calc.current;
        } catch (err) {
            logger('M:' + monitorId, `Exchange Monitor => Can't calc the index ${index}:`);
            logger('M:' + monitorId, err);
            return false;
        }
    })

    return hydra.updateAllMemory(symbol, calculatedIndexes, interval, executeAutomations);
}

function startChartMonitor(userId, monitorId, symbol, interval, indexes, broadcastLabel, logs) {
    if (!symbol) return new Error(`Can't start a Chart Monitor without a symbol.`);
    if (!anonymousExchange) return new Error('Exchange Monitor not initialized yet.');

    anonymousExchange.chartStream(symbol, interval || '1m', async (ohlc) => {

        const lastCandle = {
            open: ohlc.open[ohlc.open.length - 1],
            close: ohlc.close[ohlc.close.length - 1],
            high: ohlc.high[ohlc.high.length - 1],
            low: ohlc.low[ohlc.low.length - 1],
            volume: ohlc.volume[ohlc.volume.length - 1],
            isComplete: ohlc.isComplete
        };

        const previousCandle = {
            open: ohlc.open[ohlc.open.length - 2],
            close: ohlc.close[ohlc.close.length - 2],
            high: ohlc.high[ohlc.high.length - 2],
            low: ohlc.low[ohlc.low.length - 2],
            volume: ohlc.volume[ohlc.volume.length - 2],
            isComplete: true
        };

        const previousPreviousCandle = {
            open: ohlc.open[ohlc.open.length - 3],
            close: ohlc.close[ohlc.close.length - 3],
            high: ohlc.high[ohlc.high.length - 3],
            low: ohlc.low[ohlc.low.length - 3],
            volume: ohlc.volume[ohlc.volume.length - 3],
            isComplete: true
        };

        if (logs) logger('M:' + monitorId, lastCandle);

        try {
            hydra.updateMemory(symbol, indexKeys.PREVIOUS_CANDLE, interval, {
                previous: previousPreviousCandle,
                current: previousCandle
            });

            hydra.updateMemory(symbol, indexKeys.LAST_CANDLE, interval, {
                previous: previousCandle,
                current: lastCandle
            });
            if (broadcastLabel && WSS) WSS.direct(userId, { [broadcastLabel]: lastCandle });

            processChartData(monitorId, symbol, indexes, interval, ohlc, logs);
        } catch (err) {
            if (logs) logger('M:' + monitorId, err);
        }
    })
    logger('M:' + monitorId, `Chart Monitor has started for ${symbol}_${interval}!`);
}

function stopChartMonitor(monitorId, symbol, interval, indexes, logs) {
    if (!symbol) return new Error(`Can't stop a Chart Monitor without a symbol.`);
    if (!anonymousExchange) return new Error('Exchange Monitor not initialized yet.');
    anonymousExchange.terminateChartStream(symbol, interval);
    if (logs) logger('M:' + monitorId, `Chart Monitor ${symbol}_${interval} stopped!`);

    hydra.deleteMemory(symbol, indexKeys.LAST_CANDLE, interval);

    if (indexes && Array.isArray(indexes))
        indexes.map(ix => hydra.deleteMemory(symbol, ix, interval));
}

function getConnections() {
    return WSS.getConnections();
}

function sendMessage(userId, jsonObject) {
    try {
        if (jsonObject.notification)
            push.send(userId, jsonObject.notification.text, 'Auto Crypto Bot Notification', jsonObject.notification);
    } catch (err) {

    }

    return WSS.direct(userId, jsonObject);
}

function startMarkPriceMonitor(monitorId, interval, broadcastLabel, logs) {
    if (!anonymousExchange) throw new Error('Exchange Monitor not initialized yet!');

    anonymousExchange.markPriceStream(data => {
        if (logs) logger('M:' + monitorId, JSON.stringify(data));

        try {
            if (WSS && broadcastLabel) WSS.broadcast({ [broadcastLabel]: data });
            data.map(obj => hydra.updateMemory(obj.symbol, indexKeys.MARK_PRICE, null, obj, true));
        }
        catch (err) {
            logger('M:' + monitorId, err);
        }

    }, interval)

    logger('M:' + monitorId, `Mark Price Monitor has started!`);
}

function startLiquidationMonitor(monitorId, broadcastLabel, logs) {
    if (!anonymousExchange) throw new Error('Exchange Monitor not initialized yet!');

    anonymousExchange.liquidationStream(data => {
        if (logs) logger('M:' + monitorId, JSON.stringify(data));

        try {
            if (WSS && broadcastLabel) WSS.broadcast({ [broadcastLabel]: data });
            hydra.updateMemory(data.symbol, indexKeys.LAST_LIQ, null, data, true);
        }
        catch (err) {
            logger('M:' + monitorId, err);
        }

    })

    logger('M:' + monitorId, `Liquidation Monitor has started!`);
}

async function loadFuturesWalletAndPositions(user, executeAutomations = true, justPositions = false) {
    const exchange = new Exchange(user, true);

    try {
        const positions = await exchange.futuresPositions();
        if (positions.code !== undefined && positions.code < 0) throw new Error(positions.msg);

        positions.map(item => hydra.updateMemory(item.symbol, `${indexKeys.POSITION}_${user.id}`, null, item, executeAutomations));
        logger(`system`, `Positions loaded for user ${user.id}`);

        if (justPositions) return positions;

        const info = await exchange.futuresBalance();
        if (info.code !== undefined && info.code < 0) throw new Error(info.msg);

        return info.map(item => {
            hydra.updateMemory(item.asset, `${indexKeys.FWALLET}_${user.id}`, null, parseFloat(item.availableBalance), executeAutomations);
            return item;
        })
    }
    catch (err) {
        throw new Error(err.body ? JSON.stringify(err.body) : err.message);
    }
}

async function processFuturesAccountData(user, monitorId, data, broadcastLabel, logs, justPositions = false) {
    if (logs) logger(`M${monitorId}-${user.id}`, data);

    try {
        const wallet = await loadFuturesWalletAndPositions(user, true, justPositions);
        if (WSS && broadcastLabel) WSS.direct({ [broadcastLabel]: wallet });
    }
    catch (err) {
        logger(`M:${monitorId}-${user.id}`, err);
    }
}

async function processFuturesExecutionData(userId, monitorId, executionData, broadcastLabel, logs) {
    if (logs) logger(`M${monitorId}-${userId}`, executionData);

    const orderUpdate = executionData.order;
    if (orderUpdate.orderStatus === orderStatus.NEW) return;

    const order = {
        symbol: orderUpdate.symbol,
        orderId: orderUpdate.orderId,
        clientOrderId: orderUpdate.clientOrderId,
        side: orderUpdate.side,
        type: orderUpdate.orderType,
        status: orderUpdate.orderStatus,
        isMaker: orderUpdate.isMakerSide,
        reduceOnly: orderUpdate.isReduceOnly,
        positionSide: orderUpdate.positionSide,
        transactTime: orderUpdate.orderTradeTime,
        stopPrice: orderUpdate.stopPrice,
        activatePrice: orderUpdate.activationPrice,
        priceRate: orderUpdate.callbackRate
    }

    if (order.status === orderStatus.FILLED) {
        order.avgPrice = parseFloat(orderUpdate.averagePrice);
        order.commission = orderUpdate.commission;
        order.quantity = orderUpdate.orderFilledAccumulatedQuantity;

        const isQuoteCommission = orderUpdate.commissionAsset && order.symbol.endsWith(orderUpdate.commissionAsset);
        const notional = parseFloat(order.quantity) * order.avgPrice;
        order.net = notional - (isQuoteCommission ? parseFloat(order.commission) : 0);
        order.obs = `Profit=${orderUpdate.realizedProfit}. Commission=${orderUpdate.commissionAsset}`;
    }

    if (order.type === 'LIQUIDATION') {
        try {
            let liquidationOrder = await ordersRepository.insertOrder(order);
            liquidationOrder = liquidationOrder.get({ plain: true });
            notifyOrderUpdate(userId, liquidationOrder);
            hydra.updateMemory(order.symbol, `${indexKeys.FLAST_ORDER}_${userId}`, null, liquidationOrder, true);
            if (broadcastLabel && WSS) WSS.direct(userId, { [broadcastLabel]: liquidationOrder });
        }
        catch (err) {
            logger(`M${monitorId}-${userId}`, err);
        }
    } else
        scheduleOrderUpdate(order, userId, indexKeys.FLAST_ORDER, broadcastLabel, monitorId);
}

function scheduleOrderUpdate(order, userId, index, broadcastLabel, monitorId) {
    setTimeout(async () => {
        try {
            const updatedOrder = await ordersRepository.updateOrderByOrderId(order.orderId, order.clientOrderId, order);
            if (updatedOrder) {
                notifyOrderUpdate(userId, order);
                hydra.updateMemory(order.symbol, `${index}_${userId}`, null, updatedOrder.get({ plain: true }));
                if (broadcastLabel && WSS) WSS.direct(userId, { [broadcastLabel]: order });
            }
        } catch (err) {
            logger(`M:${monitorId}-${userId}`, err);
        }
    }, 3000)
}

function startFuturesMonitor(user, monitorId, broadcastLabel, logs) {
    const [marginBroadcast, balanceBroadcast, executionBroadcast] = broadcastLabel ? broadcastLabel.split(',') : [null, null, null];

    try {
        loadFuturesWalletAndPositions(user, false, false);

        const exchange = new Exchange(user, true);
        exchange.futuresUserDataStream(
            data => processFuturesAccountData(user, monitorId, data, marginBroadcast, logs, true),
            data => processFuturesAccountData(user, monitorId, data, balanceBroadcast, logs, false),
            data => processFuturesExecutionData(user.id, monitorId, data, executionBroadcast, logs),
            data => processFuturesAccountData(user, monitorId, data, balanceBroadcast, logs, true)
        )

        EXCHANGES['F' + user.id] = exchange;
        logger(`M${monitorId}-${user.id}`, `Futures Monitor has started for user ${user.id}!`);
    } catch (err) {
        logger(`M${monitorId}-${user.id}`, 'Futures Monitor has NOT started.\n' + err.message);
    }
}

async function init(users, wssInstance, hydraInstance) {
    if (!hydraInstance) throw new Error(`You can't init the Exchange Monitor App without his settings. Check your database and/or startup code.`);

    WSS = wssInstance;
    hydra = hydraInstance;
    anonymousExchange = new Exchange();

    const monitors = await getActiveSystemMonitors();

    const tickerMonitor = monitors.find(m => m.type === monitorTypes.TICKER);
    if (tickerMonitor) startTickerMonitor(tickerMonitor.id, tickerMonitor.broadcastLabel, tickerMonitor.logs);

    const bookMonitor = monitors.find(m => m.type === monitorTypes.BOOK);
    if (bookMonitor) startBookMonitor(bookMonitor.id, bookMonitor.broadcastLabel, bookMonitor.logs);

    const isFuturesEnabled = !!process.env.BINANCE_FAPI_URL;

    if (isFuturesEnabled) {
        const markPriceMonitor = monitors.find(m => m.type === monitorTypes.MARK_PRICE);
        if (markPriceMonitor) startMarkPriceMonitor(markPriceMonitor.id, markPriceMonitor.interval, markPriceMonitor.broadcastLabel, markPriceMonitor.logs);

        const liquidationMonitor = monitors.find(m => m.type === monitorTypes.LIQUIDATION);
        if (liquidationMonitor) startLiquidationMonitor(liquidationMonitor.id, liquidationMonitor.broadcastLabel, liquidationMonitor.logs);
    }

    const userDataMonitor = monitors.find(m => m.type === monitorTypes.USER_DATA);
    const futuresMonitor = isFuturesEnabled ? monitors.find(m => m.type === monitorTypes.FUTURES_DATA) : false;

    if (users) {
        for (let i = 0; i < users.length; i++) {
            const user = users[i];

            setTimeout(async () => {

                if (userDataMonitor && userDataMonitor.isActive) user.monitors.push(userDataMonitor);
                if (futuresMonitor && futuresMonitor.isActive) user.monitors.push(futuresMonitor);

                user.monitors.filter(m => m.isActive).map(m => {
                    setTimeout(() => {
                        switch (m.type) {
                            case monitorTypes.USER_DATA: {
                                if (!user.accessKey || !user.secretKey) return;
                                return startUserDataMonitor(user, m.id, m.broadcastLabel, m.logs);
                            }
                            case monitorTypes.FUTURES_DATA: {
                                if (!user.futuresKey || !user.futuresSecret) return;
                                return startFuturesMonitor(user, m.id, m.broadcastLabel, m.logs);
                            }
                            case monitorTypes.CANDLES:
                                return startChartMonitor(user.id, m.id, m.symbol, m.interval, m.indexes ? m.indexes.split(',') : [], m.broadcastLabel, m.logs);
                        }
                    }, 250)//Binance only permits 5 commands / second
                })

                logger('system', 'Loading Spot Last Orders...');
                const lastOrders = await ordersRepository.getLastFilledOrders(user.id, false);
                await Promise.all(lastOrders.map(order => hydra.updateMemory(order.symbol, `${indexKeys.LAST_ORDER}_${user.id}`, null, order, false)));

                if (isFuturesEnabled) {
                    logger('system', 'Loading Futures Last Orders...');
                    const fLastOrders = await ordersRepository.getLastFilledOrders(user.id, true);
                    await Promise.all(fLastOrders.map(order => hydra.updateMemory(order.symbol, `${indexKeys.FLAST_ORDER}_${user.id}`, null, order, false)));
                }
            }, i * (user.monitors.length + 1) * 250)
        }
    }

    logger('system', 'App Exchange Monitor is running!');
}

module.exports = {
    init,
    startChartMonitor,
    stopChartMonitor,
    startUserDataMonitor,
    stopUserDataMonitor,
    loadWallet,
    loadFuturesWalletAndPositions,
    getConnections,
    sendMessage,
    startFuturesMonitor,
    stopFuturesMonitor
}
