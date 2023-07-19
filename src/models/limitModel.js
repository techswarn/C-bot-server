const Sequelize = require('sequelize');
const database = require('../db');

const limitModel = database.define('limit', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    name: {
       type: Sequelize.STRING,
       allowNull: false
    },
    maxAutomations: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    maxMonitors: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    maxBacktests: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    hasFutures: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
}, {
    indexes: [{
        unique: true,
        fields: ['name']
    }]
})

module.exports = limitModel