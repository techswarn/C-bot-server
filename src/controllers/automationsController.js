const automationsRepository = require('../repositories/automationsRepository');
const actionsRepository = require('../repositories/actionsRepository');
const gridsRepository = require('../repositories/gridsRepository');
const orderTemplatesRepository = require('../repositories/orderTemplatesRepository');
const backtestsRepository = require('../repositories/backtestsRepository');
const usersRepository = require('../repositories/usersRepository');
const ordersRepository = require('../repositories/ordersRepository');
const symbolsRepository = require('../repositories/symbolsRepository');
const strategiesRepository = require('../repositories/strategiesRepository');
const hydra = require('../hydra');
const agenda = require('../agenda');
const db = require('../db');
const logger = require('../utils/logger');
const { indexKeys, execCalc } = require('../utils/indexes');
const Exchange = require('../utils/exchange');
const fs = require('fs');
const path = require('path');

function validateConditions(conditions) {
    return /^(MEMORY\[\'.+?\'\](\..+)?[><=!]+([0-9\.\-]+|(\'.+?\')|true|false|MEMORY\[\'.+?\'\](\..+)?)( && )?)+$/ig.test(conditions);
}

async function startAutomationExecution(automation) {
    automation.isActive = true;

    if (automation.schedule)
        agenda.addSchedule(automation.get({ plain: true }));
    else
        hydra.updateBrain(automation.get({ plain: true }));

    await automation.save();

    if (automation.logs) logger('A:' + automation.id, `Automation ${automation.name} has started!`);

    return automation;
}

async function stopAutomationExecution(automation) {
    if (automation.schedule)
        agenda.cancelSchedule(automation.id);
    else
        hydra.deleteBrain(automation.get({ plain: true }));

    automation.isActive = false;
    await automation.save();

    if (automation.logs) logger('A:' + automation.id, `Automation ${automation.name} has stopped!`);

    return automation;
}

async function startAutomation(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const automation = await automationsRepository.getAutomation(id);
    if (!automation) return res.sendStatus(404);
    if (automation.userId !== userId) return res.sendStatus(403);
    if (automation.isActive) return res.sendStatus(204);

    await startAutomationExecution(automation);

    res.json(automation);
}

async function stopAutomation(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const automation = await automationsRepository.getAutomation(id);
    if (!automation) return res.sendStatus(404);
    if (automation.userId !== userId) return res.sendStatus(403);
    if (!automation.isActive) return res.sendStatus(204);

    await stopAutomationExecution(automation);

    res.json(automation);
}

async function getAutomation(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const automation = await automationsRepository.getAutomation(id);
    if (!automation) return res.sendStatus(404);
    if (automation.userId !== userId) return res.sendStatus(403);
    res.json(automation);
}

async function getAutomations(req, res, next) {
    const userId = res.locals.token.id;
    const page = req.query.page;
    const symbol = req.query.symbol;

    let result;
    if (symbol)
        result = await automationsRepository.getAutomationsBySymbol(userId, symbol);
    else
        result = await automationsRepository.getAutomations(userId, page);
    res.json(result);
}

async function getAllAutomations(req, res, next) {
    const userId = res.locals.token.id;
    const result = await automationsRepository.getAllAutomations(userId);
    res.json(result);
}

async function saveAutomation(newAutomation, levels, quantity, transaction) {
    const savedAutomation = await automationsRepository.insertAutomation(newAutomation, transaction);

    //inserting actions
    const actions = newAutomation.actions.map(a => {
        a.automationId = savedAutomation.id;
        delete a.id;
        return a;
    })
    await actionsRepository.insertActions(actions, transaction);

    //inserting grids
    if (levels && quantity)
        await hydra.generateGrids(savedAutomation, levels, quantity, transaction);

    return savedAutomation;
}

async function insertAutomation(req, res, next) {
    const userId = res.locals.token.id;

    const newAutomation = req.body;
    newAutomation.userId = userId;

    const { quantity, levels } = req.query;

    if (!validateConditions(newAutomation.conditions) && !newAutomation.schedule)
        return res.status(400).json('You need to have at least one condition per automation!');

    if (!newAutomation.actions || newAutomation.actions.length < 1)
        return res.status(400).json('You need to have at least one action per automation!');

    const isGrid = newAutomation.actions[0].type === actionsRepository.actionTypes.GRID;
    if (isGrid) {
        if (!quantity || !levels)
            return res.status(400).json('Invalid grid params!');

        const exists = await automationsRepository.gridExists(userId, newAutomation.name);
        if (exists) return res.status(409).json(`A grid for ${newAutomation.symbol} already exists!`);
    }
    else {
        const exists = await automationsRepository.automationExists(userId, newAutomation.name);
        if (exists) return res.status(409).json(`The automation ${newAutomation.name} already exists!`);
    }

    const user = await usersRepository.getUser(userId, true);
    if (user.automations.length >= user.limit.maxAutomations)
        return res.status(409).send(`You have reached the max automations in your plan.`);

    const transaction = await db.transaction();
    let savedAutomation;

    try {
        savedAutomation = await saveAutomation(newAutomation, levels, quantity, transaction)

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        logger('system', err);
        return res.status(500).json(err.message);
    }

    savedAutomation = await automationsRepository.getAutomation(savedAutomation.id);

    if (savedAutomation.isActive) {
        if (savedAutomation.schedule) {
            try {
                agenda.addSchedule(savedAutomation.get({ plain: true }));
            } catch (err) {
                return res.status(422).json(err.message);
            }
        }
        else
            hydra.updateBrain(savedAutomation.get({ plain: true }));
    }

    res.status(201).json(savedAutomation);
}

async function updateAutomation(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const newAutomation = req.body;
    newAutomation.userId = userId;

    const { quantity, levels } = req.query;

    if (!validateConditions(newAutomation.conditions) && !newAutomation.schedule)
        return res.status(400).json('You need to have at least one condition per automation!');

    if (!newAutomation.actions || !newAutomation.actions.length)
        return res.status(400).json('You need to have at least one action per automation!');

    const isGrid = newAutomation.actions[0].type === actionsRepository.actionTypes.GRID;
    if (isGrid && (!quantity || !levels))
        return res.status(400).json('Invalid grid params!');

    let actions = newAutomation.actions.map(a => {
        a.automationId = id;
        delete a.id;
        return a;
    })

    const transaction = await db.transaction();
    const currentAutomation = await automationsRepository.getAutomation(id);//uso mais tarde, no stop
    if (!currentAutomation) return res.sendStatus(404);
    if (currentAutomation.userId !== userId) return res.sendStatus(403);
    let updatedAutomation;

    try {
        updatedAutomation = await automationsRepository.updateAutomation(id, newAutomation);

        if (isGrid)
            await hydra.generateGrids(updatedAutomation, levels, quantity, transaction);
        else {
            await actionsRepository.deleteActions(id, transaction);
            actions = await actionsRepository.insertActions(actions, transaction);
        }

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        logger('system', err);
        return res.status(500).json(err.message);
    }

    updatedAutomation = await automationsRepository.getAutomation(id);//pega limpo

    if (updatedAutomation.isActive) {
        if (updatedAutomation.schedule) {
            try {
                agenda.cancelSchedule(updatedAutomation.id);
                agenda.addSchedule(updatedAutomation.get({ plain: true }));
            } catch (err) {
                return res.status(422).json(err.message);
            }
        } else {
            hydra.deleteBrain(currentAutomation);
            hydra.updateBrain(updatedAutomation.get({ plain: true }));
        }
    }
    else {
        if (updatedAutomation.schedule)
            agenda.cancelSchedule(updatedAutomation.id);
        else
            hydra.deleteBrain(currentAutomation);
    }

    res.json(updatedAutomation);
}

async function deleteAutomation(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const currentAutomation = await automationsRepository.getAutomation(id);
    if (!currentAutomation) return res.sendStatus(404);
    if (currentAutomation.userId !== userId) return res.sendStatus(403);

    const strategies = await strategiesRepository.strategiesWithAutomation(id);
    if (strategies) return res.status(409).json(`Can't delete automation. It is used by a strategy.`);

    if (currentAutomation.isActive) {
        if (currentAutomation.schedule)
            agenda.cancelSchedule(currentAutomation.id);
        else
            hydra.deleteBrain(currentAutomation);
    }

    const transaction = await db.transaction();

    try {
        await ordersRepository.removeAutomationFromOrders(id, transaction);

        if (currentAutomation.actions[0].type === actionsRepository.actionTypes.GRID) {
            await gridsRepository.deleteGrids(id, transaction);
            await orderTemplatesRepository.deleteOrderTemplatesByGridName(userId, currentAutomation.name, transaction);
        }

        await actionsRepository.deleteActions(id, transaction);
        await automationsRepository.deleteAutomation(id, transaction);
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        logger('system', err);
        return res.status(500).json(err.message);
    }

    res.sendStatus(204);
}

function getIntervalInMs(interval) {
    switch (interval) {
        case "3m": return 180000;
        case "5m": return 300000;
        case "15m": return 900000;
        case "30m": return 1800000;
        case "1h": return 3600000;
        case "2h": return 7200000;
        case "4h": return 14400000;
        case "6h": return 21600000;
        case "8h": return 28800000;
        case "12h": return 43200000;
        case "1d": return 86400000;
        case "3d": return 259200000;
        case "1w": return 604800000;
        case "1M": return 2592000000;
        default: return 60000;//1m
    }
}

function getShortestInterval(indexes) {
    if (!indexes || !indexes.length) return "1m";

    const allIntervals = indexes.map(ix => {
        if ([indexKeys.FLAST_ORDER, indexKeys.LAST_ORDER, indexKeys.WALLET].some(uix => new RegExp(`^([A-Z]+:${uix})`).test(ix)))
            return false;

        const ixSplit = ix.split('_');
        if (ixSplit.length > 1) return ixSplit[ixSplit.length - 1];//pega o último, que é onde fica o intervalo
        return false;
    })
    .filter(ix => ix);

    if(!allIntervals || !allIntervals.length) return "1m";

    return allIntervals.sort((a, b) => {//LAST_ORDER, WALLET
        const aMs = getIntervalInMs(a);
        const bMs = getIntervalInMs(b);

        if (aMs > bMs) return 1;
        else if (aMs < bMs) return -1;
        return 0;
    })[0];
}

const CANDLES_PAGE_SIZE = 1000;

async function getCandles(symbol, interval, startTime, endTime) {

    if (!symbol || !interval || !startTime || !endTime) throw new Error(`All parameters are required to get candles for backtest.`)

    const fileName = path.resolve("candles", `${symbol}-${interval}-${startTime}-${endTime}.json`);
    if (fs.existsSync(fileName)) return JSON.parse(fs.readFileSync(fileName));

    const exchange = new Exchange();

    const intervalMs = getIntervalInMs(interval);
    const timeSpan = endTime - startTime;
    if (timeSpan < intervalMs) throw new Error(`Timespan less than interval. Can't get candles this way.`);
    const numberOfCandles = Math.ceil(timeSpan / intervalMs);
    const numberOfCalls = Math.ceil(numberOfCandles / CANDLES_PAGE_SIZE);

    let iterationEnd = 0;
    const results = [];

    for (let i = 0; i < numberOfCalls; i++) {
        iterationEnd = startTime + (intervalMs * CANDLES_PAGE_SIZE);
        results.push(await exchange.candles(symbol, interval || "1m", startTime, iterationEnd, numberOfCandles));
        startTime = iterationEnd + 1;
    }

    const ohlc = results[0];
    for (let i = 1; i < results.length; i++) {
        ohlc.open.push(...results[i].open);
        ohlc.close.push(...results[i].close);
        ohlc.high.push(...results[i].high);
        ohlc.low.push(...results[i].low);
        ohlc.volume.push(...results[i].volume);
        ohlc.time.push(...results[i].time);
    }

    for (let i = 0; i < ohlc.open.length; i++) {
        if (ohlc.time[i] > endTime) {
            ohlc.open = ohlc.open.slice(0, i);
            ohlc.close = ohlc.close.slice(0, i);
            ohlc.low = ohlc.low.slice(0, i);
            ohlc.high = ohlc.high.slice(0, i);
            ohlc.volume = ohlc.volume.slice(0, i);
            ohlc.time = ohlc.time.slice(0, i);
            break;
        }
    }

    fs.writeFileSync(fileName, JSON.stringify(ohlc));

    return ohlc;
}

async function backtestIndexes(indexes, ohlc, userId, symbol, interval) {
    const calculatedIndexes = {};
    let executeAutomations = false;

    const ignoredIndexes = [
        `${indexKeys.WALLET}_${userId}`,
        `${indexKeys.FWALLET}_${userId}`,
        `${indexKeys.POSITION}_${userId}`,
        `${symbol}:${indexKeys.LAST_ORDER}_${userId}`,
        `${symbol}:${indexKeys.FLAST_ORDER}_${userId}`,
        `${symbol}:${indexKeys.LAST_CANDLE}_${interval}`,
        `${symbol}:${indexKeys.PREVIOUS_CANDLE}_${interval}`,
        `${symbol}:${indexKeys.TICKER}`,
        `${symbol}:${indexKeys.MARK_PRICE}`,
        `${symbol}:${indexKeys.LAST_LIQ}`,
        `${symbol}:${indexKeys.BOOK}`
    ]

    for (let i = 0; i < indexes.length; i++) {
        const index = indexes[i]; //BTCUSDT:RSI_14_1m
        if (ignoredIndexes.some(ix => index.indexOf(ix) !== -1)) continue;

        const params = index.split('_');
        const interval = params[params.length - 1];
        const indexName = index.split(':')[1].replace('_' + interval, '');

        params.splice(0, 1);
        params.splice(params.length - 1, 1);

        try {
            const calc = execCalc(indexName.split('_')[0], ohlc, ...params);
            calc.time = ohlc.time[ohlc.time.length - 1];

            calculatedIndexes[indexName] = calc;
            if (!executeAutomations) executeAutomations = !!calc.current;
        }
        catch (err) {
            console.error(err);
            continue;
        }
    }

    return hydra.updateAllMemory(symbol, calculatedIndexes, interval, executeAutomations, userId);
}

async function backtestCandle(i, ohlc, userId, indexes, symbol, interval) {
    const lastCandle = {
        open: ohlc.open[i],
        close: ohlc.close[i],
        high: ohlc.high[i],
        low: ohlc.low[i],
        volume: ohlc.volume[i],
        time: ohlc.time[i],
        isComplete: true
    }

    const previousCandle = {
        open: ohlc.open[i - 1],
        close: ohlc.close[i - 1],
        high: ohlc.high[i - 1],
        low: ohlc.low[i - 1],
        volume: ohlc.volume[i - 1],
        time: ohlc.time[i - 1],
        isComplete: true
    }

    const previousPreviousCandle = {
        open: ohlc.open[i - 2],
        close: ohlc.close[i - 2],
        high: ohlc.high[i - 2],
        low: ohlc.low[i - 2],
        volume: ohlc.volume[i - 2],
        time: ohlc.time[i - 2],
        isComplete: true
    }

    const processed = {
        open: ohlc.open.slice(0, i + 1),
        close: ohlc.close.slice(0, i + 1),
        high: ohlc.high.slice(0, i + 1),
        low: ohlc.low.slice(0, i + 1),
        volume: ohlc.volume.slice(0, i + 1),
        time: ohlc.time.slice(0, i + 1)
    }

    const lastBook = {
        bestBid: lastCandle.close,
        bestAsk: lastCandle.close + 0.00000001,
        time: lastCandle.time
    }

    const results = [];
    let resultBook = await hydra.updateMemory(symbol, indexKeys.BOOK, null, lastBook, true, userId);
    resultBook = resultBook ? resultBook.filter(r => r) : false;
    if (resultBook && resultBook.length) {
        logger(`backtest-${userId}`, resultBook);
        results.push(...resultBook);
    }

    let tickerResult = await hydra.updateMemory(symbol, indexKeys.TICKER, null, lastCandle, true, userId);
    tickerResult = tickerResult ? tickerResult.filter(r => r) : false;
    if (tickerResult && tickerResult.length) {
        logger(`backtest-${userId}`, tickerResult);
        results.push(...tickerResult);
    }

    let previousCandleResult = await hydra.updateMemory(symbol, indexKeys.PREVIOUS_CANDLE, interval, {
        previous: previousPreviousCandle,
        current: previousCandle
    }, true, userId);
    previousCandleResult = previousCandleResult ? previousCandleResult.filter(r => r) : false;
    if (previousCandleResult && previousCandleResult.length) {
        logger(`backtest-${userId}`, previousCandleResult);
        results.push(...previousCandleResult);
    }

    let lastCandleResult = await hydra.updateMemory(symbol, indexKeys.LAST_CANDLE, interval, {
        previous: previousCandle,
        current: lastCandle
    }, true, userId);
    lastCandleResult = lastCandleResult ? lastCandleResult.filter(r => r) : false;
    if (lastCandleResult && lastCandleResult.length) {
        logger(`backtest-${userId}`, lastCandleResult);
        results.push(...lastCandleResult);
    }

    let indexesResults = await backtestIndexes(indexes, processed, userId, symbol, interval);

    indexesResults = indexesResults ? indexesResults.flat().filter(r => r) : false;

    if (indexesResults && indexesResults.length) {
        logger(`backtest-${userId}`, indexesResults);
        results.push(...indexesResults);
    }

    return results.length ? results : false;
}

async function doBacktest(req, res, next) {
    const userId = res.locals.token.id;
    const { startTime, endTime, startBase, startQuote, automationIds } = req.body;

    if (startTime >= endTime) return res.status(422).json(`The start time mus be less than end time.`);

    const user = await usersRepository.getUserDecrypted(userId, true);
    if (!user) return res.status(404).send(`User not found!`);

    //verificando limite de backtests no mês
    const refDate = new Date();
    const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
    const backtestQty = await backtestsRepository.getBacktestsQty(userId, startOfMonth, new Date());
    if (backtestQty >= user.limit.maxBacktests) return res.status(409).send(`Max. backtests reached in this month!`);

    let automations = await automationsRepository.getAutomationsById(automationIds, userId);

    automations = automations.map(automation => {
        const a = automation.get({ plain: true });
        a.test = true;
        return a;
    })

    const symbol = await symbolsRepository.getSymbol(automations[0].symbol);

    let indexes = new Set(automations.map(a => a.indexes).reduce((a, b) => a + ',' + b).split(','));
    indexes = [...indexes];

    const interval = getShortestInterval(indexes);

    let backtest = {
        symbol: symbol.symbol,
        userId,
        startDate: new Date(startTime),
        endDate: new Date(endTime),
        startBase,
        startQuote,
        description: automations.map(a => a.id).reduce((a, b) => a + "," + b)
    }

    await hydra.initTest(user, symbol, automations);

    const ohlc = await getCandles(symbol.symbol, interval, startTime, endTime || Date.now());

    //carregando saldo fake na carteira
    await hydra.updateMemory(symbol.base, `WALLET_${userId}`, null, parseFloat(startBase), false, userId);
    await hydra.updateMemory(symbol.quote, `WALLET_${userId}`, null, parseFloat(startQuote), false, userId);

    let results = [];

    for (let i = 0; i < ohlc.open.length; i++) {
        let partialResult = await backtestCandle(i, ohlc, userId, indexes, symbol.symbol, interval);

        if (partialResult && partialResult.length) {
            partialResult = partialResult.filter(r => r);

            const promises = partialResult.map(r => {
                return hydra.updateMemory(symbol.symbol, `LAST_ORDER_${userId}`, null, r, true, userId);
            })
            partialResult.push(await Promise.all(promises));

            results.push(...partialResult.flat());
        }
    }
    results = results.flat().filter(r => r);

    backtest.endBase = await hydra.getMemory(symbol.base, `WALLET_${userId}`, null, userId);
    backtest.endQuote = await hydra.getMemory(symbol.quote, `WALLET_${userId}`, null, userId);
    backtest.quotePerc = (backtest.endQuote - backtest.startQuote) * 100 / backtest.startQuote;
    backtest.basePerc = (backtest.endBase - backtest.startBase) * 100 / backtest.startBase;

    hydra.endTest(userId);

    let savedBacktest = await backtestsRepository.insertBacktest(backtest);
    savedBacktest = savedBacktest.get({ plain: true });
    savedBacktest.operations = results.length;
    savedBacktest.buys = results.filter(r => r.side === 'BUY').length;
    savedBacktest.sells = results.filter(r => r.side === 'SELL').length;
    savedBacktest.results = results;

    res.status(201).json(savedBacktest);
}

module.exports = {
    startAutomation,
    stopAutomation,
    getAutomation,
    getAutomations,
    insertAutomation,
    updateAutomation,
    deleteAutomation,
    getAllAutomations,
    doBacktest,
    startAutomationExecution,
    stopAutomationExecution,
    saveAutomation
}
