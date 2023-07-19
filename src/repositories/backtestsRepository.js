const backtestModel = require('../models/backtestModel');
const Sequelize = require('sequelize');

function insertBacktest(newBacktest) {
    return backtestModel.create(newBacktest);
}

function getBacktest(id) {
    return backtestModel.findByPk(id);
}

function getBacktestsQty(userId, startDate, endDate) {
    return backtestModel.count({
        where: {
            userId,
            createdAt: { [Sequelize.Op.between]: [startDate, endDate] }
        }
    })
}

function getBacktests(userId, page = 1) {
    return backtestModel.findAndCountAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: 10,
        offset: 10 * (page - 1)
    })
}

module.exports = {
    insertBacktest,
    getBacktest,
    getBacktestsQty,
    getBacktests
}