const automationModel = require('../models/automationModel');
const Sequelize = require('sequelize');

async function getActiveAutomations() {
    return automationModel.findAll({
        where: { isActive: true },
        distinct: true,
        include: [{ all: true, nested: true }]//já inclui todas tabelas relacionadas
    });
}

function getActiveAutomationsQty() {
    return automationModel.count({
        where: { isActive: true }
    });
}

function deleteAll(userId, transaction) {
    return automationModel.destroy({
        where: { userId },
        transaction
    })
}

async function updateAutomation(id, newAutomation) {
    const currentAutomation = await getAutomation(id);

    if (newAutomation.symbol && newAutomation.symbol !== currentAutomation.symbol)
        currentAutomation.symbol = newAutomation.symbol;

    if (newAutomation.name && newAutomation.name !== currentAutomation.name)
        currentAutomation.name = newAutomation.name;

    if (newAutomation.indexes && newAutomation.indexes !== currentAutomation.indexes)
        currentAutomation.indexes = newAutomation.indexes;

    if (newAutomation.conditions && newAutomation.conditions !== currentAutomation.conditions)
        currentAutomation.conditions = newAutomation.conditions;

    if (newAutomation.schedule !== currentAutomation.schedule)
        currentAutomation.schedule = newAutomation.schedule;

    if (newAutomation.isActive !== null && newAutomation.isActive !== undefined
        && newAutomation.isActive !== currentAutomation.isActive)
        currentAutomation.isActive = newAutomation.isActive;

    if (newAutomation.logs !== null && newAutomation.logs !== undefined
        && newAutomation.logs !== currentAutomation.logs)
        currentAutomation.logs = newAutomation.logs;

    await currentAutomation.save();
    return currentAutomation;
}

function getAutomation(id) {
    return automationModel.findByPk(id, { include: [{ all: true, nested: true }] });
}

async function automationExists(userId, name) {
    const count = await automationModel.count({ where: { name, userId } });
    return count > 0;
}

function getAutomations(userId, page = 1) {
    return automationModel.findAndCountAll({
        where: { userId },
        order: [['isActive', 'DESC'], ['symbol', 'ASC'], ['name', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1),
        distinct: true,
        include: [{ all: true, nested: true }]//inclui todas tabelas relacionadas
    });
}

function getAutomationsBySymbol(userId, symbol) {
    const where = symbol.length < 6 ? { userId, symbol: { [Op.like]: `%${symbol}%` } } : { userId, symbol };
    return automationModel.findAll({
        where,
        order: [['name', 'ASC']]
    });
}

function getAllAutomations(userId) {
    return automationModel.findAll({
        where: { userId },
        order: [['name', 'ASC']]
    });
}

function insertAutomation(newAutomation, transaction) {
    return automationModel.create(newAutomation, { transaction });
}

function deleteAutomation(id, transaction) {
    return automationModel.destroy({
        where: { id },
        transaction
    })
}

function getAutomationsById(automationIds, userId) {
    return automationModel.findAll({
        where: { userId, id: automationIds },
        distinct: true,
        include: [{ all: true, nested: true }]
    })
}

async function gridExists(userId, name) {
    const gridName = name.split('#')[0];
    const count = await automationModel.count({ where: { userId, name: { [Sequelize.Op.like]: `${gridName}#%` } } });
    return count > 0;
}

module.exports = {
    deleteAll,
    getAutomations,
    insertAutomation,
    deleteAutomation,
    getAutomation,
    updateAutomation,
    getActiveAutomations,
    getAllAutomations,
    automationExists,
    getAutomationsById,
    getActiveAutomationsQty,
    gridExists,
    getAutomationsBySymbol
}
