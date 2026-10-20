const { resolveFacebookDownload } = require('../lib/downloadProviders');

async function facebookCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const url = text.split(' ').slice(1).join(' ').trim();

        if (!url) {
            return sock.sendMessage(chatId, {
                text: 'Envoie un lien video Facebook.\nExemple: .fb https://www.facebook.com/...'
            }, { quoted: message });
        }

        if (!/(facebook\.com|fb\.watch)/i.test(url)) {
            return sock.sendMessage(chatId, {
                text: "Ce lien n'est pas un lien Facebook valide."
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        const media = await resolveFacebookDownload(url);

        await sock.sendMessage(chatId, {
            video: { url: media.url },
            mimetype: 'video/mp4',
            caption: `Vidéo Facebook\n\nTitre : ${media.title || 'Vidéo'}`
        }, { quoted: message });
    } catch (error) {
        console.error('Error in Facebook command:', error);
        await sock.sendMessage(chatId, {
            text: 'Impossible de recuperer cette video Facebook. Elle peut etre privee, supprimee, ou le fournisseur API est indisponible.'
        }, { quoted: message });
    }
}

module.exports = facebookCommand;
