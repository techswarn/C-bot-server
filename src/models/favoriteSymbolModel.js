const Sequelize = require('sequelize');
const database = require('../db');

const favoriteSymbolModel = database.define('favoriteSymbol', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    symbol: {
        type: Sequelize.STRING,
        allowNull: false
    },
    userId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
}, {
    indexes: [{
        unique: true,
        fields: ['symbol', 'userId']
    }]
})

module.exports = favoriteSymbolModel;