const orderModel = require('../models/orderModel');
const Sequelize = require('sequelize');
const automationModel = require('../models/automationModel');

const orderStatus = {
    FILLED: 'FILLED',
    PARTIALLY_FILLED: 'PARTIALLY_FILLED',
    CANCELED: 'CANCELED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    NEW: 'NEW'
}

function insertOrder(newOrder) {
    return orderModel.create(newOrder);
}

function getOrders(userId, symbol, page = 1, isFuture = false) {
    const where = isFuture
        ? { userId, positionSide: { [Sequelize.Op.ne]: null } }
        : { userId, positionSide: null };

    const options = {
        where,
        order: [['id', 'DESC']],
        limit: 10,
        offset: 10 * (page - 1),
        distinct: true
    };

    if (symbol) {
        if (symbol.length < 6)
            options.where.symbol = { [Sequelize.Op.like]: `%${symbol}%` };
        else
            options.where.symbol = symbol;
    }

    options.include = automationModel;

    return orderModel.findAndCountAll(options);
}

async function getAveragePrices(userId, isFuture = false) {
    const where = { side: 'BUY', userId, status: 'FILLED', net: { [Sequelize.Op.gt]: 0 } };

    if (isFuture)
        where.positionSide = { [Sequelize.Op.ne]: null }
    else
        where.positionSide = null;

    const result = await orderModel.findAll({
        where,
        group: 'symbol',
        attributes: [
            [Sequelize.fn('max', Sequelize.col('symbol')), 'symbol'],
            [Sequelize.fn('sum', Sequelize.col('net')), 'net'],
            [Sequelize.fn('sum', Sequelize.col('quantity')), 'qty']
        ],
        raw: true
    });

    return result.map(r => {
        return {
            symbol: r.symbol,
            net: parseFloat(r.net),
            qty: parseFloat(r.qty),
            avg: parseFloat(r.net) / parseFloat(r.qty)
        }
    });
}

async function getOrderById(id) {
    const order = await orderModel.findOne({ where: { id }, include: automationModel });
    return order;
}

async function getOrder(orderId, clientOrderId) {
    const order = await orderModel.findOne({ where: { orderId, clientOrderId }, include: automationModel });
    return order;
}

async function updateOrderById(id, newOrder) {
    const order = await getOrderById(id);
    if (!order) return false;
    return updateOrder(order, newOrder);
}

async function updateOrderByOrderId(orderId, clientOrderId, newOrder) {
    const order = await getOrder(orderId, clientOrderId);
    if (!order) return false;
    return updateOrder(order, newOrder);
}

async function updateOrder(currentOrder, newOrder) {
    if (!currentOrder || !newOrder) return false;

    if (newOrder.status &&
        newOrder.status !== currentOrder.status &&
        (currentOrder.status === 'NEW' || currentOrder.status === 'PARTIALLY_FILLED'))
        currentOrder.status = newOrder.status;//somente dá para atualizar ordens não finalizadas

    if (newOrder.avgPrice && newOrder.avgPrice !== currentOrder.avgPrice)
        currentOrder.avgPrice = newOrder.avgPrice;

    if (newOrder.isMaker !== null && newOrder.isMaker !== undefined && newOrder.isMaker !== currentOrder.isMaker)
        currentOrder.isMaker = newOrder.isMaker;

    if (newOrder.reduceOnly !== null && newOrder.reduceOnly !== undefined && newOrder.reduceOnly !== currentOrder.reduceOnly)
        currentOrder.reduceOnly = newOrder.reduceOnly;

    if (newOrder.obs !== currentOrder.obs)
        currentOrder.obs = newOrder.obs;

    if (newOrder.activatePrice && newOrder.activatePrice !== currentOrder.activatePrice)
        currentOrder.activatePrice = newOrder.activatePrice;

    if (newOrder.priceRate && newOrder.priceRate !== currentOrder.priceRate)
        currentOrder.priceRate = newOrder.priceRate;

    if (newOrder.positionSide && newOrder.positionSide !== currentOrder.positionSide)
        currentOrder.positionSide = newOrder.positionSide;

    if (newOrder.transactTime && newOrder.transactTime !== currentOrder.transactTime)
        currentOrder.transactTime = newOrder.transactTime;

    if (newOrder.commission !== null && newOrder.commission !== undefined && newOrder.commission !== currentOrder.commission)
        currentOrder.commission = newOrder.commission;

    if (newOrder.net !== null && newOrder.net !== undefined && newOrder.net !== currentOrder.net)
        currentOrder.net = newOrder.net;

    if (newOrder.quantity && newOrder.quantity !== currentOrder.quantity)
        currentOrder.quantity = newOrder.quantity;

    await currentOrder.save();
    return currentOrder;
}

async function getLastFilledOrders(userId, isFuture = false) {

    const where = {
        userId,
        status: 'FILLED',
        positionSide: isFuture ? { [Sequelize.Op.ne]: null } : null
    }

    const idObjects = await orderModel.findAll({
        where,
        group: 'symbol',
        attributes: [Sequelize.fn('max', Sequelize.col('id'))],
        raw: true
    });
    const ids = idObjects.map(o => Object.values(o)).flat();

    return orderModel.findAll({ where: { id: ids } });
}

async function removeAutomationFromOrders(automationId, transaction) {
    return orderModel.update({
        automationId: null
    }, {
        where: { automationId },
        transaction
    })
}

function getReportOrders(userId, quoteAsset, startDate, endDate, isFuture = false) {
    startDate = startDate ? startDate : 0;
    endDate = endDate ? endDate : Date.now();

    const where = {
        userId,
        symbol: { [Sequelize.Op.like]: `%${quoteAsset}` },
        transactTime: { [Sequelize.Op.between]: [startDate, endDate] },
        status: 'FILLED',
        net: { [Sequelize.Op.gt]: 0 },
        positionSide: isFuture ? { [Sequelize.Op.ne]: null } : null
    }

    return orderModel.findAll({
        where,
        order: [['transactTime', 'ASC']],
        include: automationModel,
        raw: true,
        distinct: true
    });
}

function deleteAll(userId, transaction) {
    return orderModel.destroy({
        where: { userId },
        transaction
    })
}

function get24hOrdersQty(isFuture = false) {
    const startDate = new Date();
    startDate.setHours(-24);

    return orderModel.count({
        where: {
            transactTime: { [Sequelize.Op.gt]: startDate.getTime() },
            positionSide: isFuture ? { [Sequelize.Op.ne]: null } : null
        }
    })
}

const STOP_TYPES = ["STOP", "STOP_MARKET", "STOP_LOSS", "STOP_LOSS_LIMIT", "TAKE_PROFIT", "TAKE_PROFIT_MARKET", "TAKE_PROFIT_LIMIT"];

const LIMIT_TYPES = ["LIMIT", "STOP", "TAKE_PROFIT", "STOP_LOSS_LIMIT", "TAKE_PROFIT_LIMIT"];

module.exports = {
    orderStatus,
    STOP_TYPES,
    LIMIT_TYPES,
    insertOrder,
    get24hOrdersQty,
    getOrders,
    getOrder,
    getOrderById,
    deleteAll,
    updateOrderById,
    getLastFilledOrders,
    updateOrderByOrderId,
    getReportOrders,
    removeAutomationFromOrders,
    getAveragePrices
}
