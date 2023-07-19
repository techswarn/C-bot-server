'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'reduceOnly', Sequelize.BOOLEAN);
    await queryInterface.addColumn('orders', 'positionSide', Sequelize.STRING);
    await queryInterface.addColumn('orders', 'activatePrice', Sequelize.STRING);
    await queryInterface.addColumn('orders', 'priceRate', Sequelize.STRING);
    await queryInterface.removeColumn('orders', 'icebergQty');

  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'reduceOnly');
    await queryInterface.removeColumn('orders', 'positionSide');
    await queryInterface.removeColumn('orders', 'activatePrice');
    await queryInterface.removeColumn('orders', 'priceRate');
  }
};
