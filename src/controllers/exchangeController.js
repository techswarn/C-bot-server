const usersRepository = require('../repositories/usersRepository');
const withdrawTemplatesRepository = require('../repositories/withdrawTemplatesRepository');
const ordersRepository = require('../repositories/ordersRepository');
const symbolsRepository = require('../repositories/symbolsRepository');
const hydra = require('../hydra');
const Exchange = require('../utils/exchange');
const { indexKeys } = require('../utils/indexes');
const { sendAndSaveOrder } = require('./ordersController');

async function loadBalance(userId, fiat, isFuture = false) {
    const user = await usersRepository.getUserDecrypted(userId);
    if (!user) return null;

    if (!isFuture && (!user.accessKey || !user.secretKey)) throw new Error(`Go to settings and fill your data.`);
    if (isFuture && (!user.futuresKey || !user.futuresSecret)) throw new Error(`Go to settings and fill your data.`);

    const exchange = new Exchange(user, isFuture);
    let info;

    try {
        info = isFuture ? await exchange.futuresBalance() : await exchange.balance();
    } catch (err) {
        throw new Error(err.response ? err.response.data : err.message);
    }

    if (isFuture) {
        const newInfo = {};
        info.map(item => {
            newInfo[item.asset] = {
                available: item.availableBalance,
                onOrder: `${parseFloat(item.balance) - parseFloat(item.availableBalance)}`
            }
        })
        info = newInfo;
    }

    const coins = Object.entries(info).map(prop => prop[0]);

    let total = 0;
    await Promise.all(coins.map(async (coin) => {
        let available = parseFloat(info[coin].available);

        hydra.updateMemory(coin, `${isFuture ? "FWALLET" : "WALLET"}_${userId}`, null, available);

        if (available > 0) available = await hydra.tryFiatConversion(coin, available, fiat);

        let onOrder = parseFloat(info[coin].onOrder);
        if (onOrder > 0) onOrder = await hydra.tryFiatConversion(coin, onOrder, fiat);

        info[coin].fiatEstimate = available + onOrder;
        total += available + onOrder;
    }))

    info.fiatEstimate = "~" + fiat + " " + total.toFixed(2);

    return info;
}

async function getBalance(req, res, next) {
    const userId = res.locals.token.id;
    const fiat = req.params.fiat;
    const isFuture = req.query.isFuture === 'true';

    try {
        let info = await loadBalance(userId, fiat, isFuture);
        if (!info) return res.sendStatus(404);

        res.json(info);
    } catch (err) {
        console.log(err.response ? err.response.data : err.message);
        res.status(500).send(err.response ? err.response.data : err.message);
    }
}

async function getFullBalance(req, res, next) {
    const userId = res.locals.token.id;
    const fiat = req.params.fiat;
    const isFuture = req.query.isFuture === 'true';

    try {
        let info = await loadBalance(userId, fiat, isFuture);
        if (!info) return res.sendStatus(404);

        const averages = await ordersRepository.getAveragePrices(userId, isFuture);
        const symbols = await symbolsRepository.getManySymbols([...new Set(averages.map(a => a.symbol))]);

        let symbolsObj = {};
        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            symbolsObj[symbol.symbol] = { base: symbol.base, quote: symbol.quote }
        }

        const grouped = {};
        for (let i = 0; i < averages.length; i++) {
            const averageObj = averages[i];
            const symbol = symbolsObj[averageObj.symbol];
            if (symbol.quote !== fiat) {
                averageObj.avg = await hydra.tryFiatConversion(symbol.quote, parseFloat(averageObj.avg), fiat);;
                averageObj.net = await hydra.tryFiatConversion(symbol.quote, parseFloat(averageObj.net), fiat);;
            }
            averageObj.symbol = symbol.base;

            if (!grouped[symbol.base]) grouped[symbol.base] = { net: 0, qty: 0 };
            grouped[symbol.base].net += averageObj.net;
            grouped[symbol.base].qty += averageObj.qty;
        }

        const coins = [...new Set(averages.map(a => a.symbol))];
        coins.map(coin => {
            if (!info[coin]) return;
            info[coin].avg = grouped[coin].net / grouped[coin].qty
        });

        res.json(info);
    } catch (err) {
        console.log(err.response ? err.response.data : err);
        res.status(500).send(err.response ? err.response.data : err.message);
    }
}

async function getCoins(req, res, next) {
    const userId = res.locals.token.id;
    const user = await usersRepository.getUserDecrypted(userId);
    if (!user) return res.sendStatus(404);
    if (!user.accessKey || !user.secretKey) return res.status(400).send(`Go to Settings area and fill your data.`);

    const exchange = new Exchange(user, false);
    const coins = await exchange.getCoins();
    res.json(coins);
}

async function doWithdraw(req, res, next) {
    const userId = res.locals.token.id;
    const withdrawTemplateId = req.params.id;
    if (!withdrawTemplateId) return res.sendStatus(404);

    const withdrawTemplate = await withdrawTemplatesRepository.getWithdrawTemplate(userId, withdrawTemplateId);
    if (!withdrawTemplate) return res.sendStatus(404);
    if (withdrawTemplate.userId !== userId) return res.sendStatus(403);

    let amount = parseFloat(withdrawTemplate.amount);
    if (!amount) {
        if (withdrawTemplate.amount === 'MAX_WALLET') {
            const available = await hydra.getMemory(withdrawTemplate.coin, `WALLET_${userId}`, null);
            if (!available) return res.status(400).json(`No available funds for this coin.`);

            amount = available * (withdrawTemplate.amountMultiplier > 1 ? 1 : withdrawTemplate.amountMultiplier);
        }
        else if (withdrawTemplate.amount === 'LAST_ORDER_QTY') {
            const keys = await hydra.searchMemory(new RegExp(`^((${withdrawTemplate.coin}.+|.+${withdrawTemplate.coin}):LAST_ORDER_${userId})$`));
            if (!keys || !keys.length) return res.status(400).json(`No last order for this coin.`);

            amount = keys[keys.length - 1].value.quantity * withdrawTemplate.amountMultiplier;
        }
    }

    const user = await usersRepository.getUserDecrypted(userId);
    const exchange = new Exchange(user, false);

    try {
        const result = await exchange.withdraw(withdrawTemplate.coin, amount, withdrawTemplate.address, withdrawTemplate.network, withdrawTemplate.addressTag);
        res.json(result);
    } catch (err) {
        res.status(400).json(err.response ? JSON.stringify(err.response.data) : err.message);
    }
}

async function getFuturesPositions(req, res, next) {
    const userId = res.locals.token.id;
    const symbol = req.params.symbol;

    let user = await usersRepository.getUserDecrypted(userId);
    if (!user) return res.sendStatus(404);

    user = user.get({ plain: true });
    if (!user.futuresKey || !user.futuresSecret) return res.status(400).json(`Go to settings and fill your data.`);

    try {
        const exchange = new Exchange(user, true);
        const positions = await exchange.futuresPositions(symbol);
        if (positions.code !== undefined && positions.code < 0) throw new Error(positions.msg);

        positions.map(item => hydra.updateMemory(item.symbol, `${indexKeys.POSITION}_${userId}`, null, item, false));

        res.json(positions);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json(err.message);
    }
}

async function closeAllFuturesPositions(req, res, next) {
    const userId = res.locals.token.id;

    let user = await usersRepository.getUserDecrypted(userId);
    if (!user) return res.sendStatus(404);

    user = user.get({ plain: true });
    if (!user.futuresKey || !user.futuresSecret) return res.status(400).json(`Go to settings and fill your data.`);

    try {
        const exchange = new Exchange(user, true);
        const positions = await exchange.futuresPositions();

        if (positions.code !== undefined && positions.code < 0) throw new Error(positions.msg);
        if (!positions || !positions.length) return res.sendStatus(404);

        const promises = positions
            .filter(p => parseFloat(p.notional) !== 0)
            .map(p => closeOnePosition(userId, p, exchange));
        const results = await Promise.all(promises);

        res.json(results);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json(err.message);
    }
}

async function closeOnePosition(userId, position, exchange) {
    const notional = parseFloat(position.notional);
    if (notional === 0) return false;

    const isBuy = notional > 0;
    if (isBuy)
        return sendAndSaveOrder(userId, exchange, true, 'SELL', position.symbol, position.positionAmt);
    else
        return sendAndSaveOrder(userId, exchange, true, 'BUY', position.symbol, position.positionAmt.replace("-", ""));
}

async function closeFuturesPosition(req, res, next) {
    const userId = res.locals.token.id;
    const symbol = req.params.symbol;

    let user = await usersRepository.getUserDecrypted(userId);
    if (!user) return res.sendStatus(404);

    user = user.get({ plain: true });
    if (!user.futuresKey || !user.futuresSecret) return res.status(400).json(`Go to settings and fill your data.`);

    try {
        const exchange = new Exchange(user, true);
        const positions = await exchange.futuresPositions(symbol);
        if (positions.code !== undefined && positions.code < 0) throw new Error(positions.msg);
        if (!positions || !positions.length) return res.sendStatus(404);

        const position = positions[0];

        const result = await closeOnePosition(userId, position, exchange);

        res.json(result);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json(err.message);
    }
}

async function updateFuturesPosition(req, res, next) {
    const userId = res.locals.token.id;
    const symbol = req.params.symbol;
    const { marginType, leverage } = req.body;

    let user = await usersRepository.getUserDecrypted(userId);
    if (!user) return res.sendStatus(404);

    user = user.get({ plain: true });
    if (!user.futuresKey || !user.futuresSecret)
        return res.status(400).json(`Go to settings and fill your data.`);

    try {
        const exchange = new Exchange(user, true);

        const results = [];
        if (marginType)
            results.push(await exchange.futuresMargin(symbol, marginType));

        if (leverage)
            results.push(await exchange.futuresLeverage(symbol, leverage));

        const error = results.find(r => r.code !== undefined && r.code < 0);
        if (error)
            res.status(500).json(error.msg);
        else
            res.json(results);
    }
    catch (err) {
        console.error(err);
        res.status(400).json(err);
    }
}

module.exports = {
    getBalance,
    getCoins,
    doWithdraw,
    getFullBalance,
    getFuturesPositions,
    closeAllFuturesPositions,
    closeFuturesPosition,
    updateFuturesPosition
}