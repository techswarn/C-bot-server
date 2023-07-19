const withdrawTemplateModel = require('../models/withdrawTemplateModel');

function insertWithdrawTemplate(newWithdrawTemplate, transaction) {
    return withdrawTemplateModel.create(newWithdrawTemplate, { transaction });
}

function deleteWithdrawTemplate(userId, id, transaction) {
    return withdrawTemplateModel.destroy({ where: { userId, id }, transaction });
}

function deleteWithdrawTemplates(ids, transaction) {
    return withdrawTemplateModel.destroy({ where: { id: ids }, transaction });
}

function deleteAll(userId, transaction) {
    return withdrawTemplateModel.destroy({
        where: { userId },
        transaction
    })
}

function getWithdrawTemplate(userId, id) {
    return withdrawTemplateModel.findOne({ where: { userId, id } });
}

function getWithdrawTemplates(userId, coin = '', page = 1) {
    const options = {
        where: { userId },
        order: [['coin', 'ASC'], ['name', 'ASC']],
        limit: 10,
        offset: 10 * (page - 1),
        distinct: true
    }

    if (coin) options.where = { userId, coin };

    return withdrawTemplateModel.findAndCountAll(options);
}

async function updateWithdrawTemplate(userId, id, newWithdrawTemplate) {

    const currentWithdrawTemplate = await getWithdrawTemplate(userId, id);
    if (!currentWithdrawTemplate) throw new Error(`There is no withdraw template with these params.`);

    if (newWithdrawTemplate.name && newWithdrawTemplate.name !== currentWithdrawTemplate.name)
        currentWithdrawTemplate.name = newWithdrawTemplate.name;

    if (newWithdrawTemplate.amount && newWithdrawTemplate.amount !== currentWithdrawTemplate.amount)
        currentWithdrawTemplate.amount = newWithdrawTemplate.amount;

    if (newWithdrawTemplate.amountMultiplier && newWithdrawTemplate.amountMultiplier !== currentWithdrawTemplate.amountMultiplier)
        currentWithdrawTemplate.amountMultiplier = newWithdrawTemplate.amountMultiplier;

    if (newWithdrawTemplate.address && newWithdrawTemplate.address !== currentWithdrawTemplate.address)
        currentWithdrawTemplate.address = newWithdrawTemplate.address;

    if (newWithdrawTemplate.addressTag && newWithdrawTemplate.addressTag !== currentWithdrawTemplate.addressTag)
        currentWithdrawTemplate.addressTag = newWithdrawTemplate.addressTag;

    if (newWithdrawTemplate.network !== currentWithdrawTemplate.network)
        currentWithdrawTemplate.network = newWithdrawTemplate.network;

    await currentWithdrawTemplate.save();
    return currentWithdrawTemplate;
}

module.exports = {
    insertWithdrawTemplate,
    deleteWithdrawTemplate,
    deleteWithdrawTemplates,
    deleteAll,
    getWithdrawTemplate,
    getWithdrawTemplates,
    updateWithdrawTemplate
}