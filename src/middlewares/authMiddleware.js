const authController = require('../controllers/authController');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

module.exports = async (req, res, next) => {
    const token = req.headers['authorization'];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded) {
                const isBlacklisted = await authController.isBlacklisted(token);
                if (!isBlacklisted) {
                    res.locals.token = decoded;
                    return next();
                }
            }
        } catch (err) {
            console.log(err);
            if (err instanceof jwt.TokenExpiredError)
                logger('system', err.message);
            else
                logger('system', err);
        }
    }
    res.status(401).json('Unauthorized');
}