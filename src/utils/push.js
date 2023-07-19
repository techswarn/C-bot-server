const axios = require('axios');
const usersRepository = require('../repositories/usersRepository');

const cache = {};

function addToCache(userId, data) {
    if (cache[userId] && cache[userId].length)
        cache[userId].push(data);
    else
        cache[userId] = [data];
}

function getFromCache(userId) {
    if (!cache[userId]) return [];

    const messages = [...cache[userId]];
    delete cache[userId];
    return messages;
}

async function send(user, body, title = 'Auto Crypto Bot Notification', data = {}) {

    if (typeof user === 'number')
        user = await usersRepository.getUser(user, false);

    if (!user) throw new Error(`The user object is required to send Push Notifications!`);
    if (!user.pushToken) return false;

    data.date = new Date();

    addToCache(user.id, data);

    const response = await axios.post('https://exp.host/--/api/v2/push/send', {
        to: user.pushToken,
        title,
        body,
        data
    })

    if (response.data.errors || response.data.data.status === 'error') {
        user.pushToken = '';
        await user.save();

        throw new Error(`There was an error sending push notifications to user ${user.id}.\n${JSON.stringify(response.data)}`);
    }
}

module.exports = {
    send,
    getFromCache
}