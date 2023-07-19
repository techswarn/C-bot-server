const Beholder = require('../beholder');
const logger = require('./logger');

module.exports = class TestCache {

    automationInterval = parseInt(process.env.AUTOMATION_INTERVAL);
    nextExecution = {};

    constructor(automations, user, symbol) {
        this.MEMORY = {};
        this.automations = automations;
        this.symbol = symbol;
        this.user = user;
        this.beholder = new Beholder(null, this);
    }

    async publish(channel, value) {

        if (!value.time && (!value.current || !value.current.time)) return [];

        const results = [];

        for (let i = 0; i < this.automations.length; i++) {
            const automation = this.automations[i];
            
            if ((value.time || value.current.time) <= this.nextExecution[automation.id]) continue;

            const indexes = automation.indexes.split(',');
            if (!indexes.includes(channel)) continue;

            const isChecked = indexes.every(ix => this.MEMORY[ix] !== null && this.MEMORY[ix] !== undefined);
            if (!isChecked) continue;

            const invertedCondition = this.beholder.shouldntInvert(automation, channel) ? '' : this.beholder.invertCondition(channel, automation.conditions);
            const evalCondition = automation.conditions + (invertedCondition ? ' && ' + invertedCondition : '');
            if (!evalCondition) continue;

            const conditionIsTrue = Function("MEMORY", "return " + evalCondition)(this.MEMORY);
            if (!conditionIsTrue) continue;

            logger(`backtest-${automation.userId}`, evalCondition);

            const action = automation.actions.find(a => a.type === 'ORDER');
            if(!action) continue;

            try {
                const order = await this.beholder.placeOrder(this.user, automation, action, this.symbol);
                if (order.status === 'FILLED') {
                    order.time = order.transactTime = value.time || value.current.time;

                    this.nextExecution[automation.id] = order.transactTime + this.automationInterval;

                    results.push(order);
                }
            }
            catch (err) {
                logger(`backtest-${automation.userId}`, err.message);
                continue;
            }
        }

        return results;
    }

    async subscribe() {
        return true;
    }

    async unsubcribe() {
        return true;
    }

    async get(key) {
        return this.MEMORY[key];
    }

    async getAll() {
        return { ...this.MEMORY };
    }

    set(key, value, notify = false) {
        this.MEMORY[key] = value;

        if (notify)
            return this.publish(key, value);
    }

    async setAll(keyValues, notify = false) {
        const keys = Object.keys(keyValues);
        keys.forEach(key => this.MEMORY[key] = keyValues[key]);

        const results = [];
        if (notify) {
            for (const key of keys) {
                const partial = await this.publish(key, keyValues[key]);
                results.push(...partial);
            }
        }

        return results;
    }

    unset(key) {
        delete this.MEMORY[key];
    }

    async search(keys) {
        return this.getAll(...keys);
    }
}