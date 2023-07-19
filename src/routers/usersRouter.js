const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const profileMiddleware = require('../middlewares/profileMiddleware');

router.delete('/:id', profileMiddleware, usersController.deleteUser);

router.get('/active', profileMiddleware, usersController.getActiveUsers);

router.get('/:search?', profileMiddleware, usersController.getUsers);

router.patch('/:id', usersController.updateUser);

router.post('/', profileMiddleware, usersController.insertUser);

router.post('/:id/start', profileMiddleware, usersController.startUser);

router.post('/:id/stop', profileMiddleware, usersController.stopUser);

router.post('/:id/reset', profileMiddleware, usersController.resetUserPassword);

module.exports = router;