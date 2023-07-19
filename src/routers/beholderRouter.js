const express = require('express');
const router = express.Router();
const beholderController = require('../controllers/beholderController');
const profileMiddleware = require('../middlewares/profileMiddleware');

router.get('/memory/indexes', beholderController.getMemoryIndexes);

router.get('/memory/:symbol?/:index?/:interval?', beholderController.getMemory);

router.get('/analysis', beholderController.getAnalysisIndexes);

router.get('/brain/indexes/:userId', profileMiddleware, beholderController.getBrainIndexes);

router.get('/brain/:userId?', profileMiddleware, beholderController.getBrain);

router.get('/streams', profileMiddleware, beholderController.getStreams);

router.get('/agenda', profileMiddleware, beholderController.getAgenda);

router.post('/init', profileMiddleware, beholderController.init);

module.exports = router;