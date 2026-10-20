const { resolveTikTokDownload } = require('../lib/downloadProviders');

const processedMessages = new Set();

async function tiktokCommand(sock, chatId, message) {
    try {
        if (processedMessages.has(message.key.id)) {
            return;
        }

        processedMessages.add(message.key.id);
        setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        // Accepte : ".tiktok URL", ".tt URL", ou juste une URL TikTok collée sans commande
        const tokens = text.trim().split(/\s+/);
        const first = (tokens[0] || '').toLowerCase();
        const hasCmd = first === '.tiktok' || first === '.tt';
        const rest = hasCmd ? tokens.slice(1).join(' ').trim() : text.trim();
        const urlMatch = rest.match(/https?:\/\/[^\s]+/i);
        const url = urlMatch ? urlMatch[0] : rest;

        if (!url) {
            return sock.sendMessage(chatId, {
                text: 'Envoie un lien TikTok a telecharger.'
            }, { quoted: message });
        }

        const isValidUrl = [
            /https?:\/\/(?:www\.)?tiktok\.com\//i,
            /https?:\/\/(?:vm|vt)\.tiktok\.com\//i
        ].some((pattern) => pattern.test(url));

        if (!isValidUrl) {
            return sock.sendMessage(chatId, {
                text: "Ce lien TikTok n'est pas valide."
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        const media = await resolveTikTokDownload(url);

        await sock.sendMessage(chatId, {
            video: { url: media.url },
            mimetype: 'video/mp4',
            caption: `Vidéo TikTok\n\nTitre : ${media.title || 'Vidéo'}`
        }, { quoted: message });
    } catch (error) {
        console.error('Error in TikTok command:', error);
        await sock.sendMessage(chatId, {
            text: 'Impossible de telecharger cette video TikTok. Le lien peut etre invalide, prive, ou le fournisseur API est indisponible.'
        }, { quoted: message });
    }
}

module.exports = tiktokCommand;
