const withdrawTemplatesRepository = require('../repositories/withdrawTemplatesRepository');
const actionsRepository = require('../repositories/actionsRepository');

async function getWithdrawTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const withdrawTemplate = await withdrawTemplatesRepository.getWithdrawTemplate(userId, id);
    if(withdrawTemplate.userId !== userId) return res.sendStatus(403);
    res.json(withdrawTemplate);
}

async function getWithdrawTemplates(req, res, next) {
    const userId = res.locals.token.id;
    const coin = req.params.coin;
    const page = req.query.page;
    const withdrawTemplates = await withdrawTemplatesRepository.getWithdrawTemplates(userId, coin, page);
    res.json(withdrawTemplates);
}

async function insertWithdrawTemplate(req, res, next) {
    const userId = res.locals.token.id;

    const newWithdrawTemplate = req.body;
    newWithdrawTemplate.userId = userId;
    newWithdrawTemplate.amount = newWithdrawTemplate.amount ? newWithdrawTemplate.amount.replace(',', '.') : '';

    const withdrawTemplate = await withdrawTemplatesRepository.insertWithdrawTemplate(newWithdrawTemplate);
    res.status(201).json(withdrawTemplate);
}

async function updateWithdrawTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;
    const newWithdrawTemplate = req.body;
    newWithdrawTemplate.userId = userId;
    newWithdrawTemplate.amount = newWithdrawTemplate.amount ? newWithdrawTemplate.amount.replace(',', '.') : '';

    const withdrawTemplate = await withdrawTemplatesRepository.updateWithdrawTemplate(userId, id, newWithdrawTemplate);
    res.json(withdrawTemplate);
}

async function deleteWithdrawTemplate(req, res, next) {
    const userId = res.locals.token.id;
    const id = req.params.id;

    const actions = await actionsRepository.getByWithdrawTemplate(id);
    if (actions.length > 0) return res.status(409).json(`You can't delete an Withdraw Template used by Automations.`);

    await withdrawTemplatesRepository.deleteWithdrawTemplate(userId, id);
    res.sendStatus(204);
}

module.exports = {
    getWithdrawTemplate,
    getWithdrawTemplates,
    insertWithdrawTemplate,
    updateWithdrawTemplate,
    deleteWithdrawTemplate
}