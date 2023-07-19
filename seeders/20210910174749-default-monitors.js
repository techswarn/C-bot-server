'use strict';
const { monitorTypes } = require('../src/repositories/monitorsRepository');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const seedSymbol = '*';
    const monitor = await queryInterface.rawSelect('monitors', { where: { symbol: seedSymbol }, }, ['symbol']);
    if (!monitor) {
      await queryInterface.bulkInsert('monitors', [
        {
          type: monitorTypes.TICKER,
          broadcastLabel: 'ticker',
          symbol: '*',
          interval: null,
          userId: null,
          isActive: true,
          isSystemMon: true,
          indexes: null,
          logs: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          type: monitorTypes.BOOK,
          broadcastLabel: 'book',
          symbol: '*',
          interval: null,
          userId: null,
          isActive: false,
          isSystemMon: true,
          indexes: null,
          logs: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          type: monitorTypes.USER_DATA,
          broadcastLabel: 'balance,execution',
          symbol: '*',
          interval: null,
          userId: null,
          isActive: true,
          isSystemMon: true,
          indexes: null,
          logs: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          type: monitorTypes.FUTURES_DATA,
          broadcastLabel: 'margin,fBalance,fExecution',
          symbol: '*',
          interval: null,
          userId: null,
          isActive: true,
          isSystemMon: true,
          indexes: null,
          logs: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          type: monitorTypes.MARK_PRICE,
          broadcastLabel: 'markPrice',
          symbol: '*',
          interval: '',
          userId: null,
          isActive: true,
          isSystemMon: true,
          indexes: null,
          logs: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          type: monitorTypes.LIQUIDATION,
          broadcastLabel: 'liquidation',
          symbol: '*',
          interval: null,
          userId: null,
          isActive: true,
          isSystemMon: true,
          indexes: null,
          logs: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('monitors', null, {});
  }
};
