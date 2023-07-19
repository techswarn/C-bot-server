const { getActiveMonitorsQty } = require('../repositories/monitorsRepository');
const { getActiveAutomationsQty } = require('../repositories/automationsRepository');
const { get24hOrdersQty } = require('../repositories/ordersRepository');
const { getActiveUsersQty } = require('../repositories/usersRepository');

const appEm = require('../app-em');

async function getDashboard(req, res, next) {
    const monitors = await getActiveMonitorsQty();
    const automations = await getActiveAutomationsQty();
    const users = await getActiveUsersQty();
    const orders = await get24hOrdersQty();

    const connections = await appEm.getConnections();
    const { rss } = process.memoryUsage();

    res.json({
        monitors,
        automations,
        users,
        orders,
        connections,
        memory: rss
    })
}

module.exports = {
    getDashboard
}