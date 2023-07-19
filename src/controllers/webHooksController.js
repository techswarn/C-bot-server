const webHooksRepository = require('../repositories/webHooksRepository');
const { v4 } = require('uuid');
const hydra = require('../hydra');
const logger = require('../utils/logger');

async function getWebHooks(req, res, next) {
    const userId = res.locals.token.id;
    const page = req.query.page;
    const result = await webHooksRepository.getWebHooks(userId, page);
    res.json(result);
}

async function insertWebHook(req, res, next) {
    const userId = res.locals.token.id;

    const newWebHook = req.body;
    newWebHook.userId = userId;
    newWebHook.key = v4();

    if (!newWebHook.host) newWebHook.host = '*';

    const savedWebHook = await webHooksRepository.insertWebHook(newWebHook);

    res.status(201).json(savedWebHook.get({ plain: true }));
}

async function updateWebHook(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const newWebHook = req.body;

    const currentWebHook = await webHooksRepository.getWebHook(id);
    if (currentWebHook.userId !== userId) return res.sendStatus(403);

    const updatedWebHook = await webHooksRepository.updateWebHook(id, newWebHook);
    res.json(updatedWebHook);
}

async function deleteWebHook(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const currentWebHook = await webHooksRepository.getWebHook(id);
    if (currentWebHook.userId !== userId) return res.sendStatus(403);

    await webHooksRepository.deleteWebHook(id);

    res.sendStatus(204);
}

async function doWebHook(req, res, next) {
    const key = req.params.key;
    const userId = req.params.userId;
    const data = req.body;

    const webHook = await webHooksRepository.getWebHookByKey(key, userId);
    if (!webHook) return res.sendStatus(404);

    if (webHook.host !== '*' && webHook.host.indexOf(req.headers.origin) === -1)
        return res.sendStatus(403);

    hydra.updateMemory(webHook.symbol, webHooksRepository.getNormalyzedName(webHook.name, userId), null, {
        previous: false,
        current: true
    }, true, false, 5)
        .then(result => logger(`W:${userId}`, JSON.stringify({ data, webHookId: webHook.id })))
        .catch(err => logger(`W:${userId}`, err));

    res.sendStatus(200);
}

module.exports = {
    deleteWebHook,
    updateWebHook,
    insertWebHook,
    getWebHooks,
    doWebHook
}
