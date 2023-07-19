const redis = require('redis');
const logger = require('./logger');

const LOGS = process.env.CACHE_LOGS === 'true';

module.exports = class Cache {

    constructor() {
        this.client = redis.createClient(process.env.CACHE_URL ? { url: process.env.CACHE_URL } : {});

        this.client.on("error", (error) => {
            logger('system', error);
        })

        this.client.connect();

        logger('system', 'Redis started!');
    }

    async flushAll() {
        return this.client.flushAll();
    }

    async get(key) {
        return JSON.parse(await this.client.get(key));
    }

    async getAll(...keys) {
        const values = await this.client.mGet(keys);
        const obj = {};
        keys.map((k, i) => obj[k] = JSON.parse(values[i]));
        return obj;
    }

    async setAll(keyValues, notify = true) {
        if (LOGS) logger('system', 'MSET ' + JSON.stringify({ keyValues, notify }));

        const keys = Object.keys(keyValues);
        const keyValuesArr = keys.map(key => [key, JSON.stringify(keyValues[key])]).flat();

        await this.client.mSet(keyValuesArr);

        if (notify) {
            keys.forEach(key => this.publish(key, keyValues[key]));
            if (LOGS) logger('system', 'MPUBLISH ' + JSON.stringify(keys));
        }
    }

    async set(key, value, notify = true, expireInSeconds = 0) {
        if (LOGS) logger('system', 'SET ' + JSON.stringify({ key, value }));

        if (expireInSeconds)
            await this.client.set(key, JSON.stringify(value), { EX: expireInSeconds });
        else
            await this.client.set(key, JSON.stringify(value));

        if (notify) {
            await this.publish(key, value);
            if (LOGS) logger('system', 'PUBLISH ' + JSON.stringify({ key, value }));
        }

    }

    unset(key) {
        if (LOGS) logger('system', 'DEL ' + key);
        return this.client.del(key);
    }

    async search(pattern) {
        const keys = await this.client.keys(pattern || '*');
        return this.getAll(...keys);
    }

    async publish(channel, value) {
        return this.client.publish(channel, JSON.stringify(value));
    }

    async subscribe(channel, callback) {

        if (channel.startsWith('*')) {
            this.client.pSubscribe(channel, (message, messageChannel) => {
                if (LOGS) logger(`system`, `MESSAGE ` + JSON.stringify({ messageChannel, message }));
                const obj = JSON.parse(message);
                callback({ ...obj, index: messageChannel });
            });
        }
        else {
            this.client.subscribe(channel, (message, messageChannel) => {
                if (channel === messageChannel) {
                    if (LOGS) logger(`system`, `MESSAGE ` + JSON.stringify({ messageChannel, message }));
                    callback(JSON.parse(message));
                }
            });
        }

        if (LOGS) logger(`system`, `SUBSCRIBE ` + channel);
    }

    async unsubscribe(channel) {
        if (LOGS) logger(`system`, `UNSUBSCRIBE ` + channel);

        if (channel.startsWith('*'))
            return this.client.pUnsubscribe(channel);
        else
            return this.client.unsubscribe(channel);
    }
}