const limitsRepository = require('../repositories/limitsRepository');

async function getLimits(req, res, next) {
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const result = await limitsRepository.getLimits(page, pageSize);
    res.json(result);
}

async function getActiveLimits(req, res, next){
    const limits = await limitsRepository.getActiveLimits();
    res.json(limits);
}

async function getAllLimits(req, res, next){
    const limits = await limitsRepository.getAllLimits();
    res.json(limits);
}

async function insertLimit(req, res, next) {
    const newLimit = req.body;

    const alreadyExists = await limitsRepository.limitExists(newLimit.name);
    if (alreadyExists) return res.status(409).send(`Already exists a limit with this name.`);

    const limit = await limitsRepository.insertLimit(newLimit);
    res.status(201).json(limit.get({ plain: true }));
}

async function updateLimit(req, res, next) {
    const id = req.params.id;
    const newLimit = req.body;

    const updatedLimit = await limitsRepository.updateLimit(id, newLimit);
    res.json(updatedLimit);
}

async function deleteLimit(req, res, next) {
    const id = req.params.id;

    const hasUsers = await limitsRepository.hasUsers(id);
    if (hasUsers) return res.status(409).send(`You can't delete a limit that is being used.`);

    await limitsRepository.deleteLimit(id);

    res.sendStatus(204);
}

module.exports = {
    getLimits,
    insertLimit,
    updateLimit,
    deleteLimit,
    getActiveLimits,
    getAllLimits
}
