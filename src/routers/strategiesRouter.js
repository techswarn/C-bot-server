const express = require('express');
const router = express.Router();
const strategiesController = require('../controllers/strategiesController');

router.get('/shared', strategiesController.getSharedStrategies);

router.get('/', strategiesController.getStrategies);

router.delete('/:id', strategiesController.deleteStrategy);

router.patch('/:id', strategiesController.updateStrategy);

router.post('/', strategiesController.insertStrategy);

router.post('/:id/start', strategiesController.startStrategy);

router.post('/:id/stop', strategiesController.stopStrategy);

router.post('/:id/copy', strategiesController.copyStrategy);

module.exports = router;