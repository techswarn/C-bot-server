'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('symbols', 'fMinNotional', Sequelize.STRING);
    await queryInterface.addColumn('symbols', 'fMinLotSize', Sequelize.STRING);
    await queryInterface.addColumn('symbols', 'fStepSize', Sequelize.STRING);
    await queryInterface.addColumn('symbols', 'fTickSize', Sequelize.STRING);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('symbols', 'fMinNotional');
    await queryInterface.removeColumn('symbols', 'fMinLotSize');
    await queryInterface.removeColumn('symbols', 'fStepSize');
    await queryInterface.removeColumn('symbols', 'fTickSize');
  }
};
