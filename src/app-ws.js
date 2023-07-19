const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const authController = require('./controllers/authController');
const logger = require('./utils/logger');

function onError(err) {
    logger('system', `app-ws.onError: ${err.message}`);
}

function onMessage(data) {
    logger('system', `app-ws.onMessage: ${data}`);
}

const whitelist = (process.env.CORS_ORIGIN || '*').split(',');
function corsValidation(origin) {
    return whitelist[0] === '*' || whitelist.includes(origin);
}

async function verifyClient(info, callback) {
    if (!corsValidation(info.origin)) return callback(false, 401);

    const token = info.req.url.split('token=')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const isBlacklisted = await authController.isBlacklisted(token);
            if (decoded && !isBlacklisted && !isConnected(decoded.id)) {
                return callback(true);
            }
        } catch (err) {
            logger('system', err);
        }
    }
    return callback(false, 401);
}

function isConnected(userId) {
    if (!this.clients) return false;
    return [...this.clients].some(c => c.id == userId);
}

function getConnections() {
    if (!this.clients) return [];
    return [...this.clients].map(c => c.id);
}

function onConnection(ws, req) {
    const token = jwt.decode(req.url.split('token=')[1]);
    ws.id = token.profile === 'ADMIN' ? 'ADMIN' : token.id;
    ws.on('message', onMessage);
    ws.on('error', onError);
    logger('system', `app-ws.onConnection`);
}

function direct(userId, jsonObject) {
    if (!this.clients) return;
    this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.id == userId){
            client.send(JSON.stringify(jsonObject));
        }
    })
}

function broadcast(jsonObject) {
    if (!this.clients) return;
    this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(jsonObject));
        }
    });
}

module.exports = (server) => {
    const wss = new WebSocket.Server({
        server,
        verifyClient
    });
    wss.on('connection', onConnection);
    wss.broadcast = broadcast;
    wss.direct = direct;
    wss.getConnections = getConnections;
    logger('system', `App Web Socket Server is running!`);
    return wss;
}