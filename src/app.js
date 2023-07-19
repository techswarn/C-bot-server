const express = require('express');
require('express-async-errors');

const cors = require('cors');
const helmet = require('helmet');
const authMiddleware = require('./middlewares/authMiddleware');
const errorMiddleware = require('./middlewares/errorMiddleware');
const profileMiddleware = require('./middlewares/profileMiddleware');

const hydraRouter = require('./routers/hydraRouter');
const settingsRouter = require('./routers/settingsRouter');
const symbolsRouter = require('./routers/symbolsRouter');
const exchangeRouter = require('./routers/exchangeRouter');
const ordersRouter = require('./routers/ordersRouter');
const monitorsRouter = require('./routers/monitorsRouter');
const automationsRouter = require('./routers/automationsRouter');
const orderTemplatesRouter = require('./routers/orderTemplatesRouter');
const withdrawTemplatesRouter = require('./routers/withdrawTemplatesRouter');
const beholderRouter = require('./routers/beholderRouter');
const logsRouter = require('./routers/logsRouter');
const usersRouter = require('./routers/usersRouter');
const limitsRouter = require('./routers/limitsRouter');
const webHooksRouter = require('./routers/webHooksRouter');
const strategiesRouter = require('./routers/strategiesRouter');

const authController = require('./controllers/authController');
const { doWebHook } = require('./controllers/webHooksController');

const app = express();

app.use(helmet());

app.use(express.json());

if (process.env.NODE_ENV !== 'production') {
    const morgan = require('morgan');
    app.use(morgan('dev'));
}

app.use('/wh/:userId/:key', doWebHook);

const whitelist = (process.env.CORS_ORIGIN || '*').split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (whitelist[0] === '*' || whitelist.includes(origin))
            callback(null, true);
        else {
            console.error(origin + ' not allowed by CORS');
            callback(new Error(origin + ` not allowed by CORS.`));
        }
    }
}));

app.post('/login', authController.doLogin);

app.use('/settings', authMiddleware, settingsRouter);

app.use('/symbols', authMiddleware, symbolsRouter);

app.use('/exchange', authMiddleware, exchangeRouter);

app.use('/orders', authMiddleware, ordersRouter);

app.use('/monitors', authMiddleware, monitorsRouter);

app.use('/automations', authMiddleware, automationsRouter);

app.use('/ordertemplates', authMiddleware, orderTemplatesRouter);

app.use('/withdrawtemplates', authMiddleware, withdrawTemplatesRouter);

app.use('/users', authMiddleware, usersRouter);

app.use('/beholder', authMiddleware, beholderRouter);

app.use('/limits', authMiddleware, profileMiddleware, limitsRouter);

app.use('/logs', authMiddleware, logsRouter);

app.use('/hydra', authMiddleware, profileMiddleware, hydraRouter);

app.use('/webhooks', authMiddleware, webHooksRouter);

app.use('/strategies', authMiddleware, strategiesRouter);

app.post('/logout', authController.doLogout);

app.use(errorMiddleware);

module.exports = app;