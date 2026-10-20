const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

/**
 * .save / .savestatus / .getstatus
 * Réponds à un statut WhatsApp (image / vidéo / audio / texte) avec cette commande :
 * le statut est sauvegardé dans TA conversation privée (pas chez l'auteur du statut),
 * avec un message de confirmation.
 */

const inFlight = new Map(); // anti double exécution (même statut, même demandeur)
const IN_FLIGHT_TTL = 30 * 1000;

function guard(key) {
    const now = Date.now();
    for (const [k, t] of inFlight) if (now - t > IN_FLIGHT_TTL) inFlight.delete(k);
    if (inFlight.has(key)) return false;
    inFlight.set(key, now);
    return true;
}

async function downloadBuffer(node, type) {
    const stream = await downloadContentFromMessage(node, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function getStatusCommand(sock, chatId, message) {
    const fromMe = Boolean(message.key.fromMe);
    const senderJid = jidNormalizedUser(require('../lib/jidUtils').getSender(message));
    const selfJid = jidNormalizedUser(sock.user?.id || '');
    // Sauvegarde : dans ta conversation privée (compte connecté), ou celle du demandeur si ce n'est pas toi
    const dest = fromMe ? selfJid : senderJid;

    try {
        const ctx = message.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage;

        if (!quoted) {
            await sock.sendMessage(dest, {
                text: '💡 Réponds à un statut (image, vidéo, audio ou texte) avec *.save* pour le sauvegarder ici.',
            });
            return;
        }

        const lockKey = `${ctx.stanzaId || message.key.id}:${senderJid}`;
        if (!guard(lockKey)) return; // déjà en cours / déjà fait

        const owner = ctx.participant || ctx.remoteJid;
        const mentions = owner && owner !== 'status@broadcast' ? [owner] : [];
        const label = mentions.length ? `@${owner.split('@')[0]}` : 'un contact';
        const done = '✅ Sauvegardé avec succès 🙌';

        // Texte
        const textContent = quoted.conversation || quoted.extendedTextMessage?.text;
        if (textContent) {
            await sock.sendMessage(dest, { text: `📝 Statut de ${label} :\n\n${textContent}\n\n${done}`, mentions });
        } else {
            let sent = false;
            for (const [key, streamType] of [['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio']]) {
                if (!quoted[key]) continue;
                const buffer = await downloadBuffer(quoted[key], streamType);
                const base = quoted[key].caption ? `📥 Statut de ${label}\n\n${quoted[key].caption}` : `📥 Statut de ${label}`;
                if (streamType === 'audio') {
                    await sock.sendMessage(dest, { audio: buffer, mimetype: 'audio/mp4', ptt: Boolean(quoted[key].ptt) });
                    await sock.sendMessage(dest, { text: `${base}\n\n${done}`, mentions });
                } else {
                    await sock.sendMessage(dest, { [streamType]: buffer, caption: `${base}\n\n${done}`, mentions });
                }
                sent = true;
                break;
            }
            if (!sent) {
                inFlight.delete(lockKey);
                await sock.sendMessage(dest, { text: '❌ Ce type de statut n\'est pas pris en charge.' });
                return;
            }
        }

        // Retour discret : si tu as tapé .save dans le chat de l'auteur, on efface ta commande pour qu'il ne la voie pas
        if (fromMe && chatId !== dest) {
            try { await sock.sendMessage(chatId, { delete: message.key }); } catch (_) { /* ignoré */ }
        } else if (chatId === dest) {
            try { await sock.sendMessage(chatId, { react: { text: '🙌', key: message.key } }); } catch (_) { /* ignoré */ }
        } else {
            await sock.sendMessage(chatId, { text: '✅ Statut envoyé dans ta conversation privée 🙌' }, { quoted: message });
        }
    } catch (err) {
        console.error('[getstatus] error:', err?.message || err);
        try { await sock.sendMessage(dest, { text: '❌ Impossible de sauvegarder ce statut (il a peut-être expiré). Réessaie.' }); } catch (_) {}
    }
}

module.exports = getStatusCommand;
