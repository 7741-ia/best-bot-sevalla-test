const settings = require('../settings');

async function ownerCommand(sock, chatId) {
    const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${settings.botOwner}
TEL;waid=${settings.ownerNumber}:${settings.ownerNumber}
END:VCARD
`;

    await sock.sendMessage(chatId, {
        contacts: { displayName: settings.botOwner, contacts: [{ vcard }] }
    });

    await sock.sendMessage(chatId, {
        text: `👤 Propriétaire du bot : ${settings.botOwner}\n📞 Numéro : ${settings.ownerNumber}`
    });
}

module.exports = ownerCommand;
