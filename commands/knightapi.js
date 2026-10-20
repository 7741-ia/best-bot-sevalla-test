const { download, qr } = require('../lib/knightbotApi');

function textOf(message) {
    return message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';
}

async function sendMedia(sock, chatId, message, media, type = 'video') {
    const payload = type === 'image'
        ? { image: { url: media.url }, caption: media.title || 'KnightBot' }
        : { video: { url: media.url }, mimetype: 'video/mp4', fileName: `${media.title || 'download'}.mp4`, caption: media.title || 'KnightBot' };
    await sock.sendMessage(chatId, payload, { quoted: message });
}

async function socialCommand(sock, chatId, message, platform, type = 'video') {
    const raw = textOf(message).replace(/^\.[^\s]+\s*/i, '').trim();
    if (!raw) {
        await sock.sendMessage(chatId, { text: `Envoie un lien ${platform === 'twitter' ? 'X/Twitter' : 'Pinterest'}.` }, { quoted: message });
        return;
    }
    if (!/^https?:\/\//i.test(raw)) {
        await sock.sendMessage(chatId, { text: '❌ Le lien doit commencer par http:// ou https://.' }, { quoted: message });
        return;
    }
    try {
        const media = await download(platform, { url: raw }, { timeout: 90000 });
        await sendMedia(sock, chatId, message, media, type);
    } catch (error) {
        console.error(`[KNIGHTBOT/${platform}]`, error?.response?.data || error?.message || error);
        await sock.sendMessage(chatId, { text: `❌ Impossible de télécharger ce lien ${platform === 'twitter' ? 'X/Twitter' : 'Pinterest'}. Le post peut être privé ou l’API indisponible.` }, { quoted: message });
    }
}

async function qrCommand(sock, chatId, message) {
    const raw = textOf(message).replace(/^\.qr\s*/i, '').trim();
    if (!raw) {
        await sock.sendMessage(chatId, { text: 'Utilisation : .qr <texte ou lien>' }, { quoted: message });
        return;
    }
    try {
        const media = await qr(raw);
        await sock.sendMessage(chatId, { image: { url: media.url }, caption: `QR code : ${raw}` }, { quoted: message });
    } catch (error) {
        console.error('[KNIGHTBOT/qr]', error?.response?.data || error?.message || error);
        await sock.sendMessage(chatId, { text: '❌ Impossible de générer le QR code pour le moment.' }, { quoted: message });
    }
}

async function knightApiHelp(sock, chatId, message) {
    await sock.sendMessage(chatId, { text: [
        '⚔️ *KnightBot API intégrée*',
        '',
        '• `.play`, `.song`, `.ytmp3` — YouTube MP3',
        '• `.video`, `.ytmp4` — YouTube MP4',
        '• `.twitter` / `.x` — X/Twitter',
        '• `.facebook` / `.fb` — Facebook',
        '• `.tiktok` / `.tt` — TikTok',
        '• `.instagram` / `.insta` — Instagram',
        '• `.pinterest` / `.pin` — Pinterest',
        '• `.lyrics` — paroles',
        '• `.ss` / `.ssweb` — capture de site',
        '• `.tts` — texte en audio',
        '• `.qr` — générateur QR',
        '',
        'Les fournisseurs actuels restent disponibles en fallback si KnightBot est temporairement indisponible.'
    ].join('\n') }, { quoted: message });
}

module.exports = { socialCommand, qrCommand, knightApiHelp };
