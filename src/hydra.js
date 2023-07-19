const { indexKeys } = require('./utils/indexes');
const Beholder = require('./beholder');
const TestCache = require('./utils/testCache');
const Cache = require('./utils/cache');
const logger = require('./utils/logger');
const cache = new Cache();

const LOGS = process.env.HYDRA_LOGS === 'true';

let BEHOLDERS = {};

let TEST_BEHOLDERS = {};

function getLightBook(order) {
    const orderCopy = { ...order };
    delete orderCopy.symbol;
    delete orderCopy.updateId;
    delete orderCopy.bestAskQty;
    delete orderCopy.bestBidQty;
    return orderCopy;
}

async function updateBookMemory(symbol, index, value, executeAutomations = true, testingUserId = false) {
    const orderCopy = getLightBook(value);
    const converted = {};
    Object.entries(orderCopy).map(prop => converted[prop[0]] = parseFloat(prop[1]));

    const currentMemory = await getMemory(symbol, indexKeys.BOOK, testingUserId);

    const newMemory = {};
    newMemory.previous = currentMemory ? currentMemory.current : converted;
    newMemory.current = converted;

    return setCache(symbol, index, null, newMemory, executeAutomations, testingUserId);
}

async function updateTickerMemory(symbol, index, ticker, executeAutomations = true, testingUserId = false) {
    const currentMemory = await getMemory(symbol, indexKeys.TICKER, testingUserId);

    const newMemory = {};
    newMemory.previous = currentMemory ? currentMemory.current : ticker;
    newMemory.current = ticker;

    return setCache(symbol, index, null, newMemory, executeAutomations, testingUserId);
}

function getLightOrder(updatedOrder) {
    let orderCopy = {};
    if (updatedOrder.get)
        orderCopy = updatedOrder.get({ plain: true });
    else
        orderCopy = { ...updatedOrder };

    delete orderCopy.id;
    delete orderCopy.symbol;
    delete orderCopy.automationId;
    delete orderCopy.userId;
    delete orderCopy.orderId;
    delete orderCopy.clientOrderId;
    delete orderCopy.transactTime;
    delete orderCopy.isMaker;
    delete orderCopy.commission;
    delete orderCopy.obs;
    delete orderCopy.automation;
    delete orderCopy.createdAt;
    delete orderCopy.updatedAt;

    orderCopy.limitPrice = orderCopy.limitPrice ? parseFloat(orderCopy.limitPrice) : null;
    orderCopy.stopPrice = orderCopy.stopPrice ? parseFloat(orderCopy.stopPrice) : null;
    orderCopy.avgPrice = orderCopy.avgPrice ? parseFloat(orderCopy.avgPrice) : null;
    orderCopy.priceRate = orderCopy.priceRate ? parseFloat(orderCopy.priceRate) : null;
    orderCopy.activatePrice = orderCopy.activatePrice ? parseFloat(orderCopy.activatePrice) : null;
    orderCopy.net = orderCopy.net ? parseFloat(orderCopy.net) : null;
    orderCopy.quantity = orderCopy.quantity ? parseFloat(orderCopy.quantity) : null;

    return orderCopy;
}

async function setCache(symbol, index, interval, value, executeAutomations = true, testingUserId = false, expireInSeconds = 0) {
    const cacheReference = testingUserId ? TEST_BEHOLDERS[testingUserId] : cache;
    const indexKey = interval ? `${index}_${interval}` : index;
    const memoryKey = `${symbol}:${indexKey}`;

    if (LOGS) logger('hydra', `Hydra memory updated: ${memoryKey} => ${JSON.stringify(value)}, executeAutomations? ${executeAutomations}`);

    return cacheReference.set(memoryKey, value, executeAutomations, expireInSeconds);
}

async function updateAllMemory(symbol, calculatedIndexes, interval, executeAutomations = true, testingUserId = false) {
    const cacheReference = testingUserId ? TEST_BEHOLDERS[testingUserId] : cache;

    const keyValues = {};
    Object.keys(calculatedIndexes).forEach(index => {
        const indexKey = interval ? `${index}_${interval}` : index;
        const memoryKey = `${symbol}:${indexKey}`;
        keyValues[memoryKey] = calculatedIndexes[index];
    })

    try {
        return cacheReference.setAll(keyValues, executeAutomations);
    }
    finally {
        if (LOGS) logger('hydra', `Hydra memory updated: ${symbol}_${interval} => ${JSON.stringify(calculatedIndexes)}, executeAutomations? ${executeAutomations}`);
    }
}

function getLightMarkPrice(data) {
    const dataCopy = { ...data };
    delete dataCopy.symbol;
    delete dataCopy.eventType;
    delete dataCopy.eventTime;
    delete dataCopy.fundingTime;

    dataCopy.markPrice = parseFloat(dataCopy.markPrice);
    dataCopy.indexPrice = parseFloat(dataCopy.indexPrice);
    dataCopy.fundingRate = parseFloat(dataCopy.fundingRate);

    return dataCopy;
}

async function updateMarkPriceMemory(symbol, index, value, executeAutomations = true, testingUserId = false) {
    const dataCopy = getLightMarkPrice(value);
    const currentMemory = await getMemory(symbol, index, null, testingUserId);

    const newMemory = {};
    newMemory.previous = currentMemory ? currentMemory.current : dataCopy;
    newMemory.current = dataCopy;

    return setCache(symbol, index, null, newMemory, executeAutomations, testingUserId);
}

function getLightLiquidation(data) {
    const dataCopy = { ...data };
    delete dataCopy.symbol;
    delete dataCopy.tradeTime;
    delete dataCopy.eventTime;
    delete dataCopy.eventType;
    delete dataCopy.lastFilledQty;

    dataCopy.totalFilledQty = parseFloat(dataCopy.totalFilledQty);
    dataCopy.avgPrice = parseFloat(dataCopy.avgPrice);
    dataCopy.price = parseFloat(dataCopy.price);
    dataCopy.origAmount = parseFloat(dataCopy.origAmount);

    return dataCopy;
}

function getLightPosition(data) {
    return {
        symbol: data.symbol,
        marginType: data.marginType,
        positionSide: data.positionSide,
        positionAmt: parseFloat(data.positionAmt),
        entryPrice: parseFloat(data.entryPrice),
        markPrice: parseFloat(data.markPrice),
        notional: parseFloat(data.notional),
        isolatedWallet: parseFloat(data.isolatedWallet),
        unRealizedProfit: parseFloat(data.unRealizedProfit),
        liquidationPrice: parseFloat(data.liquidationPrice),
        leverage: parseInt(data.leverage),
        maxNotionalValue: parseFloat(data.maxNotionalValue),
        isolatedMargin: parseFloat(data.isolatedMargin),
        isAutoAddMargin: data.isAutoAddMargin === 'true'
    }
}

function updateMemory(symbol, index, interval, value, executeAutomations = true, testingUserId = false, expireInSeconds = 0) {
    if (value === undefined || value === null) return false;
    if (value.toJSON) value = value.toJSON();
    if (value.get) value = value.get({ plain: true });

    if (index === indexKeys.BOOK)
        return updateBookMemory(symbol, index, value, executeAutomations, testingUserId);
    else if (index === indexKeys.MARK_PRICE)
        return updateMarkPriceMemory(symbol, index, value, executeAutomations, testingUserId);
    else if (index === indexKeys.LAST_LIQ)
        return setCache(symbol, index, null, getLightLiquidation(value), executeAutomations, testingUserId);
    else if (index.startsWith(indexKeys.POSITION + "_"))
        return setCache(symbol, index, null, getLightPosition(value), executeAutomations, testingUserId);
    else if (/^(F?LAST_ORDER_\d+)$/.test(index))
        return setCache(symbol, index, interval, getLightOrder(value), executeAutomations, testingUserId);
    else if (index === indexKeys.TICKER)
        return updateTickerMemory(symbol, index, value, executeAutomations, testingUserId);
    else
        return setCache(symbol, index, interval, value, executeAutomations, testingUserId, expireInSeconds);
}

function deleteMemory(symbol, index, interval) {
    const indexKey = interval ? `${index}_${interval}` : index;
    const memoryKey = `${symbol}:${indexKey}`;
    return cache.unset(memoryKey);
}

async function clearWallet(userId) {
    const balances = await cache.search(`*WALLET_${userId}`);
    if (balances && Array.isArray(balances) && balances.length)
        await Promise.all(balances.map(b => cache.unset(b.key)));
}

function getLightAction(a) {
    a = a.toJSON ? a.toJSON() : a;
    delete a.createdAt;
    delete a.updatedAt;
    //delete a.orderTemplate;
    return a;
}

function getLightGrid(g) {
    g = g.toJSON ? g.toJSON() : g;
    delete g.createdAt;
    delete g.updatedAt;
    delete g.automationId;
    if (g.orderTemplate) {
        delete g.orderTemplate.createdAt;
        delete g.orderTemplate.updatedAt;
        delete g.orderTemplate.name;
    }
    return g;
}

function getLightAutomation(automation, actions, grids) {
    if (automation.toJSON)
        automation = automation.toJSON();

    delete automation.createdAt;
    delete automation.updatedAt;

    automation.actions = actions;
    automation.grids = grids;
    return automation;
}

function updateBrain(automation) {

    if (!automation.isActive || !automation.conditions) return;

    const actions = automation.actions ? automation.actions.map(a => getLightAction(a)) : [];

    const grids = automation.grids ? automation.grids.map(g => getLightGrid(g)) : [];

    automation = getLightAutomation(automation, actions, grids);

    const beholder = BEHOLDERS[automation.userId];
    if (!beholder) BEHOLDERS[automation.userId] = new Beholder([]);

    return BEHOLDERS[automation.userId].updateBrain(automation);
}

function deleteBrain(automation) {
    const beholder = BEHOLDERS[automation.userId];
    if (!beholder) return false;

    return BEHOLDERS[automation.userId].deleteBrain(automation);
}

async function generateGrids(automation, levels, quantity, transaction) {
    const beholder = BEHOLDERS[automation.userId];
    if (!beholder) BEHOLDERS[automation.userId] = new Beholder([]);

    return BEHOLDERS[automation.userId].generateGrids(automation, levels, quantity, transaction);
}

async function getMemory(symbolOrKey, index = undefined, interval = undefined, testingUserId = false) {
    const cacheReference = testingUserId ? TEST_BEHOLDERS[testingUserId] : cache;
    if (symbolOrKey && index) {
        const indexKey = interval ? `${index}_${interval}` : index;
        const memoryKey = `${symbolOrKey}:${indexKey}`;
        return cacheReference.get(memoryKey);
    }
    else if (symbolOrKey)
        return cacheReference.get(symbolOrKey);
    else
        return cacheReference.search();
}

function flattenObject(ob) {
    var toReturn = {};

    for (var i in ob) {
        if (!ob.hasOwnProperty(i)) continue;

        if ((typeof ob[i]) == 'object' && ob[i] !== null) {
            var flatObject = flattenObject(ob[i]);
            for (var x in flatObject) {
                if (!flatObject.hasOwnProperty(x)) continue;

                toReturn[i + '.' + x] = flatObject[x];
            }
        } else {
            toReturn[i] = ob[i];
        }
    }
    return toReturn;
}

function getBrainIndexes(userId) {
    const beholder = BEHOLDERS[userId];
    if (!beholder) return null;

    return beholder.getBrainIndexes();
}

function getBrain(userId) {
    const beholder = BEHOLDERS[userId];
    if (!beholder) return null;

    return beholder.getBrain();
}

function getEval(prop) {
    if (prop.indexOf('MEMORY') !== -1) return prop;
    if (prop.indexOf('.') === -1) return `MEMORY['${prop}']`;

    const propSplit = prop.split('.');
    const memKey = propSplit[0];
    const memProp = prop.replace(memKey, '');
    return `MEMORY['${memKey}']${memProp}`;
}

async function getMemoryIndexes() {
    const MEMORY = await getMemory();
    return Object.entries(flattenObject(MEMORY)).map(prop => {
        if (prop[0].indexOf('previous') !== -1 || prop[0].indexOf(':') === -1) return false;
        const propSplit = prop[0].split(':');
        return {
            symbol: propSplit[0],
            variable: propSplit[1].replace('.current', ''),
            eval: getEval(prop[0]),
            example: prop[1]
        }
    })
        .filter(ix => ix)
        .sort((a, b) => {
            if (a.variable < b.variable) return -1;
            if (a.variable > b.variable) return 1;
            return 0;
        })
}

const DOLLAR_COINS = ['USD', 'USDT', 'USDC', 'BUSD'];

async function getStableConversion(baseAsset, quoteAsset, baseQty) {
    if (DOLLAR_COINS.includes(baseAsset)) return baseQty;

    const book = await getMemory(baseAsset + quoteAsset, 'BOOK', null);
    if (book && book.current) return parseFloat(baseQty) * book.current.bestBid;
    return 0;
}

const FIAT_COINS = ['BRL', 'EUR', 'GBP'];

async function getFiatConversion(stableCoin, fiatCoin, fiatQty) {
    const book = await getMemory(stableCoin + fiatCoin, 'BOOK', null);
    if (book && book.current) return parseFloat(fiatQty) / book.current.bestBid;
    return 0;
}

async function searchMemory(regex, testingUserId = false) {
    const MEMORY = await getMemory(null, null, null, testingUserId);
    return Object.entries(MEMORY).filter(prop => regex.test(prop[0])).map(prop => {
        return {
            key: prop[0], value: prop[1]
        }
    });
}

async function tryFiatConversion(baseAsset, baseQty, fiat) {
    if (fiat) fiat = fiat.toUpperCase();
    if (FIAT_COINS.includes(baseAsset) && baseAsset === fiat) return baseQty;

    const usd = tryUsdConversion(baseAsset, baseQty);
    if (fiat === 'USD' || !fiat) return usd;

    let book = getMemory('USDT' + fiat, 'BOOK');
    if (book && book.current) return usd * book.current.bestBid;

    book = getMemory(fiat + 'USDT', 'BOOK');
    if (book && book.current) return usd / book.current.bestBid;

    return usd;
}

async function tryUsdConversion(baseAsset, baseQty) {
    if (DOLLAR_COINS.includes(baseAsset)) return baseQty;
    if (FIAT_COINS.includes(baseAsset)) return getFiatConversion('USDT', baseAsset, baseQty);

    for (let i = 0; i < DOLLAR_COINS.length; i++) {
        const converted = await getStableConversion(baseAsset, DOLLAR_COINS[i], baseQty);
        if (converted > 0) return converted;
    }

    return 0;
}

function evalDecision(memoryKey, automation) {
    const beholder = BEHOLDERS[automation.userId];
    if (!beholder) return false;

    return beholder.evalDecision(memoryKey, automation);
}

async function init(users) {
    await cache.flushAll();

    BEHOLDERS = {};
    users.map(u => {
        BEHOLDERS[u.id] = new Beholder(u.automations.filter(a => a.isActive && !a.schedule));
    })
}

async function initTest(user, symbol, automations) {
    TEST_BEHOLDERS[user.id] = new TestCache(automations, user, symbol);
}

function endTest(userId) {
    delete TEST_BEHOLDERS[userId];
}

module.exports = {
    updateMemory,
    updateAllMemory,
    deleteMemory,
    getMemoryIndexes,
    clearWallet,
    updateBrain,
    deleteBrain,
    generateGrids,
    getMemory,
    getBrainIndexes,
    tryFiatConversion,
    getBrain,
    searchMemory,
    evalDecision,
    init,
    initTest,
    endTest
}
