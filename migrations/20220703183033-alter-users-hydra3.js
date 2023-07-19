'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'futuresKey', Sequelize.STRING);
    await queryInterface.addColumn('users', 'futuresSecret', Sequelize.STRING);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'futuresKey');
    await queryInterface.removeColumn('users', 'futuresSecret');
  }
};
