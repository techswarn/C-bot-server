'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const settingsId = await queryInterface.rawSelect('settings', { where: {}, limit: 1 }, ['id']);
    if (!settingsId) {
      return queryInterface.bulkInsert('settings', [{
        email: 'admin@admin.com',
        password: bcrypt.hashSync('123456'),
        phone: null,
        sendGridKey: null,
        twilioSid: null,
        twilioToken: null,
        twilioPhone: null,
        telegramBot: null,
        telegramToken: null,
        telegramChat: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
    }
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('settings', null, {});
  }
};
