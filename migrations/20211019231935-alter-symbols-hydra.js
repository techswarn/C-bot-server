'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('favoriteSymbols', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.addIndex('favoriteSymbols', ['userId', 'symbol'], {
      name: 'favoriteSymbols_userId_symbol_index',
      unique: true
    })

    await queryInterface.removeColumn('symbols', 'isFavorite');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('symbols', 'isFavorite', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    })
    await queryInterface.removeIndex('favoriteSymbols', 'favoriteSymbols_userId_symbol_index');
    await queryInterface.dropTable('favoriteSymbols');
  }
};
