const express = require('express');
const router = express.Router();
const webHooksController = require('../controllers/webHooksController');

router.delete('/:id', webHooksController.deleteWebHook);

router.get('/', webHooksController.getWebHooks);

router.patch('/:id', webHooksController.updateWebHook);

router.post('/', webHooksController.insertWebHook);

module.exports = router;