const Sequelize = require('sequelize');
const database = require('../db');
const AutomationModel = require('./automationModel');
const MonitorModel = require('./monitorModel');
const OrderTemplateModel = require('./orderTemplateModel');
const WithdrawTemplateModel = require('./withdrawTemplateModel');
const FavoriteSymbolModel = require('./favoriteSymbolModel');
const LimitModel = require('./limitModel');
const WebHookModel = require('./webHookModel');

const userModel = database.define('user', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    name: Sequelize.STRING,
    email: {
        type: Sequelize.STRING,
        allowNull: false
    },
    password: {
        type: Sequelize.STRING,
        allowNull: false
    },
    limitId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    phone: Sequelize.STRING,
    pushToken: Sequelize.STRING,
    accessKey: Sequelize.STRING,
    secretKey: Sequelize.STRING,
    futuresKey: Sequelize.STRING,
    futuresSecret: Sequelize.STRING,
    telegramChat: Sequelize.STRING,
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
        fields: ['email']
    }]
})

userModel.belongsTo(LimitModel, {
    foreignKey: 'limitId'
})

userModel.hasMany(AutomationModel, {
    foreignKey: 'userId'
});

userModel.hasMany(MonitorModel, {
    foreignKey: 'userId'
});

userModel.hasMany(OrderTemplateModel, {
    foreignKey: 'userId'
});

userModel.hasMany(WithdrawTemplateModel, {
    foreignKey: 'userId'
});

userModel.hasMany(FavoriteSymbolModel, {
    foreignKey: 'userId'
});

userModel.hasMany(WebHookModel, {
    foreignKey: 'userId'
});

module.exports = userModel