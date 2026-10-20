const axios = require('axios');

/**
 * .pp [@mention | réponse à un message]
 * Télécharge la photo de profil (HD si dispo) de la personne ciblée.
 */
async function profilePicCommand(sock, chatId, message) {
    try {
        const ctx = message.message?.extendedTextMessage?.contextInfo || {};
        const mentioned = ctx.mentionedJid && ctx.mentionedJid[0];
        const quotedParticipant = ctx.participant;
        const senderId = require('../lib/jidUtils').getSender(message);

        const targetJid = mentioned || quotedParticipant || senderId;

        let url = null;
        try {
            url = await sock.profilePictureUrl(targetJid, 'image');
        } catch (e) {
            try {
                url = await sock.profilePictureUrl(targetJid, 'preview');
            } catch (_) {
                url = null;
            }
        }

        if (!url) {
            await sock.sendMessage(chatId, {
                text: `❌ Impossible de récupérer la photo de profil de @${targetJid.split('@')[0]} (privée ou inexistante).`,
                mentions: [targetJid],
            }, { quoted: message });
            return;
        }

        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        const buffer = Buffer.from(res.data);

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `📸 Photo de profil de @${targetJid.split('@')[0]}`,
            mentions: [targetJid],
        }, { quoted: message });
    } catch (err) {
        console.error('[profilepic] error:', err?.message || err);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la récupération de la photo de profil.',
        }, { quoted: message });
    }
}

module.exports = profilePicCommand;