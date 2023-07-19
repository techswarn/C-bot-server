const express = require('express');
const router = express.Router();
const limitsController = require('../controllers/limitsController');

router.get('/active', limitsController.getActiveLimits);

router.get('/all', limitsController.getAllLimits);

router.get('/', limitsController.getLimits);

router.delete('/:id', limitsController.deleteLimit);

router.patch('/:id', limitsController.updateLimit);

router.post('/', limitsController.insertLimit);

module.exports = router;