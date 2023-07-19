'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('limits', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      maxAutomations: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      maxMonitors: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      maxBacktests: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.addIndex('limits', ['name'], {
      name: 'limits_name_index',
      unique: true
    })

    await queryInterface.changeColumn('users', 'limitId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'limits',
        key: 'id'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('users', 'limitId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    await queryInterface.removeIndex('limits', 'limits_name_index');

    await queryInterface.dropTable('limits');
  }
};
