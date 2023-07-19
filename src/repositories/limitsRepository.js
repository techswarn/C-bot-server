const limitModel = require('../models/limitModel');
const userModel = require('../models/userModel');

async function limitExists(name) {
    const count = await limitModel.count({ where: { name } });
    return count > 0;
}

async function hasUsers(limitId) {
    const count = await userModel.count({ where: { limitId } });
    return count > 0;
}

async function insertLimit(newLimit) {
    return limitModel.create(newLimit);
}

function deleteLimit(id) {
    return limitModel.destroy({
        where: { id }
    })
}

async function updateLimit(id, newLimit) {
    const currentLimit = await getLimit(id);

    if (newLimit.name && newLimit.name !== currentLimit.name)
        currentLimit.name = newLimit.name;

    if (newLimit.maxAutomations !== undefined && newLimit.maxAutomations !== null
        && newLimit.maxAutomations !== currentLimit.maxAutomations)
        currentLimit.maxAutomations = newLimit.maxAutomations;

    if (newLimit.maxMonitors !== undefined && newLimit.maxMonitors !== null
        && newLimit.maxMonitors !== currentLimit.maxMonitors)
        currentLimit.maxMonitors = newLimit.maxMonitors;

    if (newLimit.maxBacktests !== undefined && newLimit.maxBacktests !== null
        && newLimit.maxBacktests !== currentLimit.maxBacktests)
        currentLimit.maxBacktests = newLimit.maxBacktests;

    if (newLimit.isActive !== null && newLimit.isActive !== undefined
        && newLimit.isActive !== currentLimit.isActive)
        currentLimit.isActive = newLimit.isActive;

    if (newLimit.hasFutures !== null && newLimit.hasFutures !== undefined
        && newLimit.hasFutures !== currentLimit.hasFutures)
        currentLimit.hasFutures = newLimit.hasFutures;

    await currentLimit.save();
    return currentLimit;
}

function getLimit(id) {
    return limitModel.findByPk(id);
}

function getLimits(page = 1, pageSize = 10) {
    return limitModel.findAndCountAll({
        where: {},
        order: [['isActive', 'DESC'], ['name', 'ASC']],
        limit: pageSize,
        offset: pageSize * (page - 1)
    });
}

function getActiveLimits() {
    return limitModel.findAll({ where: { isActive: true } });
}

function getAllLimits() {
    return limitModel.findAll({ where: {} });
}

module.exports = {
    insertLimit,
    deleteLimit,
    getLimits,
    getLimit,
    updateLimit,
    getAllLimits,
    getActiveLimits,
    limitExists,
    hasUsers
}