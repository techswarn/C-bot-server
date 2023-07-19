const db = require('../db');
const logger = require('../utils/logger');

const strategiesRepository = require('../repositories/strategiesRepository');
const usersRepository = require('../repositories/usersRepository');
const automationsRepository = require('../repositories/automationsRepository');
const monitorsRepository = require('../repositories/monitorsRepository');
const orderTemplatesRepository = require('../repositories/orderTemplatesRepository');
const withdrawTemplatesRepository = require('../repositories/withdrawTemplatesRepository');
const actionsRepository = require('../repositories/actionsRepository');

const monitorsController = require('./monitorsController');
const automationsController = require('./automationsController');

async function getStrategies(req, res, next) {
    const userId = res.locals.token.id;
    const page = req.query.page;
    const symbol = req.query.symbol;

    let result;
    if (symbol)
        result = await strategiesRepository.getStrategiesBySymbol(userId, symbol, page);
    else
        result = await strategiesRepository.getStrategies(userId, page);
    res.json(result);
}

async function getSharedStrategies(req, res, next) {

    const userId = res.locals.token.id;
    const page = req.query.page || 1;
    const symbol = req.query.symbol || '';
    const includePublic = req.query.public ? req.query.public === 'true' : true;

    const user = await usersRepository.getUser(userId, false);

    const result = await strategiesRepository.getSharedStrategies(userId, user.email, includePublic, symbol, page);

    res.json(result);
}

async function startStrategyComponents(strategy) {
    const monitor = await monitorsRepository.getMonitor(strategy.monitorId);
    if (!monitor.isSystemMon)
        monitorsController.startMonitorExecution(monitor);

    const buyAutomation = await automationsRepository.getAutomation(strategy.buyAutomationId);
    automationsController.startAutomationExecution(buyAutomation);

    if (strategy.buyAutomationId !== strategy.sellAutomationId) {
        const sellAutomation = await automationsRepository.getAutomation(strategy.sellAutomationId);
        automationsController.startAutomationExecution(sellAutomation);
    }
}

async function stopStrategyComponents(strategy) {
    const monitor = await monitorsRepository.getMonitor(strategy.monitorId);
    if (!monitor.isSystemMon)
        monitorsController.stopMonitorExecution(monitor);

    automationsController.stopAutomationExecution(strategy.buyAutomation);

    if (strategy.buyAutomationId !== strategy.sellAutomationId)
        automationsController.stopAutomationExecution(strategy.sellAutomation);
}

async function insertStrategy(req, res, next) {
    const userId = res.locals.token.id;
    const newStrategy = req.body;
    newStrategy.userId = userId;

    if (newStrategy.isActive)
        newStrategy.startedAt = new Date();
    else
        newStrategy.startedAt = null;

    const strategy = await strategiesRepository.insertStrategy(newStrategy);

    if (strategy.isActive) {
        startStrategyComponents(strategy);
    }

    res.status(201).json(strategy.get({ plain: true }));
}

async function updateStrategy(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const newStrategy = req.body;
    newStrategy.userId = userId;

    const currentStrategy = await strategiesRepository.getStrategy(id);
    if (currentStrategy.userId !== userId) return res.sendStatus(403);

    const updatedStrategy = await strategiesRepository.updateStrategy(id, newStrategy);

    if (currentStrategy.isActive)
        await stopStrategyComponents(currentStrategy);

    if (updatedStrategy.isActive)
        await startStrategyComponents(updatedStrategy);

    res.json(updatedStrategy);
}

async function deleteStrategy(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const currentStrategy = await strategiesRepository.getStrategy(id);
    if (currentStrategy.userId !== userId) return res.sendStatus(403);

    if (currentStrategy.isActive)
        stopStrategyComponents(currentStrategy);

    await strategiesRepository.deleteStrategy(id);

    res.sendStatus(204);
}

async function startStrategy(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const strategy = await strategiesRepository.getStrategy(id);
    if (strategy.userId !== userId) return res.sendStatus(403);
    if (strategy.isActive) return res.sendStatus(204);

    startStrategyComponents(strategy);

    strategy.isActive = true;
    strategy.startedAt = new Date();
    await strategy.save();

    res.json(strategy);
}

async function stopStrategy(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const strategy = await strategiesRepository.getStrategy(id);
    if (strategy.userId !== userId) return res.sendStatus(403);
    if (!strategy.isActive) return res.sendStatus(204);

    stopStrategyComponents(strategy);

    strategy.isActive = false;
    strategy.startedAt = null;
    await strategy.save();

    res.json(strategy);
}

async function copyMonitor(monitor, userId, transaction) {
    monitor = monitor.get ? monitor.get({ plain: true }) : monitor;

    if (["CANDLES", "TICKER"].includes(monitor.type)) {
        let monitorCopy = { ...monitor };
        delete monitorCopy.id;
        monitorCopy.userId = userId;
        monitorCopy.isActive = false;

        monitorCopy = await monitorsRepository.insertMonitor(monitorCopy, transaction);
        return monitorCopy.id;
    }

    return monitor.id;
}

async function copyAutomation(automation, userId, transaction) {
    automation = automation.get ? automation.get({ plain: true }) : automation;

    const promises = automation.actions.map(async (action) => {
        if (action.orderTemplateId) {
            let ot = { ...action.orderTemplate };
            delete ot.id;
            ot.userId = userId;
            ot = await orderTemplatesRepository.insertOrderTemplate(ot, transaction);
            action.orderTemplateId = ot.id;
        }
        else if (action.withdrawTemplateId) {
            let wt = { ...action.withdrawTemplate };
            delete wt.id;
            wt.userId = userId;
            wt = await withdrawTemplatesRepository.insertWithdrawTemplate(wt, transaction);
            action.withdrawTemplateId = wt.id;
        }

        return action;
    })

    automation.actions = await Promise.all(promises);

    let automationCopy = {
        name: automation.name,
        symbol: automation.symbol,
        conditions: automation.conditions,
        indexes: automation.indexes,
        schedule: automation.schedule,
        isActive: false,
        logs: false,
        userId,
        actions: automation.actions
    }

    const isGrid = automationCopy.actions[0].type === actionsRepository.actionTypes.GRID;
    let levels, quantity;
    if (isGrid) {
        levels = automation.grids.length + 1;
        quantity = automation.grids[0].orderTemplate.quantity;
    }
    automation = await automationsController.saveAutomation(automationCopy, levels, quantity, transaction);

    return automation.id;
}

async function copyStrategy(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const user = await usersRepository.getUser(userId, true);
    const strategy = await strategiesRepository.getStrategy(id);
    const sharedWith = strategy.sharedWith ? strategy.sharedWith.split(',') : [];

    if (strategy.sharedWith !== 'everyone' && !sharedWith.includes(user.email)) return res.sendStatus(403);
    if (user.automations.length >= (user.limit.maxAutomations - 1)) return res.status(409).json(`You have reached the max automations in your plan.`);
    if (user.monitors.length >= user.limit.maxMonitors) return res.status(409).json(`You have reached the max monitors in your plan.`);

    let newStrategy = {
        userId,
        buyAutomationId: -1,
        sellAutomationId: -1,
        monitorId: strategy.monitorId,
        startedAt: null,
        sharedWith: null,
        isActive: false,
        symbol: strategy.symbol,
        name: strategy.name
    }

    const transaction = await db.transaction();

    try {

        const monitor = await monitorsRepository.getMonitor(strategy.monitorId);
        newStrategy.monitorId = await copyMonitor(monitor.get({ plain: true }), userId, transaction);

        const buyAutomation = await automationsRepository.getAutomation(strategy.buyAutomationId);
        const buyAutomationId = await copyAutomation(buyAutomation, userId, transaction);
        newStrategy.buyAutomationId = buyAutomationId;

        if (strategy.buyAutomationId !== strategy.sellAutomationId) {
            const sellAutomation = await automationsRepository.getAutomation(strategy.sellAutomationId);
            const sellAutomationId = await copyAutomation(sellAutomation, userId, transaction);
            newStrategy.sellAutomationId = sellAutomationId;
        }
        else newStrategy.sellAutomationId = newStrategy.buyAutomationId;

        await strategiesRepository.insertStrategy(newStrategy, transaction);

        await transaction.commit();
        res.status(201).json(newStrategy);
    }
    catch (err) {
        logger('system', err);
        await transaction.rollback();
        return res.status(500).json(err.message);
    }
}

module.exports = {
    getStrategies,
    insertStrategy,
    updateStrategy,
    deleteStrategy,
    getSharedStrategies,
    startStrategy,
    stopStrategy,
    copyStrategy
}
