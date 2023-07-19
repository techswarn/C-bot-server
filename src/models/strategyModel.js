const Sequelize = require('sequelize');
const database = require('../db');
const AutomationModel = require('./automationModel');
const MonitorModel = require('./monitorModel');
const UserModel = require('./userModel');

const strategyModel = database.define('strategy', {
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
    symbol: {
        type: Sequelize.STRING,
        allowNull: false
    },
    monitorId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    buyAutomationId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    sellAutomationId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    userId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    sharedWith: Sequelize.STRING,
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    startedAt: Sequelize.DATE,
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
}, {
    indexes: [{
        unique: true,
        fields: ['symbol', 'name', 'userId']
    }]
})

strategyModel.belongsTo(MonitorModel, {
    foreignKey: 'monitorId'
})

strategyModel.belongsTo(AutomationModel, {
    foreignKey: 'buyAutomationId',
    as: 'buyAutomation'
});

strategyModel.belongsTo(AutomationModel, {
    foreignKey: 'sellAutomationId',
    as: 'sellAutomation'
});

strategyModel.belongsTo(UserModel, {
    foreignKey: 'userId'
});

module.exports = strategyModel