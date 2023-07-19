const Sequelize = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME || 'cbot',
    process.env.DB_USER || 'doadmin',
    process.env.DB_PWD,
    {
        dialect: process.env.DB_DIALECT || 'mysql',
        host: process.env.DB_HOST || 'db-mysql-sgp1-75136-do-user-14264436-0.b.db.ondigitalocean.com',
        port: process.env.DB_PORT || 25060,
        logging: process.env.DB_LOGS === 'true',
        pool: {
            min: 5,
            max: 15,
            idle: 20000,
            evict: 15000,
            acquire: 30000
        }
    });

module.exports = sequelize;