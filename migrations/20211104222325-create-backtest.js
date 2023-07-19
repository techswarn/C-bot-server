'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('backtests', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false
      },
      startDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      endDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      startBase: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: false
      },
      startQuote: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: false
      },
      endBase: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: false
      },
      endQuote: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: false
      },
      basePerc: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      quotePerc: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('backtests');
  }
};
