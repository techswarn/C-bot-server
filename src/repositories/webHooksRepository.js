const webHookModel = require('../models/webHookModel');

async function insertWebHook(newWebHook) {
    return webHookModel.create(newWebHook);
}

function deleteWebHook(id) {
    return webHookModel.destroy({
        where: { id }
    })
}

function getWebHook(id) {
    return webHookModel.findByPk(id);
}

async function updateWebHook(id, newWebHook) {
    const currentWebHook = await getWebHook(id);

    if (newWebHook.name && newWebHook.name !== currentWebHook.name)
        currentWebHook.name = newWebHook.name;

    if (newWebHook.host && newWebHook.host !== currentWebHook.host)
        currentWebHook.host = newWebHook.host;

    await currentWebHook.save();
    return currentWebHook;
}

function deleteAll(userId, transaction) {
    return webHookModel.destroy({
        where: { userId },
        transaction
    })
}

function getWebHooks(userId, page = 1) {
    return webHookModel.findAndCountAll({
        where: { userId },
        order: [['symbol', 'ASC'], ['name', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1)
    });
}

function getAllWebHooks(userId) {
    return webHookModel.findAll({ where: { userId } });
}

function getWebHookByKey(key, userId) {
    return webHookModel.findOne({ where: { key, userId } });
}

function getNormalyzedName(name, userId) {
    return name.toUpperCase().replace(/\s/gi, "_") + "_" + userId;
}

module.exports = {
    getWebHook,
    getNormalyzedName,
    getWebHookByKey,
    insertWebHook,
    deleteWebHook,
    updateWebHook,
    deleteAll,
    getWebHooks,
    getAllWebHooks
}