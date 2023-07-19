const userModel = require('../models/userModel');
const AutomationModel = require('../models/automationModel');
const MonitorModel = require('../models/monitorModel');
const bcrypt = require('bcryptjs');
const crypto = require('../utils/crypto');
const Sequelize = require('sequelize');
const LimitModel = require('../models/limitModel');
const ActionModel = require('../models/actionModel');
const OrderTemplateModel = require('../models/orderTemplateModel');
const GridModel = require('../models/gridModel');

async function getUserDecrypted(id, eagerLoading = false) {
    const user = await getUser(id, eagerLoading);
    if (!user) return user;

    if (user.secretKey)
        user.secretKey = crypto.decrypt(user.secretKey);

    if (user.futuresSecret)
        user.futuresSecret = crypto.decrypt(user.futuresSecret);

    return user;
}

function getUserByEmail(email) {
    return userModel.findOne({ where: { email }, include: [LimitModel] });
}

async function userExists(email) {
    const count = await userModel.count({ where: { email } });
    return count > 0;
}

async function insertUser(newUser) {
    const alreadyExists = await userExists(newUser.email);
    if (alreadyExists) throw new Error(`Already exists an user with this email.`);

    newUser.password = bcrypt.hashSync(newUser.password);
    return userModel.create(newUser);
}

function deleteUser(id, transaction) {
    return userModel.destroy({
        where: { id },
        transaction
    })
}

async function updateUser(id, newUser) {
    const currentUser = await getUser(id);

    if (newUser.name && newUser.name !== currentUser.name)
        currentUser.name = newUser.name;

    if (newUser.password)
        currentUser.password = bcrypt.hashSync(newUser.password);

    if (newUser.email && newUser.email !== currentUser.email)
        currentUser.email = newUser.email;

    if (newUser.phone !== null && newUser.phone !== undefined
        && newUser.phone !== currentUser.phone)
        currentUser.phone = newUser.phone;

    if (newUser.telegramChat !== null && newUser.telegramChat !== undefined
        && newUser.telegramChat !== currentUser.telegramChat)
        currentUser.telegramChat = newUser.telegramChat;

    if (newUser.limitId && newUser.limitId !== currentUser.limitId)
        currentUser.limitId = newUser.limitId;

    if (newUser.accessKey !== null && newUser.accessKey !== undefined
        && newUser.accessKey !== currentUser.accessKey)
        currentUser.accessKey = newUser.accessKey;

    if (newUser.futuresKey !== null && newUser.futuresKey !== undefined
        && newUser.futuresKey !== currentUser.futuresKey)
        currentUser.futuresKey = newUser.futuresKey;

    if (newUser.pushToken !== null && newUser.pushToken !== undefined
        && newUser.pushToken !== currentUser.pushToken)
        currentUser.pushToken = newUser.pushToken;

    if (newUser.secretKey)
        currentUser.secretKey = crypto.encrypt(newUser.secretKey);

    if (newUser.futuresSecret)
        currentUser.futuresSecret = crypto.encrypt(newUser.futuresSecret);

    if (newUser.isActive !== null && newUser.isActive !== undefined
        && newUser.isActive !== currentUser.isActive)
        currentUser.isActive = newUser.isActive;

    await currentUser.save();
    return currentUser;
}

function getUser(id, eagerLoading = false) {
    if (eagerLoading)
        return userModel.findByPk(id, {
            include: [AutomationModel, MonitorModel, LimitModel]
        })

    return userModel.findByPk(id);
}

function getUsers(search, page = 1, pageSize = 10) {
    const options = {
        where: {},
        order: [['isActive', 'DESC'], ['name', 'ASC'], ['email', 'ASC']],
        limit: pageSize,
        offset: pageSize * (page - 1),
        include: LimitModel
    }

    if (search) {
        if (search.indexOf('@') !== -1)
            options.where = { email: { [Sequelize.Op.like]: `%${search}%` } };
        else
            options.where = { name: { [Sequelize.Op.like]: `%${search}%` } };
    }

    return userModel.findAndCountAll(options);
}

async function getActiveUsers() {
    const users = await userModel.findAll({
        where: { isActive: true },
        include: [
            LimitModel,
            MonitorModel, {
                model: AutomationModel,
                include: [{
                    model: ActionModel,
                    include: OrderTemplateModel
                }, GridModel]
            }]
    });

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (user.secretKey)
            user.secretKey = crypto.decrypt(user.secretKey);

        if (user.futuresSecret)
            user.futuresSecret = crypto.decrypt(user.futuresSecret);
    }

    return users;
}

function getActiveUsersQty() {
    return userModel.count({
        where: { isActive: true }
    })
}

module.exports = {
    getActiveUsers,
    insertUser,
    deleteUser,
    getUsers,
    getUser,
    updateUser,
    getUserDecrypted,
    getUserByEmail,
    getActiveUsersQty
}