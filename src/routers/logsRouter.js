const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logsController');
const profileMiddleware = require('../middlewares/profileMiddleware');

router.get('/:file', logsController.getLogs);

router.get('/', profileMiddleware, logsController.getLogList);

module.exports = router;