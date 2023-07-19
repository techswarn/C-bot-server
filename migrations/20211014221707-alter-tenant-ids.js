'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    //tenant id nas automations
    await queryInterface.addColumn('automations', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    })

    await queryInterface.removeIndex('automations', 'automations_symbol_name_index');

    await queryInterface.addIndex('automations', ['name', 'symbol', 'userId'], {
      name: 'automations_symbol_name_userId_index',
      unique: true
    })

    //tenant id nos monitors
    await queryInterface.addColumn('monitors', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    })

    await queryInterface.removeIndex('monitors', 'monitors_symbol_index');
    await queryInterface.removeIndex('monitors', 'monitors_type_symbol_interval_index');

    await queryInterface.addIndex('monitors', ['type', 'symbol', 'interval', 'userId'], {
      name: 'monitors_type_symbol_interval_userId_index',
      unique: true
    })

    await queryInterface.addIndex('monitors', ['symbol', 'userId'], {
      name: 'monitors_symbol_userId_index'
    });

    //tenant ids em order templates
    await queryInterface.addColumn('orderTemplates', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    })

    await queryInterface.removeIndex('orderTemplates', 'orderTemplates_symbol_name_index');

    await queryInterface.addIndex('orderTemplates', ['name', 'symbol', 'userId'], {
      name: 'orderTemplates_symbol_name_userId_index',
      unique: true
    })

    //tenant ids em withdraw templates
    await queryInterface.addColumn('withdrawTemplates', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    })

    await queryInterface.removeIndex('withdrawTemplates', 'withdrawTemplates_coin_name_index');

    await queryInterface.addIndex('withdrawTemplates', ['name', 'coin', 'userId'], {
      name: 'withdrawTemplates_coin_name_userId_index',
      unique: true
    })

    //tenant id em orders
    await queryInterface.addColumn('orders', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    })

    await queryInterface.removeIndex('orders', 'orders_symbol_index');

    await queryInterface.addIndex('orders', ['symbol', 'userId'], {
      name: 'orders_symbol_userId_index'
    })
  },

  down: async (queryInterface, Sequelize) => {
    //desfazendo automations
    await queryInterface.removeIndex('automations', 'automations_symbol_name_userId_index');

    await queryInterface.addIndex('automations', ['name', 'symbol'], {
      name: 'automations_symbol_name_index',
      unique: true
    })

    await queryInterface.removeColumn('automations', 'userId');

    //desfazendo monitors
    await queryInterface.removeIndex('monitors', 'monitors_type_symbol_interval_userId_index');

    await queryInterface.addIndex('monitors', ['type', 'symbol', 'interval'], {
      name: 'monitors_type_symbol_interval_index',
      unique: true
    })

    await queryInterface.removeIndex('monitors', 'monitors_symbol_userId_index');

    await queryInterface.addIndex('monitors', ['symbol'], {
      name: 'monitors_symbol_index',
      unique: true
    })

    await queryInterface.removeColumn('monitors', 'userId'); 
    
    //desfazendo order templates
    await queryInterface.removeIndex('orderTemplates', 'orderTemplates_symbol_name_userId_index');

    await queryInterface.addIndex('orderTemplates', ['name', 'symbol'], {
      name: 'orderTemplates_symbol_name_index',
      unique: true
    })

    await queryInterface.removeColumn('orderTemplates', 'userId');

    //desfazendo withdraw templates
    await queryInterface.removeIndex('withdrawTemplates', 'withdrawTemplates_coin_name_userId_index');

    await queryInterface.addIndex('withdrawTemplates', ['name', 'coin'], {
      name: 'withdrawTemplates_coin_name_index',
      unique: true
    })

    await queryInterface.removeColumn('withdrawTemplates', 'userId');

    //desfazendo orders
    await queryInterface.removeIndex('orders', 'orders_symbol_userId_index');

    await queryInterface.addIndex('orders', ['symbol'], {
      name: 'orders_symbol_index',
      unique: true
    })

    await queryInterface.removeColumn('orders', 'userId');
  }
};
