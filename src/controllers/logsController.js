const fs = require('fs');
const path = require('path');
const usersRepository = require('../repositories/usersRepository');

async function getLogs(req, res, next) {
    const file = req.params.file.replace(':', '').replace('.log', '');

    if (res.locals.token.profile !== 'ADMIN'
        && !file.startsWith('A')
        && !file.startsWith('M')
        && !file.endsWith('-' + res.locals.token.id))
        return res.sendStatus(403);

    const filePath = path.resolve(__dirname, '..', '..', 'logs', file + '.log');
    if (!fs.existsSync(filePath)) return res.sendStatus(404);

    const content = fs.readFileSync(filePath);
    res.send(content);
}

async function getLogList(req, res, next) {
    const userId = req.query.userId;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const folderPath = path.resolve(__dirname, '..', '..', 'logs');
    let allFiles = fs.readdirSync(folderPath);

    if (userId) {
        const user = await usersRepository.getUser(userId, true);
        if (!user) return res.status(404).send(`There is no user with this id.`);

        const automationIds = user.automations.map(a => `A:${a.id}.log`);
        const monitorIds = user.monitors.map(m => `M:${m.id}.log`);
        const logs = [...automationIds, ...monitorIds, 'M:1.log', 'M:2.log', 'system.log', 'beholder.log'];
        allFiles = allFiles.filter(f => logs.includes(f) || f.endsWith(`-${userId}.log`));
    }

    const offset = (page - 1) * pageSize;
    const rows = allFiles.slice(offset, offset + pageSize);

    res.json({
        rows,
        count: allFiles.length
    })
}

module.exports = {
    getLogs,
    getLogList
}