'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('strategies', {
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
      symbol: {
        type: Sequelize.STRING,
        allowNull: false
      },
      monitorId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "monitors",
          key: "id"
        }
      },
      buyAutomationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "automations",
          key: "id"
        }
      },
      sellAutomationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "automations",
          key: "id"
        }
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id"
        }
      },
      sharedWith: Sequelize.STRING,
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      startedAt: Sequelize.DATE,
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.addIndex('strategies', ['symbol', 'name', 'userId'], {
      name: 'strategies_symbol_name_userId_index',
      unique: true
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('strategies', 'strategies_symbol_name_userId_index');
    await queryInterface.dropTable('strategies');
  }
};
