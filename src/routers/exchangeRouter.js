const express = require('express');
const router = express.Router();
const exchangeController = require('../controllers/exchangeController');

router.get('/balance/full/:fiat', exchangeController.getFullBalance);

router.get('/balance/:fiat', exchangeController.getBalance);

router.get('/coins', exchangeController.getCoins);

router.post('/withdraw/:id', exchangeController.doWithdraw);

router.get('/futures/:symbol?', exchangeController.getFuturesPositions);

router.delete('/futures/all', exchangeController.closeAllFuturesPositions);

router.delete('/futures/:symbol', exchangeController.closeFuturesPosition);

router.patch('/futures/:symbol', exchangeController.updateFuturesPosition)

module.exports = router;