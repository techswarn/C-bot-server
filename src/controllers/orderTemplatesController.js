const orderTemplatesRepository = require('../repositories/orderTemplatesRepository');
const actionsRepository = require('../repositories/actionsRepository');

function validatePrice(price) {
    if (!price) return true;
    if (parseFloat(price)) return true;
    return /^(F?LAST_(ORDER|CANDLE|LIQ)|BOOK|POSITION)_/i.test(price);
}

async function getOrderTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const orderTemplate = await orderTemplatesRepository.getOrderTemplate(userId, id);
    if(!orderTemplate) return res.sendStatus(404);
    if (orderTemplate.userId !== userId) return res.sendStatus(403);
    res.json(orderTemplate);
}

async function getOrderTemplates(req, res, next) {
    const userId = res.locals.token.id;
    const symbol = req.params.symbol;
    const page = req.query.page || 1;
    const isFuture = req.query.isFuture === "true";
    const result = await orderTemplatesRepository.getOrderTemplates(userId, symbol, page, isFuture);
    res.json(result);
}

function calcTrailingStop(newOrderTemplate) {
    return newOrderTemplate.side === 'BUY' ? newOrderTemplate.limitPrice * (1 + (newOrderTemplate.stopPriceMultiplier / 100))
        : newOrderTemplate.limitPrice * (1 - (newOrderTemplate.stopPriceMultiplier / 100));
}

async function insertOrderTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const newOrderTemplate = req.body;
    newOrderTemplate.userId = userId;

    if (newOrderTemplate.type === 'TRAILING_STOP' && newOrderTemplate.limitPrice.indexOf("_") === -1)
        newOrderTemplate.stopPrice = calcTrailingStop(newOrderTemplate);

    if (!validatePrice(newOrderTemplate.limitPrice) || !validatePrice(newOrderTemplate.stopPrice))
        return res.status(400).json("Invalid price.");

    newOrderTemplate.quantity = newOrderTemplate.quantity ? newOrderTemplate.quantity.replace(',', '.') : newOrderTemplate.quantity;

    const orderTemplate = await orderTemplatesRepository.insertOrderTemplate(newOrderTemplate);
    res.status(201).json(orderTemplate);
}

async function updateOrderTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const newOrderTemplate = req.body;
    newOrderTemplate.userId = userId;
    newOrderTemplate.quantity = newOrderTemplate.quantity ? newOrderTemplate.quantity.replace(',', '.') : newOrderTemplate.quantity;

    if (newOrderTemplate.type === 'TRAILING_STOP' && newOrderTemplate.limitPrice.indexOf("_") === -1)
        newOrderTemplate.stopPrice = calcTrailingStop(newOrderTemplate);

    const updatedOrderTemplate = await orderTemplatesRepository.updateOrderTemplate(userId, id, newOrderTemplate);
    res.json(updatedOrderTemplate);
}

async function deleteOrderTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const actions = await actionsRepository.getByOrderTemplate(id);
    if (actions.length > 0) return res.status(409).json(`You can't delete an Order Template used by Automations.`);

    await orderTemplatesRepository.deleteOrderTemplate(userId, id);
    res.sendStatus(204);
}

async function getAllOrderTemplates(req, res, next) {
    const userId = res.locals.token.id;
    const symbol = req.params.symbol;
    const result = await orderTemplatesRepository.getAllOrderTemplates(userId, symbol);
    res.json(result);
}

module.exports = {
    getOrderTemplate,
    getOrderTemplates,
    insertOrderTemplate,
    updateOrderTemplate,
    deleteOrderTemplate,
    getAllOrderTemplates
}
