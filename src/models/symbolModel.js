const Sequelize = require('sequelize');
const database = require('../db');

const symbolModel = database.define('symbol', {
    symbol: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true
    },
    basePrecision: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    quotePrecision: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    minNotional: {
        type: Sequelize.STRING,
        allowNull: false
    },
    minLotSize: {
        type: Sequelize.STRING,
        allowNull: false
    },
    base: Sequelize.STRING,
    quote: Sequelize.STRING,
    stepSize: Sequelize.STRING,
    tickSize: Sequelize.STRING,
    fTickSize: Sequelize.STRING,
    fStepSize: Sequelize.STRING,
    fMinNotional: Sequelize.STRING,
    fMinLotSize: Sequelize.STRING,
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
})

module.exports = symbolModel