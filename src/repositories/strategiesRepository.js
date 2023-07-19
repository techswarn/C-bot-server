const { Op } = require("sequelize");
const strategyModel = require('../models/strategyModel');
const AutomationModel = require("../models/automationModel");
const UserModel = require("../models/userModel");
const MonitorModel = require("../models/monitorModel");

async function insertStrategy(newStrategy, transaction) {
    return strategyModel.create(newStrategy, { transaction });
}

function deleteStrategy(id) {
    return strategyModel.destroy({
        where: { id }
    })
}

function deleteAll(userId, transaction) {
    return strategyModel.destroy({
        where: { userId },
        transaction
    })
}

async function updateStrategy(id, newStrategy) {
    const currentStrategy = await getStrategy(id);

    if (newStrategy.name && newStrategy.name !== currentStrategy.name)
        currentStrategy.name = newStrategy.name;

    if (newStrategy.monitorId !== currentStrategy.monitorId)
        currentStrategy.monitorId = newStrategy.monitorId;

    if (newStrategy.buyAutomationId !== currentStrategy.buyAutomationId)
        currentStrategy.buyAutomationId = newStrategy.buyAutomationId;

    if (newStrategy.sellAutomationId !== currentStrategy.sellAutomationId)
        currentStrategy.sellAutomationId = newStrategy.sellAutomationId;

    if (newStrategy.startedAt !== currentStrategy.startedAt)
        currentStrategy.startedAt = newStrategy.startedAt;

    if (newStrategy.sharedWith !== currentStrategy.sharedWith)
        currentStrategy.sharedWith = newStrategy.sharedWith;

    if (newStrategy.isActive !== null && newStrategy.isActive !== undefined
        && newStrategy.isActive !== currentStrategy.isActive)
        currentStrategy.isActive = newStrategy.isActive;

    await currentStrategy.save();
    return currentStrategy;
}

function getStrategy(id) {
    return strategyModel.findByPk(id, {
        include: [
            MonitorModel,
            UserModel,
            { model: AutomationModel, as: 'buyAutomation' },
            { model: AutomationModel, as: 'sellAutomation' }
        ]
    });
}

function getStrategies(userId, page = 1) {
    return strategyModel.findAndCountAll({
        where: { userId },
        order: [['isActive', 'DESC'], ['symbol', 'ASC'], ['name', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1)
    });
}

function getStrategiesBySymbol(userId, symbol, page = 1) {
    const where = symbol.length < 6 ? { userId, symbol: { [Op.like]: `%${symbol}%` } } : { userId, symbol };

    return strategyModel.findAndCountAll({
        where,
        order: [['isActive', 'DESC'], ['symbol', 'ASC'], ['name', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1)
    });
}

function getSharedStrategies(userId, email, includePublic = true, symbol = '', page = 1) {
    //null | undefined | "" | none
    //everyone
    //cyancastle@email.com

    const everyoneFilter = symbol ? { sharedWith: 'everyone', symbol } : { sharedWith: 'everyone' };
    const sharedLike = { [Op.like]: `%${email}%` };
    const emailFilter = symbol ? { sharedWith: sharedLike, symbol } : { sharedWith: sharedLike };

    const where = includePublic
        ? { userId: { [Op.ne]: userId }, [Op.or]: [everyoneFilter, emailFilter] }
        : emailFilter;

    return strategyModel.findAndCountAll({
        where,
        order: [['symbol', 'ASC'], ['name', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1),
        distinct: true,
        include: [
            MonitorModel,
            UserModel,
            { model: AutomationModel, as: 'buyAutomation' },
            { model: AutomationModel, as: 'sellAutomation' }
        ]
    });
}

function strategiesWithAutomation(automationId) {
    return strategyModel.count({
        where: {
            [Op.or]: [{
                buyAutomationId: automationId
            }, {
                sellAutomationId: automationId
            }]
        }
    })
}

function strategiesWithMonitor(monitorId) {
    return strategyModel.count({ where: { monitorId } })
}

module.exports = {
    insertStrategy,
    deleteStrategy,
    deleteAll,
    updateStrategy,
    getStrategy,
    getStrategies,
    getStrategiesBySymbol,
    getSharedStrategies,
    strategiesWithAutomation,
    strategiesWithMonitor
}