'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orderTemplates', 'reduceOnly', Sequelize.BOOLEAN);
    await queryInterface.addColumn('orderTemplates', 'marginType', Sequelize.STRING);
    await queryInterface.addColumn('orderTemplates', 'leverage', Sequelize.INTEGER);

    await queryInterface.removeColumn('orderTemplates', 'icebergQty');
    await queryInterface.removeColumn('orderTemplates', 'icebergQtyMultiplier');

    await queryInterface.changeColumn('orderTemplates', 'quantityMultiplier', Sequelize.DECIMAL(6, 3));
    await queryInterface.changeColumn('orderTemplates', 'limitPriceMultiplier', Sequelize.DECIMAL(6, 3));
    await queryInterface.changeColumn('orderTemplates', 'stopPriceMultiplier', Sequelize.DECIMAL(6, 3));
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orderTemplates', 'reduceOnly');
    await queryInterface.removeColumn('orderTemplates', 'marginType');
    await queryInterface.removeColumn('orderTemplates', 'leverage');
  }
};
