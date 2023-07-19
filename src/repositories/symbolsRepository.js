const symbolModel = require('../models/symbolModel');
const Sequelize = require('sequelize');

function getSymbols() {
    return symbolModel.findAll();
}

function getManySymbols(symbols) {
    return symbolModel.findAll({
        where: { symbol: symbols }
    });
}

function searchSymbols(search, page = 1, pageSize = 10) {
    const options = {
        where: {},
        order: [['symbol', 'ASC']],
        limit: pageSize,
        offset: pageSize * (page - 1)
    };

    if (search) {
        if (search.length < 6)
            options.where = { symbol: { [Sequelize.Op.like]: `%${search.toUpperCase()}%` } }
        else
            options.where = { symbol: search }
    }

    return symbolModel.findAndCountAll(options);
}

function getSymbol(symbol) {
    return symbolModel.findOne({ where: { symbol } });
}

async function updateSymbol(symbol, newSymbol) {
    const currentSymbol = await getSymbol(symbol);

    if (newSymbol.minNotional && newSymbol.minNotional !== currentSymbol.minNotional)
        currentSymbol.minNotional = newSymbol.minNotional;

    if (newSymbol.fMinNotional && newSymbol.fMinNotional !== currentSymbol.fMinNotional)
        currentSymbol.fMinNotional = newSymbol.fMinNotional;

    if (newSymbol.minLotSize && newSymbol.minLotSize !== currentSymbol.minLotSize)
        currentSymbol.minLotSize = newSymbol.minLotSize;

    if (newSymbol.fMinLotSize && newSymbol.fMinLotSize !== currentSymbol.fMinLotSize)
        currentSymbol.fMinLotSize = newSymbol.fMinLotSize;

    if (newSymbol.base && newSymbol.base !== currentSymbol.base)
        currentSymbol.base = newSymbol.base;

    if (newSymbol.quote && newSymbol.quote !== currentSymbol.quote)
        currentSymbol.quote = newSymbol.quote;

    if (newSymbol.basePrecision && newSymbol.basePrecision !== currentSymbol.basePrecision)
        currentSymbol.basePrecision = newSymbol.basePrecision;

    if (newSymbol.quotePrecision && newSymbol.quotePrecision !== currentSymbol.quotePrecision)
        currentSymbol.quotePrecision = newSymbol.quotePrecision;

    if (newSymbol.stepSize && newSymbol.stepSize !== currentSymbol.stepSize)
        currentSymbol.stepSize = newSymbol.stepSize;

    if (newSymbol.fStepSize && newSymbol.fStepSize !== currentSymbol.fStepSize)
        currentSymbol.fStepSize = newSymbol.fStepSize;

    if (newSymbol.tickSize && newSymbol.tickSize !== currentSymbol.tickSize)
        currentSymbol.tickSize = newSymbol.tickSize;

    if (newSymbol.fTickSize && newSymbol.fTickSize !== currentSymbol.fTickSize)
        currentSymbol.fTickSize = newSymbol.fTickSize;

    await currentSymbol.save();
}

async function deleteAll() {
    return symbolModel.destroy({ truncate: true });
}

function bulkInsert(symbols) {
    return symbolModel.bulkCreate(symbols);
}

module.exports = {
    getSymbols,
    getSymbol,
    updateSymbol,
    deleteAll,
    bulkInsert,
    searchSymbols,
    getManySymbols
}
