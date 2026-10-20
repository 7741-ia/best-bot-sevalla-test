const { buildMenuPayload } = require('../lib/menuData');

function extractMenuQuery(rawText = '') {
    const parts = String(rawText).trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
}

async function helpCommand(sock, chatId, message, rawText = '') {
    const query = extractMenuQuery(rawText);
    const payload = buildMenuPayload(query);
    try {
        await sock.sendMessage(chatId, payload, { quoted: message });
    } catch (error) {
        console.error('Erreur dans la commande menu:', error);
        await sock.sendMessage(chatId, { text: payload.text }, { quoted: message });
    }
}

module.exports = helpCommand;
