const Sequelize = require('sequelize');
const database = require('../db');

const OrderTemplateModel = database.define('orderTemplate', {
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
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    symbol: {
        type: Sequelize.STRING,
        allowNull: false
    },
    type: {
        type: Sequelize.STRING,
        allowNull: false
    },
    side: {
        type: Sequelize.STRING,
        allowNull: false
    },
    limitPrice: Sequelize.STRING,
    limitPriceMultiplier: Sequelize.DECIMAL(6,3),
    stopPrice: Sequelize.STRING,
    stopPriceMultiplier: Sequelize.DECIMAL(6,3),
    quantity: {
        type: Sequelize.STRING,
        allowNull: false
    },
    quantityMultiplier: Sequelize.DECIMAL(6,3),
    reduceOnly: Sequelize.BOOLEAN,
    leverage: Sequelize.INTEGER,
    marginType: Sequelize.STRING,
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
}, {
    indexes: [{
        fields: ['symbol', 'name', 'userId'],
        unique: true
    }]
})

module.exports = OrderTemplateModel;