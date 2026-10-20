const settings = require('../settings');
const { getMenuStats } = require('../lib/menuData');

async function aliveCommand(sock, chatId, message) {
    try {
        const { totalCommands, totalSections } = getMenuStats();
        const messageText = [
            '╭────────────────────────────╮',
            '│ ✦ BOT STATUS ✦',
            '╰────────────────────────────╯',
            `Bot        : ${settings.botName || 'BestBot'}`,
            `Version    : ${settings.version || '3.1.0'}`,
            `Owner      : ${settings.botOwner || 'Best King King'}`,
            `Statut     : En ligne`,
            `Categories : ${totalSections}`,
            `Commandes  : ${totalCommands}+`,
            '',
            'Ouvre .menu pour afficher le panneau BestBot.'
        ].join('\n');

        await sock.sendMessage(chatId, {
            text: messageText,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {}
            }
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'Le bot est actif et fonctionne correctement.' }, { quoted: message });
    }
}

module.exports = aliveCommand;
