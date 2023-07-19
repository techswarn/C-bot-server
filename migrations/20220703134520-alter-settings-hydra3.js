'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('settings', 'apiUrl');
    await queryInterface.removeColumn('settings', 'streamUrl');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('settings', 'apiUrl', Sequelize.STRING);
    await queryInterface.addColumn('settings', 'streamUrl', Sequelize.STRING);
  }
};
