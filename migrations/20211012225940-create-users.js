'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      name: Sequelize.STRING,
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      limitId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      phone: Sequelize.STRING,
      accessKey: Sequelize.STRING,
      secretKey: Sequelize.STRING,
      telegramChat: Sequelize.STRING,
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.addIndex('users', ['email'], {
      name: 'users_email_index',
      unique: true
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('users', 'users_email_index');
    await queryInterface.dropTable('users');
  }
};
