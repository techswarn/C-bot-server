const orderTemplateModel = require('../models/orderTemplateModel');
const Sequelize = require('sequelize');

function insertOrderTemplate(newOrderTemplate, transaction) {
    return orderTemplateModel.create(newOrderTemplate, { transaction });
}

function deleteOrderTemplate(userId, id) {
    return orderTemplateModel.destroy({ where: { id, userId } });
}

function deleteAll(userId, transaction) {
    return orderTemplateModel.destroy({
        where: { userId },
        transaction
    })
}

function getOrderTemplates(userId, symbol, page = 1, isFuture = false) {
    const where = {
        userId,
        leverage: isFuture ? { [Sequelize.Op.ne]: null } : null
    }

    const options = {
        where,
        order: [['symbol', 'ASC'], ['name', 'ASC']],
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

    return orderTemplateModel.findAndCountAll(options);
}

async function getOrderTemplate(userId, id) {
    return orderTemplateModel.findOne({ where: { id, userId } });
}

async function updateOrderTemplate(userId, id, newOrderTemplate) {

    const currentOrderTemplate = await getOrderTemplate(userId, id);
    if (!currentOrderTemplate) throw new Error(`There is no order template with these params: {userId: ${userId}, id: ${id}}.`);

    if (newOrderTemplate.name && newOrderTemplate.name !== currentOrderTemplate.name)
        currentOrderTemplate.name = newOrderTemplate.name;

    if (newOrderTemplate.type && newOrderTemplate.type !== currentOrderTemplate.type)
        currentOrderTemplate.type = newOrderTemplate.type;

    if (newOrderTemplate.side && newOrderTemplate.side !== currentOrderTemplate.side)
        currentOrderTemplate.side = newOrderTemplate.side;

    if (newOrderTemplate.limitPrice !== null && newOrderTemplate.limitPrice !== undefined
        && newOrderTemplate.limitPrice !== currentOrderTemplate.limitPrice)
        currentOrderTemplate.limitPrice = newOrderTemplate.limitPrice;

    if (newOrderTemplate.limitPriceMultiplier !== null && newOrderTemplate.limitPriceMultiplier !== undefined
        && newOrderTemplate.limitPriceMultiplier !== currentOrderTemplate.limitPriceMultiplier)
        currentOrderTemplate.limitPriceMultiplier = newOrderTemplate.limitPriceMultiplier;

    if (newOrderTemplate.stopPrice !== null && newOrderTemplate.stopPrice !== undefined
        && newOrderTemplate.stopPrice !== currentOrderTemplate.stopPrice)
        currentOrderTemplate.stopPrice = newOrderTemplate.stopPrice;

    if (newOrderTemplate.stopPriceMultiplier !== null && newOrderTemplate.stopPriceMultiplier !== undefined
        && newOrderTemplate.stopPriceMultiplier !== currentOrderTemplate.stopPriceMultiplier)
        currentOrderTemplate.stopPriceMultiplier = newOrderTemplate.stopPriceMultiplier;

    if (newOrderTemplate.quantity && newOrderTemplate.quantity !== currentOrderTemplate.quantity)
        currentOrderTemplate.quantity = newOrderTemplate.quantity;

    if (newOrderTemplate.quantityMultiplier && newOrderTemplate.quantityMultiplier !== currentOrderTemplate.quantityMultiplier)
        currentOrderTemplate.quantityMultiplier = newOrderTemplate.quantityMultiplier;

    if (newOrderTemplate.leverage !== currentOrderTemplate.leverage)
        currentOrderTemplate.leverage = newOrderTemplate.leverage;

    if (newOrderTemplate.marginType !== currentOrderTemplate.marginType)
        currentOrderTemplate.marginType = newOrderTemplate.marginType;

    if (newOrderTemplate.reduceOnly !== undefined && newOrderTemplate.reduceOnly !== null
        && newOrderTemplate.reduceOnly !== currentOrderTemplate.reduceOnly)
        currentOrderTemplate.reduceOnly = newOrderTemplate.reduceOnly;

    await currentOrderTemplate.save();
    return currentOrderTemplate;
}

function deleteOrderTemplatesByGridName(userId, gridName, transaction) {
    const likeName = gridName.split('#')[0];
    return orderTemplateModel.destroy({
        where: { userId, name: { [Sequelize.Op.like]: `${likeName}#%` } },
        transaction
    })
}


function getOrderTemplatesByGridName(userId, gridName) {
    const likeName = gridName.split('#')[0];
    return orderTemplateModel.findAll({
        where: { userId, name: { [Sequelize.Op.like]: `${likeName}#%` } }
    })
}

function getAllOrderTemplates(userId, symbol) {
    const options = { where: { userId, symbol } };

    if (symbol.startsWith('*'))
        options.where.symbol = { [Sequelize.Op.like]: `%${symbol.replace('*', '')}` }

    return orderTemplateModel.findAll(options);
}

module.exports = {
    getOrderTemplate,
    getOrderTemplates,
    insertOrderTemplate,
    updateOrderTemplate,
    deleteOrderTemplate,
    deleteAll,
    deleteOrderTemplatesByGridName,
    getOrderTemplatesByGridName,
    getAllOrderTemplates
}