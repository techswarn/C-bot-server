const express = require('express');
const router = express.Router();
const hydraController = require('../controllers/hydraController');

router.get('/dashboard', hydraController.getDashboard);

module.exports = router;