'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const limitId = await queryInterface.rawSelect('limits', { where: {}, limit: 1 }, ['id']);
    if (!limitId) {
      return queryInterface.bulkInsert('limits', [{
        name: 'Gold',
        maxAutomations: 8,
        maxMonitors: 8,
        maxBacktests: 8,
        isActive: true,
        hasFutures: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
    }
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('limits', null, {});
  }
};
