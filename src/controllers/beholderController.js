const { getActiveUsers } = require('../repositories/usersRepository');
const hydra = require('../hydra');
const agenda = require('../agenda');
const indexes = require('../utils/indexes');
const { getActiveUserMonitors, monitorTypes } = require('../repositories/monitorsRepository');
const usersRepository = require('../repositories/usersRepository');
const webHooksRepository = require('../repositories/webHooksRepository');

function getAgenda(req, res, next) {
    res.json(agenda.getAgenda());
}

const USER_VARIABLES = [indexes.indexKeys.WALLET, indexes.indexKeys.FWALLET, indexes.indexKeys.POSITION, indexes.indexKeys.LAST_ORDER, indexes.indexKeys.FLAST_ORDER];

async function getMemory(req, res, next) {
    let { symbol, index, interval } = req.params;
    if (USER_VARIABLES.includes(index))
        index = `${index}_${res.locals.token.id}`;

    const memory = await hydra.getMemory(symbol, index, interval);
    res.json(memory);
}

async function getMemoryIndexes(req, res, next) {
    const userId = res.locals.token.id;
    const monitors = await getActiveUserMonitors(userId);
    let userIndexes = [];
    if (monitors && monitors.length) {
        userIndexes = monitors.filter(m => m.indexes).map(m => m.indexes.split(',').map(ix => ix + "_" + m.interval)).flat();
        userIndexes.push(...monitors.filter(m => m.type === monitorTypes.CANDLES).map(m => `${indexes.indexKeys.LAST_CANDLE}_${m.interval}`));
        userIndexes.push(...monitors.filter(m => m.type === monitorTypes.CANDLES).map(m => `${indexes.indexKeys.PREVIOUS_CANDLE}_${m.interval}`));
    }

    userIndexes.push(
        indexes.indexKeys.BOOK,
        indexes.indexKeys.TICKER,
        indexes.indexKeys.MARK_PRICE,
        indexes.indexKeys.LAST_LIQ,
        `${indexes.indexKeys.WALLET}_${userId}`,
        `${indexes.indexKeys.FWALLET}_${userId}`,
        `${indexes.indexKeys.POSITION}_${userId}`,
        `${indexes.indexKeys.LAST_ORDER}_${userId}`,
        `${indexes.indexKeys.FLAST_ORDER}_${userId}`
    )

    let memory = await hydra.getMemoryIndexes();
    memory = userIndexes.map(uix => memory.filter(m => new RegExp(`^(${uix}(\.|$))`).test(m.variable))).flat();

    const webHooks = await webHooksRepository.getAllWebHooks(userId);
    if (webHooks && webHooks.length) {
        memory.push(...webHooks.map(wh => {
            const name = webHooksRepository.getNormalyzedName(wh.name, userId);
            return {
                symbol: wh.symbol,
                variable: name,
                eval: `MEMORY['${wh.symbol}:${name}'].current`,
                example: true
            }
        }))
    }

    memory = memory.sort((a, b) => {
        if (a.variable > b.variable) return 1;
        return -1;
    })

    res.json(memory);
}

async function getStreams(req, res, next) {
    const appEm = require('../app-em');
    res.json(appEm.getConnections());
}

async function getBrainIndexes(req, res, next) {
    const userId = req.params.userId;
    const indexes = await hydra.getBrainIndexes(userId);
    if (!indexes) return res.sendStatus(404);
    res.json(indexes);
}

async function getBrain(req, res, next) {
    let userId = req.params.userId;

    if (userId) {
        const indexes = await hydra.getBrain(userId);
        if (!indexes) return res.sendStatus(404);
        res.json(indexes);
    }
    else {
        const users = await usersRepository.getActiveUsers();
        const brain = {};
        for (let i = 0; i < users.length; i++) {
            userId = users[i].id;
            brain[userId] = await hydra.getBrain(userId);
        }
        res.json(brain);
    }
}

function getAnalysisIndexes(req, res, next) {
    res.json(indexes.getAnalysisIndexes());
}

async function init(req, res, next) {
    const users = await getActiveUsers();
    hydra.init(users);
    res.json(hydra.getBrain());
}

module.exports = {
    getMemory,
    getMemoryIndexes,
    getBrain,
    getBrainIndexes,
    getAnalysisIndexes,
    getAgenda,
    getStreams,
    init
}