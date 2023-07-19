module.exports = (settings, message, to) => {

    if (!settings) throw new Error(`The settings object is required to send SMS!`);
    if (!settings.twilioSid ||
        !settings.twilioToken ||
        (!settings.phone && !to) ||
        !settings.twilioPhone)
        throw new Error(`The Twilio settings are not defined!`);

    const client = require('twilio')(settings.twilioSid, settings.twilioToken);

    return client.messages
        .create({
            to: to || settings.phone,
            from: settings.twilioPhone,
            body: message,
        });
}