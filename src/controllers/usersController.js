const settingsRepository = require('../repositories/settingsRepository');
const usersRepository = require('../repositories/usersRepository');
const automationsRepository = require('../repositories/automationsRepository');
const monitorsRepository = require('../repositories/monitorsRepository');
const { monitorTypes } = require('../repositories/monitorsRepository');
const ordersRepository = require('../repositories/ordersRepository');
const orderTemplatesRepository = require('../repositories/orderTemplatesRepository');
const withdrawTemplatesRepository = require('../repositories/withdrawTemplatesRepository');
const favoriteSymbolsRepository = require('../repositories/favoriteSymbolsRepository');
const actionsRepository = require('../repositories/actionsRepository');
const gridsRepository = require('../repositories/gridsRepository');
const webHooksRepository = require('../repositories/webHooksRepository');
const strategiesRepository = require('../repositories/strategiesRepository');
const db = require('../db');
const appEm = require('../app-em');
const logger = require('../utils/logger');
const email = require('../utils/email');
const sms = require('../utils/sms');
const telegram = require('../utils/telegram');
const agenda = require('../agenda');
const hydra = require('../hydra');
const crypto = require('../utils/crypto');
const push = require('../utils/push');

async function getUsers(req, res, next) {
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const search = req.params.search;

    const result = await usersRepository.getUsers(search, page, pageSize);
    result.rows = result.rows.map(r => {
        const plainUser = r.get({ plain: true });
        plainUser.password = '';
        plainUser.secretKey = '';
        plainUser.futuresSecret = '';
        return plainUser;
    })

    res.json(result);
}

function generatePassword() {
    return Math.random().toString(36).slice(-8);
}

async function startUserMonitors(user) {
    const systemMonitors = await monitorsRepository.getActiveSystemMonitors();
    const userDataMonitor = systemMonitors.find(m => m.type === monitorTypes.USER_DATA);
    const futuresMonitor = systemMonitors.find(m => m.type === monitorTypes.FUTURES_DATA);

    if (!user.monitors) user.monitors = [];
    if (userDataMonitor && user.accessKey && user.secretKey) user.monitors.push(userDataMonitor);
    if (futuresMonitor && user.futuresKey && user.futuresSecret) user.monitors.push(futuresMonitor);

    await Promise.all(user.monitors.map(m => {
        setTimeout(() => {
            switch (m.type) {
                case monitorTypes.USER_DATA: {
                    const decryptedUser = { ...(user.get({ plain: true })), secretKey: crypto.decrypt(user.secretKey) };
                    return appEm.startUserDataMonitor(decryptedUser, m.id, m.broadcastLabel, m.logs);
                }
                case monitorTypes.FUTURES_DATA: {
                    const decryptedUser = { ...(user.get({ plain: true })), futuresSecret: crypto.decrypt(user.futuresSecret) };
                    return appEm.startFuturesMonitor(decryptedUser, m.id, m.broadcastLabel, m.logs);
                }
                case monitorTypes.CANDLES:
                    return appEm.startChartMonitor(user.id, m.id, m.symbol, m.interval, m.indexes, m.broadcastLabel, m.logs);
            }
        }, 250)
    }))
}

async function stopUserMonitors(user) {
    const systemMonitors = await monitorsRepository.getActiveSystemMonitors();
    const userDataMonitor = systemMonitors.find(m => m.type === monitorTypes.USER_DATA);
    const futuresMonitor = systemMonitors.find(m => m.type === monitorTypes.FUTURES_DATA);

    if (!user.monitors) user.monitors = [];
    if (user.accessKey && user.secretKey && userDataMonitor) user.monitors.push(userDataMonitor);
    if (user.futuresKey && user.futuresSecret && futuresMonitor) user.monitors.push(futuresMonitor);

    await Promise.all(user.monitors.map(async (monitor) => {
        setTimeout(() => {
            switch (monitor.type) {
                case monitorTypes.USER_DATA:
                    return appEm.stopUserDataMonitor(user, monitor.id, monitor.logs);
                case monitorTypes.FUTURES_DATA:
                    return appEm.stopFuturesMonitor(user, monitor.id, monitor.logs);
                case monitorTypes.CANDLES:
                    return appEm.stopChartMonitor(monitor.id, monitor.symbol, monitor.interval, monitor.indexes, monitor.logs);
            }
        }, 250)

        if (![monitorTypes.USER_DATA, monitorTypes.FUTURES_DATA].includes(monitor.type))
            await monitorsRepository.updateMonitor(monitor.id, { isActive: false });
    }))
}

async function startUser(req, res, next) {
    const id = req.params.id;

    const user = await usersRepository.getUser(id, true);
    if (user.isActive) return res.sendStatus(204);

    user.isActive = true;

    try {
        await startUserMonitors(user);

        await user.save();

        await sendStartAlerts(user);

        user.password = '';
        user.secretKey = '';
        user.futuresSecret = '';
        res.json(user);
    } catch (err) {
        logger(`system`, err);
        res.status(500).send(err.message);
    }
}

async function stopUser(req, res, next) {
    const id = req.params.id;

    const user = await usersRepository.getUser(id, true);
    if (!user.isActive) return res.sendStatus(204);

    user.isActive = false;

    try {
        await stopUserMonitors(user);
        await stopUserAutomations(user);
        await user.save();

        await sendStopAlerts(user);

        user.password = '';
        user.secretKey = '';
        user.futuresSecret = '';
        res.json(user);
    } catch (err) {
        logger(`system`, err);
        res.status(500).send(err.message);
    }
}

async function resetUserPassword(req, res, next) {
    const id = req.params.id;
    const password = generatePassword();

    const user = await usersRepository.updateUser(id, {
        password
    })

    try {
        await sendResetAlerts(user.get({ plain: true }), password);
    } catch (err) {
        logger(`system`, err);
        return res.status(500).send(err.message);
    }

    user.password = '';
    user.secretKey = '';
    user.futuresSecret = '';
    res.json(user);
}

async function sendResetAlerts(user, newPassword) {
    const promises = [];
    const settings = await settingsRepository.getDefaultSettings();

    if (settings.sendGridKey)
        promises.push(email(settings, `
        Hello ${user.name.split(' ')[0]},

        Your password at Auto Crypto Bot was resetted.

        Access the platform and use this email and the new password: ${newPassword}

        ${process.env.BEHOLDER_URL}

        Enjoy!
        `, user.email, 'Auto Crypto Bot password resetted!'));

    if (user.phone && settings.twilioSid)
        promises.push(sms(settings, `Your password at Auto Crypto Bot was resetted. Look your email!`, user.phone));

    if (user.telegramChat && settings.telegramBot)
        promises.push(telegram(settings, `
        Hello ${user.name.split(' ')[0]},

        Your password at Auto Crypto Bot was resetted.

        Access the platform and use this email and the new password: ${newPassword}

        ${process.env.BEHOLDER_URL}

        Enjoy!
        `, user.telegramChat))

    await Promise.all(promises);
}

async function sendWelcomeAlerts(user, newPassword) {
    const promises = [];
    const settings = await settingsRepository.getDefaultSettings();

    if (settings.sendGridKey)
        promises.push(email(settings, `
        Hello ${user.name.split(' ')[0]},

        Your account at Auto Crypto Bot was created.

        Access the platform and use this email and your password: ${newPassword}

        ${process.env.BEHOLDER_URL}

        After the first login, go to Settings area and change for a new one.

        Start a conversation with our Telegram Bot, in order to receive alerts there too:

        https://t.me/${settings.telegramBot}

        Enjoy!
        `, user.email, 'Auto Crypto Bot account created!'));

    if (user.phone && settings.twilioSid)
        promises.push(sms(settings, `Your account at Auto Crypto Bot was created. Look your email!`, user.phone));

    await Promise.all(promises);
}

async function sendStopAlerts(user) {
    const promises = [];
    const settings = await settingsRepository.getDefaultSettings();

    const fullText = `Hello ${user.name.split(' ')[0]},

    Your account at Auto Crypto Bot was stopped.

    Sorry!`;

    if (settings.sendGridKey)
        promises.push(email(settings, fullText, user.email, 'Auto Crypto Bot account stopped!'));

    const shortText = `Your account at Auto Crypto Bot was stopped. Sorry!`;

    if (user.phone && settings.twilioSid)
        promises.push(sms(settings, shortText, user.phone));

    if (user.pushToken)
        promises.push(push.send(user, shortText, 'Auto Crypto Bot Notification', {
            text: shortText,
            type: 'error'
        }));

    if (user.telegramChat && settings.telegramBot)
        promises.push(telegram(settings, fullText, user.telegramChat))

    await Promise.all(promises);
}

async function sendStartAlerts(user) {
    const promises = [];
    const settings = await settingsRepository.getDefaultSettings();

    const fullText = `Hello ${user.name.split(' ')[0]},

    Your account at Auto Crypto Bot was (re)started.

    Enjoy!`;

    if (settings.sendGridKey)
        promises.push(email(settings, fullText, user.email, 'Auto Crypto Bot account started!'));

    const shortText = `Your account at Auto Crypto Bot was (re)started. Enjoy!`;

    if (user.phone && settings.twilioSid)
        promises.push(sms(settings, shortText, user.phone));

    if (user.pushToken)
        promises.push(push.send(user, shortText, 'Auto Crypto Bot Notification', {
            text: shortText,
            type: 'success'
        }));

    if (user.telegramChat && settings.telegramBot)
        promises.push(telegram(settings, fullText, user.telegramChat))

    await Promise.all(promises);
}

async function insertUser(req, res, next) {
    const newUser = req.body;
    const password = generatePassword();

    newUser.password = password;

    const user = await usersRepository.insertUser(newUser);

    try {
        if (user.isActive)
            await sendWelcomeAlerts(user.get({ plain: true }), password);
    } catch (err) {
        logger(`system`, err);
        return res.status(500).send(err.message);
    }

    const plainUser = user.get({ plain: true });
    plainUser.password = '';
    res.status(201).json(plainUser);
}

async function updateUser(req, res, next) {
    const userId = req.params.id;
    const newUser = req.body;
    const token = res.locals.token;

    if (token.profile !== 'ADMIN' && token.id !== userId)
        return res.sendStatus(403);

    const currentUser = await usersRepository.getUser(userId);
    const updatedUser = await usersRepository.updateUser(userId, newUser);

    try {
        if (!currentUser.isActive && updatedUser.isActive) {
            await startUserMonitors(updatedUser);
            await sendStartAlerts(updatedUser);
        }
        else if (currentUser.isActive && !updatedUser.isActive) {
            await stopUserMonitors(updatedUser);
            //await stopUserAutomations(user);
            await sendStopAlerts(updatedUser);
        }

        res.json(updatedUser);
    } catch (err) {
        logger(`system`, err);
        return res.status(500).send(err.message);
    }
}

async function stopUserAutomations(user) {
    if (!user.automations || !user.automations.length) return;
    await Promise.all(user.automations.map(async (automation) => {
        if (!automation.isActive) return;

        if (automation.schedule)
            agenda.cancelSchedule(automation.id);
        else
            hydra.deleteBrain(automation.get({ plain: true }));

        await automationsRepository.updateAutomation(automation.id, { isActive: false });

        if (automation.logs) logger(`A:${automation.id}`, `Automation ${automation.name} has stopped!`);
    }))
}

async function deleteUser(req, res, next) {
    const id = req.params.id;
    const user = await usersRepository.getUser(id, true);

    if (user.isActive) {
        await stopUserMonitors(user);
        //await stopUserAutomations(user);
        await sendStopAlerts(user);
    }

    const transaction = await db.transaction();

    try {
        await strategiesRepository.deleteAll(id, transaction);
        await favoriteSymbolsRepository.deleteAll(id, transaction);
        await ordersRepository.deleteAll(id, transaction);
        await monitorsRepository.deleteAll(id, transaction);
        await webHooksRepository.deleteAll(id, transaction);

        if (user.automations && user.automations.length) {
            const automationIds = user.automations.map(a => a.id);
            await actionsRepository.deleteActions(automationIds, transaction);
            await gridsRepository.deleteGrids(automationIds, transaction);
            await automationsRepository.deleteAll(id, transaction);
        }

        await withdrawTemplatesRepository.deleteAll(id, transaction);
        await orderTemplatesRepository.deleteAll(id, transaction);
        await usersRepository.deleteUser(id, transaction);

        await transaction.commit();
        res.sendStatus(204);
    }
    catch (err) {
        await transaction.rollback();
        logger('system', err);
        return res.status(500).json(`There was an error to delete the user. Check the system logs.`);
    }
}

async function getActiveUsers(req, res, next) {
    let users = await usersRepository.getActiveUsers();
    users = users.map(u => {
        const plainUser = u.get({ plain: true });
        plainUser.secretKey = '';
        plainUser.futuresSecret = '';
        plainUser.password = '';
        return plainUser;
    })
    res.json(users);
}

module.exports = {
    insertUser,
    getUsers,
    deleteUser,
    updateUser,
    startUser,
    stopUser,
    resetUserPassword,
    getActiveUsers
}
