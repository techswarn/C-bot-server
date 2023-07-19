'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    await queryInterface.addColumn('settings', 'telegramToken', {
      type: Sequelize.STRING,
    })

    await queryInterface.removeColumn('settings', 'accessKey');
    await queryInterface.removeColumn('settings', 'secretKey');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('settings', 'telegramToken');
    await queryInterface.addColumn('settings', 'accessKey', {
      type: Sequelize.STRING,
    })
    await queryInterface.addColumn('settings', 'secretKey', {
      type: Sequelize.STRING,
    })
  }
};
