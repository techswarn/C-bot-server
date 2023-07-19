const { getDefaultSettings } = require('./repositories/settingsRepository');
const { actionTypes } = require('./repositories/actionsRepository');
const orderTemplatesRepository = require('./repositories/orderTemplatesRepository');
const automationsRepository = require('./repositories/automationsRepository');
const withdrawTemplatesRepository = require('./repositories/withdrawTemplatesRepository');
const gridsRepository = require('./repositories/gridsRepository');
const { getSymbol } = require('./repositories/symbolsRepository');
const { STOP_TYPES, LIMIT_TYPES, insertOrder } = require('./repositories/ordersRepository');
const db = require('./db');
const logger = require('./utils/logger');
const { getUserDecrypted } = require('./repositories/usersRepository');
const appEm = require('./app-em');

const Exchange = require('./utils/exchange');
const Cache = require('./utils/cache');

const LOGS = process.env.BEHOLDER_LOGS === 'true';
const INTERVAL = parseInt(process.env.AUTOMATION_INTERVAL || 0);

module.exports = class Beholder {

    LOCK_BRAIN = {};

    constructor(automations, testCache = false) {
        this.cache = testCache ? testCache : new Cache();
        this.listener = testCache ? testCache : new Cache();

        this.BRAIN = {};
        this.BRAIN_INDEX = {};

        if (!automations || !automations.length) return;

        setTimeout(() => {
            automations.filter(auto => auto.isActive && !auto.schedule).map(auto => this.updateBrain(auto));
            logger('beholder', `Auto Crypto Bot Brain has started for user ${automations[0].userId}!`);
        }, 1000)
    }

    isLocked(automationId) {
        if (Array.isArray(automationId))
            return Object.keys(this.LOCK_BRAIN).some(k => this.LOCK_BRAIN[k] === true);
        return this.LOCK_BRAIN[automationId] === true;
    }

    setLocked(automationId, value) {
        if (Array.isArray(automationId))
            return automationId.map(id => this.LOCK_BRAIN[id] = value);
        return this.LOCK_BRAIN[automationId] = value;
    }

    updateBrainIndex(index, automation) {
        if (!this.BRAIN_INDEX[index]) this.BRAIN_INDEX[index] = [];
        this.BRAIN_INDEX[index].push(automation.id);

        this.listener.subscribe(index, async (message) => {
            const results = await this.updatedMemory(index, message.index);
            if (results && results.length) {
                results.map(r => appEm.sendMessage(automation.userId, { notification: r }));
            }
        })
    }

    deleteBrainIndex(indexes, automationId) {
        if (typeof indexes === 'string') indexes = indexes.split(',');
        indexes.forEach(ix => {
            if (!this.BRAIN_INDEX[ix] || this.BRAIN_INDEX[ix].length === 0) {
                this.listener.unsubscribe(ix);
                return;
            }

            const pos = this.BRAIN_INDEX[ix].findIndex(id => id === automationId);
            this.BRAIN_INDEX[ix].splice(pos, 1);

            if (!this.BRAIN_INDEX[ix].length) this.listener.unsubscribe(ix);
        });
    }

    updateBrain(automation) {
        this.BRAIN[automation.id] = automation;
        automation.indexes.split(',').map(ix => this.updateBrainIndex(ix, automation));
    }

    deleteBrain(automation) {
        try {
            this.setLocked(automation.id, true);

            delete this.BRAIN[automation.id];
            this.deleteBrainIndex(automation.indexes.split(','), automation.id);
            if (automation.logs) {
                logger('A:' + automation.id, `Automation removed from BRAIN #${automation.id}`);
            }
        }
        finally {
            this.setLocked(automation.id, false);
        }
    }

    findAutomations(indexKey) {
        const ids = this.BRAIN_INDEX[indexKey];
        if (!ids) return [];
        return [...new Set(ids)].map(id => this.BRAIN[id]);
    }

    invertCondition(memoryKey, conditions) {
        const conds = conditions.split(' && ');
        const condToInvert = conds.find(c => c.indexOf(memoryKey) !== -1 && c.indexOf('current') !== -1);
        if (!condToInvert) return false;

        if (condToInvert.indexOf('>=') != -1) return condToInvert.replace('>=', '<').replace(/current/g, 'previous');
        if (condToInvert.indexOf('<=') != -1) return condToInvert.replace('<=', '>').replace(/current/g, 'previous');
        if (condToInvert.indexOf('>') != -1) return condToInvert.replace('>', '<').replace(/current/g, 'previous');
        if (condToInvert.indexOf('<') != -1) return condToInvert.replace('<', '>').replace(/current/g, 'previous');
        if (condToInvert.indexOf('!') != -1) return condToInvert.replace('!', '=').replace(/current/g, 'previous');
        if (condToInvert.indexOf('==') != -1) return condToInvert.replace('==', '!=').replace(/current/g, 'previous');
        return false;
    }

    async sendSms(settings, user, automation) {
        if (!user.phone) throw new Error(`This user doesn't have phone.`);

        await require('./utils/sms')(settings, automation.name + ' has fired!', user.phone);
        if (automation.logs) logger('A:' + automation.id, `SMS sent!`);
        return { text: `SMS sent from automation '${automation.name}'`, type: 'success' };
    }

    async sendEmail(settings, user, automation, subject) {
        if (!user.email) throw new Error(`This user doesn't have email.`);

        await require('./utils/email')(settings, automation.name + ' has fired!', user.email, subject);
        if (automation.logs) logger('A:' + automation.id, `E-mail sent!`);
        return { text: `E-mail sent from automation '${automation.name}'`, type: 'success' };
    }

    async parsePrice(symbol, price, userId, position = null) {
        if (price.startsWith("LAST_CANDLE_")) {
            const key = price.replace(/_(OPEN|HIGH|LOW|CLOSE)/i, "");
            const memory = await this.cache.get(`${symbol}:${key}`);

            switch (price.replace(key, "")) {
                case "_OPEN": return memory.current.open;
                case "_HIGH": return memory.current.high;
                case "_LOW": return memory.current.low;
                case "_CLOSE": return memory.current.close;
            }
        }

        switch (price) {
            case "BOOK_ASK": {
                const memory = await this.cache.get(`${symbol}:BOOK`);
                return memory.current.bestAsk;
            }
            case "BOOK_BID": {
                const memory = await this.cache.get(`${symbol}:BOOK`);
                return memory.current.bestBid;
            }
            case "LAST_ORDER_AVG": {
                const memory = await this.cache.get(`${symbol}:LAST_ORDER_${userId}`);
                return memory.avgPrice;
            }
            case "LAST_ORDER_LIMIT": {
                const memory = await this.cache.get(`${symbol}:LAST_ORDER_${userId}`);
                return memory.limitPrice || memory.avgPrice;
            }
            case "LAST_ORDER_STOP": {
                const memory = await this.cache.get(`${symbol}:LAST_ORDER_${userId}`);
                return memory.stopPrice || memory.avgPrice;
            }
            case "MARK_PRICE": {
                const memory = await this.cache.get(`${symbol}:MARK_PRICE`);
                return memory.current.markPrice;
            }
            case "INDEX_PRICE": {
                const memory = await this.cache.get(`${symbol}:MARK_PRICE`);
                return memory.current.indexPrice;
            }
            case "LAST_LIQ_PRICE": {
                const memory = await this.cache.get(`${symbol}:LAST_LIQ`);
                return memory.price;
            }
            case "POSITION_ENTRY": {
                return position.entryPrice;
            }
            case "POSITION_LIQ_PRICE": {
                return position.liquidationPrice;
            }
            case "FLAST_ORDER_AVG": {
                const memory = await this.cache.get(`${symbol}:FLAST_ORDER_${userId}`);
                return memory.avgPrice;
            }
            case "FLAST_ORDER_LIMIT": {
                const memory = await this.cache.get(`${symbol}:FLAST_ORDER_${userId}`);
                return memory.limitPrice || memory.avgPrice;
            }
            case "FLAST_ORDER_STOP": {
                const memory = await this.cache.get(`${symbol}:FLAST_ORDER_${userId}`);
                return memory.stopPrice || memory.avgPrice;
            }
        }
    }

    async calcPrice(orderTemplate, symbol, isStopPrice, position = null) {
        const isFuture = position !== null;
        const tickSize = isFuture ? parseFloat(symbol.fTickSize) : parseFloat(symbol.tickSize);
        let newPrice, factor;

        if ([...LIMIT_TYPES, "TRAILING_STOP_MARKET"].includes(orderTemplate.type)) {
            try {
                if (!isStopPrice) {
                    if (parseFloat(orderTemplate.limitPrice)) return orderTemplate.limitPrice;
                    newPrice = await this.parsePrice(orderTemplate.symbol, orderTemplate.limitPrice, orderTemplate.userId, position);
                    newPrice *= orderTemplate.limitPriceMultiplier;
                }
                else {
                    if (parseFloat(orderTemplate.stopPrice)) return orderTemplate.stopPrice;
                    newPrice = await this.parsePrice(orderTemplate.symbol, orderTemplate.stopPrice, orderTemplate.userId, position);
                    newPrice *= orderTemplate.stopPriceMultiplier;
                }
            }
            catch (err) {
                if (isStopPrice)
                    throw new Error(`Error trying to calc Stop Price with params: ${orderTemplate.stopPrice} x ${orderTemplate.stopPriceMultiplier}. Error: ${err.message}`);
                else
                    throw new Error(`Error trying to calc Limit Price with params: ${orderTemplate.limitPrice} x ${orderTemplate.limitPriceMultiplier}. Error: ${err.message}`);
            }
        }
        else {
            const memory = await this.cache.get(`${orderTemplate.symbol}:BOOK`);
            if (!memory)
                throw new Error(`Error trying to get market price. OTID: ${orderTemplate.id}, ${isStopPrice}. No Book.`);

            newPrice = orderTemplate.side === 'BUY' ? memory.current.bestAsk : memory.current.bestBid;
            newPrice = isStopPrice ? newPrice * orderTemplate.stopPriceMultiplier : newPrice * orderTemplate.limitPriceMultiplier;
        }

        factor = Math.floor(newPrice / tickSize);
        return (factor * tickSize).toFixed(symbol.quotePrecision);
    }

    async calcQty(orderTemplate, price, symbol, position = null) {
        const isFuture = position !== null;

        let asset;
        const walletIndex = isFuture ? "FWALLET" : "WALLET";

        if (orderTemplate.side === 'BUY' || isFuture) {
            asset = parseFloat(await this.cache.get(`${symbol.quote}:${walletIndex}_${orderTemplate.userId}`));
            if (!asset) throw new Error(`There is no ${symbol.quote} in your wallet to place the order.`);
        }
        else {
            asset = parseFloat(await this.cache.get(`${symbol.base}:${walletIndex}_${orderTemplate.userId}`));
            if (!asset) throw new Error(`There is no ${symbol.base} in your wallet to place a sell.`);
        }

        let qty = orderTemplate.quantity.replace(',', '.');
        if (parseFloat(qty)) return qty;

        const multiplier = orderTemplate.quantityMultiplier;
        const stepSize = isFuture ? parseFloat(symbol.fStepSize) : parseFloat(symbol.stepSize);

        let newQty, factor;
        if (/^(MAX_F?WALLET)$/.test(orderTemplate.quantity)) {
            if (orderTemplate.side === 'BUY')
                newQty = (parseFloat(asset) / parseFloat(price)) * (multiplier > 1 ? 1 : multiplier);
            else
                newQty = parseFloat(asset) * (multiplier > 1 ? 1 : multiplier);
        }
        else if (orderTemplate.quantity === 'MIN_NOTIONAL') {
            const minNotional = isFuture ? parseFloat(symbol.fMinNotional) : parseFloat(symbol.minNotional);
            newQty = (minNotional / parseFloat(price)) * (multiplier < 1 ? 1 : multiplier);
        }
        else if (orderTemplate.quantity === 'POSITION_AMT') {
            if (!position)
                throw new Error(`There is no position to use as qty reference for ${orderTemplate.symbol}.`);

            newQty = parseFloat(position.positionAmt) * multiplier;
        }
        else if (/^(F?LAST_ORDER_QTY)$/.test(orderTemplate.quantity)) {
            const lastOrderIndex = isFuture ? "FLAST_ORDER" : "LAST_ORDER";
            const lastOrder = await this.cache.get(`${orderTemplate.symbol}:${lastOrderIndex}_${orderTemplate.userId}`);
            if (!lastOrder)
                throw new Error(`There is no last order to use as qty reference for ${orderTemplate.symbol}.`);

            newQty = parseFloat(lastOrder.quantity) * multiplier;
            if (!isFuture && orderTemplate.side === 'SELL' && newQty > asset) newQty = asset;
        }

        factor = Math.floor(newQty / stepSize);
        return (factor * stepSize).toFixed(symbol.basePrecision);
    }

    async hasEnoughAssets(userId, symbol, order, price) {
        const qty = parseFloat(order.quantity);
        if (order.side === 'BUY')
            return parseFloat(await this.cache.get(`${symbol.quote}:WALLET_${userId}`)) >= (price * qty);
        else
            return parseFloat(await this.cache.get(`${symbol.base}:WALLET_${userId}`)) >= qty;
    }

    async execTest(automation, order, symbol) {

        order.quantity = order.quantity ? parseFloat(order.quantity) : 0;
        order.quoteOrderQuantity = order.options.quoteOrderQty ? parseFloat(order.options.quoteOrderQty) : 0;

        const book = await this.cache.get(`${automation.symbol}:BOOK`);
        const currentPrice = order.side === 'BUY' ? book.current.bestAsk : book.current.bestBid;
        const orderValue = order.quoteOrderQuantity ? order.quoteOrderQuantity : order.quantity * currentPrice;
        const commission = orderValue * 0.001;//ou 0.00075 com BNB

        const quoteAsset = await this.cache.get(`${symbol.quote}:WALLET_${automation.userId}`);
        const baseAsset = await this.cache.get(`${symbol.base}:WALLET_${automation.userId}`);
        const baseQuantity = order.quantity ? order.quantity : order.quoteOrderQuantity / currentPrice;

        if (order.side === 'BUY') {
            await this.cache.set(`${symbol.quote}:WALLET_${automation.userId}`, quoteAsset - orderValue - commission);
            await this.cache.set(`${symbol.base}:WALLET_${automation.userId}`, baseAsset + baseQuantity);
        }
        else {
            await this.cache.set(`${symbol.quote}:WALLET_${automation.userId}`, quoteAsset + orderValue - commission);
            await this.cache.set(`${symbol.base}:WALLET_${automation.userId}`, baseAsset - baseQuantity);
        }

        return {
            automationId: automation.id,
            symbol: order.symbol,
            userId: automation.userId,
            quantity: baseQuantity,
            type: order.options.type,
            side: order.side,
            limitPrice: LIMIT_TYPES.includes(order.options.type) ? order.limitPrice : null,
            stopPrice: STOP_TYPES.includes(order.options.type) ? order.stopPrice : null,
            orderId: '1',
            clientOrderId: '1',
            status: 'FILLED',
            isMaker: true,
            avgPrice: currentPrice,
            commission,
            net: orderValue - commission
        };
    }

    async calcQuoteQty(orderTemplate, symbol) {
        if (orderTemplate.type !== 'MARKET' || parseFloat(orderTemplate.quantity)) throw new Error(`Only MARKET orders can calc quote qty.`);

        const multiplier = orderTemplate.quantityMultiplier;

        if (orderTemplate.quantity === 'MAX_WALLET') {
            if (orderTemplate.side !== 'BUY') throw new Error(`Only MARKET BUY orders can calc quote qty with MAX_WALLET.`);

            const asset = parseFloat(await this.cache.get(`${symbol.quote}:WALLET_${orderTemplate.userId}`));
            if (!asset) throw new Error(`There is no ${symbol.quote} in your wallet to place a buy.`);

            return (parseFloat(asset) * (multiplier > 1 ? 1 : multiplier)).toFixed(symbol.quotePrecision);
        }
        else if (orderTemplate.quantity === 'MIN_NOTIONAL') {
            return (parseFloat(symbol.minNotional) * (multiplier < 1 ? 1 : multiplier)).toFixed(symbol.quotePrecision);
        }
        else if (orderTemplate.quantity === 'QUOTE_QTY') {
            return multiplier;
        }
        else
            throw new Error(`Invalid Order Template Quantity. ${orderTemplate.quantity}`);
    }

    async calcStopPrice(orderTemplate, symbol, position = null) {
        const stopPrice = await this.calcPrice(orderTemplate, symbol, true, position);

        if (!isFinite(stopPrice) || !stopPrice)
            throw new Error(`Error in calcPrice function, params: OTID ${orderTemplate.id}, $: ${stopPrice}, stop: true`);

        return stopPrice;
    }

    async adjustMarginType(orderTemplate, exchange, position) {
        if (!orderTemplate.marginType) return false;
        if (!position) return exchange.futuresMargin(orderTemplate.symbol, orderTemplate.marginType);

        const currentMargin = position.marginType === 'cross' ? 'CROSSED' : 'ISOLATED';
        if (currentMargin !== orderTemplate.marginType)
            return exchange.futuresMargin(orderTemplate.symbol, orderTemplate.marginType);

        return false;
    }

    async adjustLeverage(orderTemplate, exchange, position) {
        if (!orderTemplate.leverage) return false;
        if (!position) return exchange.futuresLeverage(orderTemplate.symbol, orderTemplate.leverage);

        if (parseInt(position.leverage) !== orderTemplate.leverage)
            return exchange.futuresLeverage(orderTemplate.symbol, orderTemplate.leverage);

        return false;
    }

    async placeOrder(user, automation, action, symbolObject = false) {

        if (!user || !automation || !action)
            throw new Error(`All parameters are required to place an order.`);

        if (!action.orderTemplateId)
            throw new Error(`There is no order template for '${automation.name}', action #${action.id}`);

        const orderTemplate = action.orderTemplate
            ? { ...action.orderTemplate }
            : (await orderTemplatesRepository.getOrderTemplate(user.id, action.orderTemplateId)).get({ plain: true });

        if (orderTemplate.type === 'TRAILING_STOP') {
            orderTemplate.type = 'MARKET';
            orderTemplate.limitPrice = null;
            orderTemplate.stopPrice = null;
        }

        const symbol = symbolObject ? symbolObject : await getSymbol(orderTemplate.symbol);

        const order = {
            symbol: orderTemplate.symbol.toUpperCase(),
            side: orderTemplate.side.toUpperCase(),
            options: { type: orderTemplate.type.toUpperCase() }
        }

        const isFuture = orderTemplate.leverage !== undefined && orderTemplate.leverage !== null;

        let position = null;
        if (isFuture)
            position = await this.cache.get(`${automation.symbol}:POSITION_${automation.userId}`);

        const dynamicPrices = ['MIN_NOTIONAL', 'MAX_WALLET', 'QUOTE_QTY'];
        const isDynamicBuy = order.side === 'BUY' && dynamicPrices.includes(orderTemplate.quantity);
        if (!isFuture && order.options.type === 'MARKET' &&
            (isDynamicBuy || ['MIN_NOTIONAL', 'QUOTE_QTY'].includes(orderTemplate.quantity))) {
            order.options.quoteOrderQty = await this.calcQuoteQty(orderTemplate, symbol);
        }
        else {
            let price = await this.calcPrice(orderTemplate, symbol, false, position);

            if (!isFinite(price) || !price)
                throw new Error(`Error in calcPrice function, params: OTID ${orderTemplate.id}, $: ${price}, stop: false, position: ${JSON.stringify(position)}`);

            if (LIMIT_TYPES.includes(order.options.type))
                order.limitPrice = price;

            const quantity = await this.calcQty(orderTemplate, price, symbol, position);
            if (!isFinite(quantity) || !quantity)
                throw new Error(`Error in calcQty function, params: OTID ${orderTemplate.id}, $: ${price}, qty: ${quantity}, position: ${JSON.stringify(position)}`);

            order.quantity = quantity;

            if (STOP_TYPES.includes(order.options.type))
                order.options.stopPrice = await this.calcStopPrice(orderTemplate, symbol, position);

            if (!isFuture) {
                const hasEnough = await this.hasEnoughAssets(user.id, symbol, order, price);
                if (!hasEnough)
                    throw new Error(`You wanna ${order.side} ${order.quantity} ${order.symbol} but you haven't enough assets.`);
            }
            else {
                if (order.options.type === "TRAILING_STOP_MARKET") {
                    order.options.activationPrice = await this.calcPrice(orderTemplate, symbol, false, position);
                    order.options.callbackRate = orderTemplate.stopPriceMultiplier;
                }

                if (orderTemplate.reduceOnly !== null && orderTemplate.reduceOnly !== undefined)
                    order.options.reduceOnly = orderTemplate.reduceOnly;
            }
        }

        if (automation.test) return this.execTest(automation, order, symbol);

        let result;
        const exchange = new Exchange(user, isFuture);

        try {
            if (isFuture) {
                if (orderTemplate.leverage > 0) {
                    const leverageResult = await this.adjustLeverage(orderTemplate, exchange, position);
                    if (leverageResult.code !== undefined && leverageResult.code < 0) throw new Error(leverageResult.msg);
                }

                if (orderTemplate.marginType) {
                    const marginResult = await this.adjustMarginType(orderTemplate, exchange, position);
                    if (marginResult.code !== undefined && marginResult.code < 0) throw new Error(marginResult.msg);
                }
            }

            if (order.side === 'BUY') {
                if (isFuture)
                    result = await exchange.futuresBuy(order.symbol, order.quantity, order.limitPrice, order.options);
                else
                    result = await exchange.buy(order.symbol, order.quantity, order.limitPrice, order.options);
            }
            else {
                if (isFuture)
                    result = await exchange.futuresSell(order.symbol, order.quantity, order.limitPrice, order.options);
                else
                    result = await exchange.sell(order.symbol, order.quantity, order.limitPrice, order.options);
            }

            if (result.code !== undefined && result.code < 0)
                throw new Error(result.msg);
        }
        catch (err) {
            logger('A:' + automation.id, err.body ? err.body : err);
            logger('A:' + automation.id, order);
            return { type: 'error', text: `Order failed! ` + err.body ? err.body : err.message };
        }

        let stopPrice;
        if (action.orderTemplate && action.orderTemplate.type === 'TRAILING_STOP')
            stopPrice = action.orderTemplate.stopPrice;
        else if (STOP_TYPES.includes(order.options.type))
            stopPrice = order.options.stopPrice;

        const savedOrder = await insertOrder({
            automationId: automation.id,
            symbol: order.symbol,
            userId: user.id,
            quantity: order.quantity || result.executedQty,
            type: order.options.type,
            side: order.side,
            limitPrice: LIMIT_TYPES.includes(order.options.type) ? order.limitPrice : null,
            stopPrice,
            orderId: result.orderId,
            clientOrderId: result.clientOrderId,
            transactTime: result.transactTime || result.updateTime,
            status: result.status || 'NEW',
            reduceOnly: isFuture ? order.options.reduceOnly : null,
            positionSide: isFuture ? result.positionSide || "BOTH" : null,
            closePosition: isFuture ? result.closePosition || false : null,
            priceRate: isFuture ? order.options.callbackRate : null,
            activatePrice: isFuture ? order.options.activationPrice : null
        })

        if (automation.logs) logger('A:' + automation.id, savedOrder.get({ plain: true }));

        return { type: 'success', text: `Order ${savedOrder.side} ${savedOrder.symbol} ${savedOrder.status}` };
    }

    async gridEval(settings, user, automation) {
        automation.grids = automation.grids.sort((a, b) => a.id - b.id);

        if (LOGS)
            logger('A:' + automation.id, `Auto Crypto Bot is in the GRID zone at ${automation.name}`);

        const indexes = automation.indexes.split(',');
        const MEMORY = await this.cache.getAll(...indexes);

        for (let i = 0; i < automation.grids.length; i++) {
            const grid = automation.grids[i];
            if (!Function("MEMORY", "return " + grid.conditions)(MEMORY)) continue;

            if (automation.logs)
                logger('A:' + automation.id, `Auto Crypto Bot evaluated a condition at ${automation.name} => ${grid.conditions}`);

            automation.actions[0].orderTemplateId = grid.orderTemplateId;

            const book = await this.cache.get(`${automation.symbol}:BOOK`);
            if (!book) return { type: 'error', text: `No book info for ${automation.symbol}` };

            const result = await this.placeOrder(user, automation, automation.actions[0]);
            if (automation.logs && user.telegramChat) await require('./utils/telegram')(settings, result.text, user.telegramChat);
            if (result.type === 'error') return result;

            const transaction = await db.transaction();
            try {
                const orderTemplate = await orderTemplatesRepository.getOrderTemplate(user.id, grid.orderTemplateId);
                await this.generateGrids(automation, automation.grids.length + 1, orderTemplate.quantity, transaction);
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                logger('A:' + automation.id, err);
                return { type: 'error', text: `Auto Crypto Bot can't generate grids for ${automation.name}. ERR: ${err.message}` };
            }

            automation = await automationsRepository.getAutomation(automation.id);//pega limpo
            this.updateBrain(automation.get({ plain: true }));
            return result;
        }
    }

    async generateGrids(automation, levels, quantity, transaction) {

        await gridsRepository.deleteGrids(automation.id, transaction);

        const symbol = await getSymbol(automation.symbol);
        const tickSize = parseFloat(symbol.tickSize);

        const conditionSplit = automation.conditions.split(' && ');
        const lowerLimit = parseFloat(conditionSplit[0].split('>')[1]);
        const upperLimit = parseFloat(conditionSplit[1].split('<')[1]);
        levels = parseInt(levels);

        const priceLevel = (upperLimit - lowerLimit) / levels;
        const grids = [];

        let buyOrderTemplate, sellOrderTemplate;
        const orderTemplates = await orderTemplatesRepository.getOrderTemplatesByGridName(automation.userId, automation.name);

        if (orderTemplates && orderTemplates.length) {
            buyOrderTemplate = orderTemplates.find(ot => ot.side === 'BUY');
            if (buyOrderTemplate && buyOrderTemplate.quantity !== quantity) {
                buyOrderTemplate.quantity = quantity;
                await orderTemplatesRepository.updateOrderTemplate(automation.userId, buyOrderTemplate.id, buyOrderTemplate);
            }

            sellOrderTemplate = orderTemplates.find(ot => ot.side === 'SELL');
            if (sellOrderTemplate && sellOrderTemplate.quantity !== quantity) {
                sellOrderTemplate.quantity = quantity;
                await orderTemplatesRepository.updateOrderTemplate(automation.userId, sellOrderTemplate.id, sellOrderTemplate);
            }
        }

        if (!buyOrderTemplate)
            buyOrderTemplate = await orderTemplatesRepository.insertOrderTemplate({
                name: automation.name + ' BUY',
                symbol: automation.symbol,
                type: 'MARKET',
                side: 'BUY',
                userId: automation.userId,
                limitPrice: null,
                limitPriceMultiplier: 1,
                stopPrice: null,
                stopPriceMultiplier: 1,
                quantity,
                quantityMultiplier: 1,
                icebergQty: null,
                icebergQtyMultiplier: 1
            }, transaction)

        if (!sellOrderTemplate)
            sellOrderTemplate = await orderTemplatesRepository.insertOrderTemplate({
                name: automation.name + ' SELL',
                symbol: automation.symbol,
                type: 'MARKET',
                side: 'SELL',
                userId: automation.userId,
                limitPrice: null,
                limitPriceMultiplier: 1,
                stopPrice: null,
                stopPriceMultiplier: 1,
                quantity,
                quantityMultiplier: 1,
                icebergQty: null,
                icebergQtyMultiplier: 1
            }, transaction)

        const book = await this.cache.get(`${automation.symbol}:BOOK`);
        if (!book) throw new Error(`There is no book info for ${automation.symbol}`);

        const currentPrice = parseFloat(book.current.bestAsk);
        const differences = [];

        for (let i = 1; i <= levels; i++) {
            const priceFactor = Math.floor((lowerLimit + (priceLevel * i)) / tickSize);
            const targetPrice = priceFactor * tickSize;
            const targetPriceStr = targetPrice.toFixed(symbol.quotePrecision);
            differences.push(Math.abs(currentPrice - targetPrice));

            if (targetPrice < currentPrice) { //se está abaixo da cotação, compra
                const previousLevel = targetPrice - priceLevel;
                const previousLevelStr = previousLevel.toFixed(symbol.quotePrecision);
                grids.push({
                    automationId: automation.id,
                    conditions: `MEMORY['${automation.symbol}:BOOK'].current.bestAsk<${targetPriceStr} && MEMORY['${automation.symbol}:BOOK'].previous.bestAsk>=${targetPriceStr} && MEMORY['${automation.symbol}:BOOK'].current.bestAsk>${previousLevelStr}`,
                    orderTemplateId: buyOrderTemplate.id
                })
            }
            else {//se está acima da cotação, vende
                const nextLevel = targetPrice + priceLevel;
                const nextLevelStr = nextLevel.toFixed(symbol.quotePrecision);
                grids.push({
                    automationId: automation.id,
                    conditions: `MEMORY['${automation.symbol}:BOOK'].current.bestBid>${targetPriceStr} && MEMORY['${automation.symbol}:BOOK'].previous.bestBid<=${targetPriceStr} && MEMORY['${automation.symbol}:BOOK'].current.bestBid<${nextLevelStr}`,
                    orderTemplateId: sellOrderTemplate.id
                })
            }
        }

        const nearestGrid = differences.findIndex(d => d === Math.min(...differences));
        grids.splice(nearestGrid, 1);

        return gridsRepository.insertGrids(grids, transaction);
    }

    async withdrawCrypto(user, automation, action) {
        if (!automation || !user || !action)
            throw new Error(`All parameters are required to place an order.`);

        if (!action.withdrawTemplateId)
            throw new Error(`There is no withdraw template for '${automation.name}', action #${action.id}`);

        const withdrawTemplate = await withdrawTemplatesRepository.getWithdrawTemplate(action.withdrawTemplateId);

        let amount = parseFloat(withdrawTemplate.amount);
        if (!amount) {
            if (withdrawTemplate.amount === 'MAX_WALLET') {
                const available = await this.cache.get(`${withdrawTemplate.coin}:WALLET_${user.id}`);
                if (!available) throw new Error(`No available funds for this coin.`);

                amount = available * (withdrawTemplate.amountMultiplier > 1 ? 1 : withdrawTemplate.amountMultiplier);
            }
            else if (withdrawTemplate.amount === 'LAST_ORDER_QTY') {
                const keys = this.searchMemory(new RegExp(`^((${withdrawTemplate.coin}.+|.+${withdrawTemplate.coin}):LAST_ORDER_${user.id})$`));
                if (!keys || !keys.length) throw new Error(`No last order for this coin.`);

                amount = keys[keys.length - 1].value.quantity * withdrawTemplate.amountMultiplier;
            }
        }

        const exchange = new Exchange(user, false);

        try {
            const result = await exchange.withdraw(withdrawTemplate.coin, amount, withdrawTemplate.address, withdrawTemplate.network, withdrawTemplate.addressTag);

            if (automation.logs) logger('A:' + automation.id, `WITHDRAW`, withdrawTemplate);

            return { type: 'success', text: `Withdraw #${result.id} realized successfully for ${withdrawTemplate.coin}` };
        } catch (err) {
            throw new Error(err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }

    async sendTelegram(settings, user, automation) {
        if (!user.telegramChat) throw new Error(`This user doesn't have Telegram Chat ID.`);

        await require('./utils/telegram')(settings, automation.name + ' has fired!', user.telegramChat);
        if (automation.logs) logger('A:' + automation.id, `Telegram sent!`);
        return { text: `Telegram sent from automation '${automation.name}'`, type: 'success' };
    }

    async trailingEval(user, automation, action) {

        const isBuy = action.orderTemplate.side === 'BUY';

        const book = await this.cache.get(`${automation.symbol}:BOOK`);
        if (!book) return { type: 'error', text: `No book info for ${automation.symbol}` };

        let activactionPrice = parseFloat(action.orderTemplate.limitPrice);
        if (!activactionPrice) {
            activactionPrice = await this.parsePrice(automation.symbol, action.orderTemplate.limitPrice, automation.userId);
            activactionPrice *= action.orderTemplate.limitPriceMultiplier;

            const ordersController = require('./controllers/ordersController');
            await ordersController.placeTrailingStop(user.id, {
                symbol: automation.symbol,
                side: action.orderTemplate.side,
                quantity: action.orderTemplate.quantity,
                limitPrice: activactionPrice,
                options: {
                    type: 'TRAILING_STOP',
                    stopPriceMultiplier: action.orderTemplate.stopPriceMultiplier,
                    quantityMultiplier: action.orderTemplate.quantityMultiplier,
                    limitPriceMultiplier: action.orderTemplate.limitPriceMultiplier
                }
            })

            return { type: 'success', text: 'Trailing Stop placed successfully!' };
        }

        const stopPrice = parseFloat(action.orderTemplate.stopPrice);

        const currentPrice = isBuy ? book.current.bestAsk : book.current.bestBid;
        const previousPrice = isBuy ? book.previous.bestAsk : book.previous.bestBid;

        const isPriceActivated = isBuy ? currentPrice <= activactionPrice : currentPrice >= activactionPrice;

        if (!isPriceActivated) return false;

        if (LOGS)
            logger('A:' + automation.id, `Auto Crypto Bot is in the Trailing zone at ${automation.name}`);

        const isStopActivated = isBuy ? currentPrice >= stopPrice && previousPrice < stopPrice
            : currentPrice <= stopPrice && previousPrice > stopPrice;

        if (isStopActivated) {
            if (automation.logs || LOGS)
                logger('A:' + automation.id, `Stop price activated at ${automation.name}`);

            const result = await this.placeOrder(user, automation, action);

            //para executar apenas uma vez
            this.deleteBrain(automation);

            automation.isActive = false;
            await automationsRepository.updateAutomation(automation.id, automation);
            //para executar apenas uma vez - termina aqui

            return result;
        }

        const newStopPrice = isBuy ? currentPrice * (1 + parseFloat(action.orderTemplate.stopPriceMultiplier) / 100)
            : currentPrice * (1 - parseFloat(action.orderTemplate.stopPriceMultiplier) / 100);

        if (!stopPrice || (isBuy && newStopPrice < stopPrice) || (!isBuy && newStopPrice > stopPrice)) {
            if (LOGS)
                logger('A:' + automation.id, `Stop price changed to ${newStopPrice} at ${automation.name}`);

            action.orderTemplate.stopPrice = newStopPrice;
            await orderTemplatesRepository.updateOrderTemplate(user.id, action.orderTemplate.id, { stopPrice: newStopPrice });
        }
    }

    doAction(settings, user, action, automation) {
        try {
            switch (action.type) {
                case actionTypes.ALERT_EMAIL: return this.sendEmail(settings, user, automation);
                case actionTypes.ALERT_SMS: return this.sendSms(settings, user, automation);
                case actionTypes.ALERT_TELEGRAM: return this.sendTelegram(settings, user, automation);
                case actionTypes.ORDER: return this.placeOrder(user, automation, action);
                case actionTypes.WITHDRAW: return this.withdrawCrypto(user, automation, action);
                case actionTypes.GRID: return this.gridEval(settings, user, automation);
                case actionTypes.TRAILING: return this.trailingEval(user, automation, action);
            }
        } catch (err) {
            if (automation.logs) {
                logger('A:' + automation.id, `${automation.name}:${action.type}`);
                logger('A:' + automation.id, err);
            }
            return { text: `Error at ${automation.name}: ${err.message}`, type: 'error' };
        }
    }

    shouldntInvert(automation, memoryKey) {
        return ['GRID', 'TRAILING'].includes(automation.actions[0].type)
            || automation.schedule
            || memoryKey.indexOf(':LAST_ORDER') !== -1
            || memoryKey.indexOf(':LAST_CANDLE') !== -1
            || memoryKey.indexOf(':PREVIOUS_CANDLE') !== -1;
    }

    async evalDecision(memoryKey, automation) {
        if (!automation) return false;

        try {
            const indexes = automation.indexes ? automation.indexes.split(',') : [];

            if (indexes.length) {
                const MEMORY = await this.cache.getAll(...indexes);

                const isChecked = indexes.every(ix => MEMORY[ix] !== null && MEMORY[ix] !== undefined);
                if (!isChecked) return false;

                const invertedCondition = this.shouldntInvert(automation, memoryKey) ? '' : this.invertCondition(memoryKey, automation.conditions);
                const evalCondition = automation.conditions + (invertedCondition ? ' && ' + invertedCondition : '');

                if (LOGS || automation.logs) {
                    logger('A:' + automation.id, `Auto Crypto Bot trying to evaluate:\n${evalCondition}\n at ${automation.name}`);
                    logger('A:' + automation.id, JSON.stringify(MEMORY));
                }

                const isValid = evalCondition ? Function("MEMORY", "return " + evalCondition)(MEMORY) : true;
                if (!isValid) return false;
            }

            if (!automation.actions || !automation.actions.length) {
                if (LOGS || automation.logs) logger('A:' + automation.id, `No actions defined for automation ${automation.name}`);
                return false;
            }

            if ((LOGS || automation.logs) && !['GRID', 'TRAILING'].includes(automation.actions[0].type))
                logger('A:' + automation.id, `Auto Crypto Bot evaluated a condition at automation: ${automation.name} => ${automation.conditions}`);

            const settings = await getDefaultSettings();
            const user = await getUserDecrypted(automation.userId);

            const results = [];
            for (let i = 0; i < automation.actions.length; i++) {
                const result = await this.doAction(settings, user, automation.actions[i], automation);
                if (!result || result.type === 'error') break;

                results.push(result);
            }
            if (automation.logs && results.length) logger('A:' + automation.id, `Results for automation ${automation.name} was ${JSON.stringify(results)} at ${new Date()}`);

            return results.flat();
        } catch (err) {
            if (automation.logs) logger('A:' + automation.id, err);
            return { type: 'error', text: `Error at evalDecision for '${automation.name}': ${err}` };
        }
    }

    async updatedMemory(memoryKey, realMemoryKey = false) {

        const automations = this.findAutomations(memoryKey);

        if (!automations || !automations.length || this.isLocked(automations.filter(a => a).map(a => a.id))) {
            if (LOGS) console.log(`Auto Crypto Bot has no automations for memoryKey: ${memoryKey} or the brain is locked`);
            return false;
        }

        this.setLocked(automations.map(a => a.id), true);
        let results;

        try {
            const promises = automations.map(async (automation) => {
                let auto = { ...automation };
                if (realMemoryKey) {
                    const realSymbol = realMemoryKey.split(':')[0];
                    auto.indexes = auto.indexes.replaceAll(auto.symbol, realSymbol);
                    auto.conditions = auto.conditions.replaceAll(auto.symbol, realSymbol);
                    auto.symbol = realSymbol;

                    if (auto.actions) {
                        auto.actions.forEach(action => {
                            if (action.orderTemplate)
                                action.orderTemplate.symbol = auto.symbol;
                        })
                    }
                }

                return this.evalDecision(realMemoryKey ? realMemoryKey : memoryKey, auto);
            });

            results = await Promise.all(promises);
            results = results.flat().filter(r => r);

            if (!results || !results.length)
                return false;
            else
                return results.flat();
        }
        finally {
            setTimeout(() => {
                this.setLocked(automations.map(a => a.id), false);
            }, results && results.length ? INTERVAL : 0)
        }
    }

    getBrain() {
        return { ...this.BRAIN };
    }

    getBrainIndexes() {
        return { ...this.BRAIN_INDEX };
    }

    getEval(prop) {
        if (prop.indexOf('MEMORY') !== -1) return prop;
        if (prop.indexOf('.') === -1) return `MEMORY['${prop}']`;

        const propSplit = prop.split('.');
        const memKey = propSplit[0];
        const memProp = prop.replace(memKey, '');
        return `MEMORY['${memKey}']${memProp}`;
    }

    async searchMemory(regex) {
        const memory = await this.cache.search();
        return Object.entries(memory).filter(prop => regex.test(prop[0])).map(prop => {
            return {
                key: prop[0], value: prop[1]
            }
        });
    }
}