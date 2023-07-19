const Sequelize = require('sequelize');
const database = require('../db');

const WebHookModel = database.define('webHook', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    userId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    symbol: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '*'
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    key: {
        type: Sequelize.STRING,
        allowNull: false
    },
    host: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '*'
    },
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
}, {
    indexes: [{
        unique: true,
        fields: ['symbol', 'name']
    }, {
        unique: true,
        fields: ['key', 'userId']
    }]
})

module.exports = WebHookModel;