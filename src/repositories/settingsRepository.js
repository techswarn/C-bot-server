const settingsModel = require('../models/settingsModel');
const bcrypt = require('bcryptjs');

function getSettingsByEmail(email) {
    return settingsModel.findOne({ where: { email } });
}

function getSettings(id) {
    return settingsModel.findOne({ where: { id } });
}

async function getDefaultSettings() {
    return settingsModel.findOne({ where: { id: process.env.DEFAULT_SETTINGS_ID || 1 } });
}

async function updateSettings(id, newSettings) {
    const currentSettings = await getSettings(id);

    if (newSettings.email && newSettings.email !== currentSettings.email)
        currentSettings.email = newSettings.email;

    if (newSettings.phone !== null && newSettings.phone !== undefined
        && newSettings.phone !== currentSettings.phone)
        currentSettings.phone = newSettings.phone;

    if (newSettings.password)
        currentSettings.password = bcrypt.hashSync(newSettings.password);

    if (newSettings.sendGridKey !== currentSettings.sendGridKey)
        currentSettings.sendGridKey = newSettings.sendGridKey;

    if (newSettings.twilioSid !== currentSettings.twilioSid)
        currentSettings.twilioSid = newSettings.twilioSid;

    if (newSettings.twilioToken !== currentSettings.twilioToken)
        currentSettings.twilioToken = newSettings.twilioToken;

    if (newSettings.twilioPhone !== currentSettings.twilioPhone)
        currentSettings.twilioPhone = newSettings.twilioPhone;

    if (newSettings.telegramBot !== currentSettings.telegramBot)
        currentSettings.telegramBot = newSettings.telegramBot;

    if (newSettings.telegramChat !== currentSettings.telegramChat)
        currentSettings.telegramChat = newSettings.telegramChat;

    if (newSettings.telegramToken !== currentSettings.telegramToken)
        currentSettings.telegramToken = newSettings.telegramToken;

    await currentSettings.save();
    return currentSettings;
}

module.exports = {
    getSettingsByEmail,
    getSettings,
    updateSettings,
    getDefaultSettings
}
