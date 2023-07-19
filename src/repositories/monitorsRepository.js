const { Op } = require('sequelize');
const monitorModel = require('../models/monitorModel');

const monitorTypes = {
    TICKER: 'TICKER',
    BOOK: 'BOOK',
    USER_DATA: 'USER_DATA',
    CANDLES: 'CANDLES',
    FUTURES_DATA: 'FUTURES_DATA',
    LIQUIDATION: 'LIQUIDATION',
    MARK_PRICE: 'MARK_PRICE'
}

async function monitorExists(userId, type, symbol, interval) {
    const count = await monitorModel.count({ where: { userId, type, symbol, interval } });
    return count > 0;
}

async function insertMonitor(newMonitor, transaction) {
    return monitorModel.create(newMonitor, { transaction });
}

function deleteMonitor(id) {
    return monitorModel.destroy({
        where: { id, isSystemMon: false }
    })
}

async function updateMonitor(id, newMonitor) {
    const currentMonitor = await getMonitor(id);

    if (newMonitor.symbol && newMonitor.symbol !== currentMonitor.symbol)
        currentMonitor.symbol = newMonitor.symbol;

    if (newMonitor.type && newMonitor.type !== currentMonitor.type)
        currentMonitor.type = newMonitor.type;

    if (currentMonitor.type === monitorTypes.CANDLES) {
        if (newMonitor.interval && newMonitor.interval !== currentMonitor.interval)
            currentMonitor.interval = newMonitor.interval;
    }
    else
        currentMonitor.interval = null;

    if (newMonitor.broadcastLabel !== currentMonitor.broadcastLabel)
        currentMonitor.broadcastLabel = newMonitor.broadcastLabel;

    if (newMonitor.indexes !== currentMonitor.indexes)
        currentMonitor.indexes = newMonitor.indexes;

    if (newMonitor.isActive !== null && newMonitor.isActive !== undefined
        && newMonitor.isActive !== currentMonitor.isActive)
        currentMonitor.isActive = newMonitor.isActive;

    if (newMonitor.isSystemMon !== null && newMonitor.isSystemMon !== undefined
        && newMonitor.isSystemMon !== currentMonitor.isSystemMon)
        currentMonitor.isSystemMon = newMonitor.isSystemMon;

    if (newMonitor.logs !== null && newMonitor.logs !== undefined
        && newMonitor.logs !== currentMonitor.logs)
        currentMonitor.logs = newMonitor.logs;

    await currentMonitor.save();
    return currentMonitor;
}

function deleteAll(userId, transaction) {
    return monitorModel.destroy({
        where: { userId },
        transaction
    })
}

function getMonitor(id) {
    return monitorModel.findByPk(id);
}

function getMonitors(userId, page = 1) {
    return monitorModel.findAndCountAll({
        where: { userId },
        order: [['isActive', 'DESC'], ['isSystemMon', 'DESC'], ['symbol', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1)
    });
}

function getMonitorsBySymbol(userId, symbol) {
    const filter = symbol.length < 6 ? { userId, symbol: { [Op.like]: `%${symbol}%` } } : { userId, symbol };
    return monitorModel.findAll({
        where: {
            [Op.or]: [filter, { isSystemMon: true }]
        },
        order: [['type', 'ASC'], ['interval', 'ASC']]
    });
}

function getActiveUserMonitors(userId) {
    return monitorModel.findAll({
        where: {
            isActive: true,
            userId
        }
    });
}

function getActiveSystemMonitors() {
    return monitorModel.findAll({
        where: {
            isActive: true,
            userId: null
        }
    });
}

function getActiveMonitorsQty() {
    return monitorModel.count({
        where: { isActive: true }
    });
}

module.exports = {
    getActiveSystemMonitors,
    getActiveUserMonitors,
    monitorTypes,
    insertMonitor,
    deleteMonitor,
    getMonitors,
    getMonitor,
    updateMonitor,
    deleteAll,
    monitorExists,
    getActiveMonitorsQty,
    getMonitorsBySymbol
}