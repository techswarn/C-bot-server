'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('webHooks', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '*'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false
      },
      host: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '*'
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.addIndex('webHooks', ['name', 'symbol'], {
      name: 'webHooks_name_symbol_index',
      unique: true
    })

    await queryInterface.addIndex('webHooks', ['key', 'userId'], {
      name: 'webHooks_key_userId_index',
      unique: true
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('webHooks', 'webHooks_name_symbol_index');
    await queryInterface.removeIndex('webHooks', 'webHooks_key_userId_index');
    await queryInterface.dropTable('webHooks');
  }
};
