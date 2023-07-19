const winston = require('winston');
const path = require('path');
const Socket = require('ws');

const LOGGERS = {};

function createLogger(loggerKey) {
    loggerKey = loggerKey.replace(':', '');//fix para windows

    const logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.errors({ stack: true }),
            winston.format.simple()
        ),
        transports: [
            new winston.transports.File({
                filename: path.resolve(__dirname, "..", "..", "logs", loggerKey + ".log"),
                maxsize: 1024 * 1024,
                maxFiles: 1,
                tailable: true
            })
        ]
    })

    if (process.env.NODE_ENV !== 'production') {
        logger.add(new winston.transports.Console({
            format: winston.format.simple()
        }))
    }

    return logger;
}

module.exports = (loggerKey, data) => {
    try {
        let logger = LOGGERS[loggerKey.replace(':', '')];//fix para windows
        if (!logger) {
            logger = createLogger(loggerKey);
            LOGGERS[loggerKey] = logger;
        }

        if (data instanceof Error || data instanceof Socket) {
            logger.info(new Date().toISOString());
            return logger.error(data);
        }
        else if (typeof data === 'object') {
            return logger.info(new Date().toISOString() + " - " + JSON.stringify(data));
        }
        else
            return logger.info(new Date().toISOString() + " - " + data);
    } catch (err) {
        console.error(err, loggerKey, data);
    }
}