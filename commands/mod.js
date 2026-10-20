const store = require('../lib/lightweight_store');
const { formatRdcDate } = require('../lib/time');
const { jidVariants } = require('./viewonce');

const KIND_LABELS = {
    text: 'Texte',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    sticker: 'Sticker',
    document: 'Document',
    contact: 'Contact',
    location: 'Location',
    poll: 'Poll',
    message: 'Message'
};

function getQuotedContext(message) {
    return message?.message?.extendedTextMessage?.contextInfo || 
           message?.message?.imageMessage?.contextInfo ||
           message?.message?.videoMessage?.contextInfo ||
           message?.message?.documentMessage?.contextInfo ||
           message?.message?.audioMessage?.contextInfo ||
           message?.message?.stickerMessage?.contextInfo ||
           {};
}

function getEditedRecord(chatId, messageId) {
    if (!chatId || !messageId) return null;
    return store.getEditedMessageRecord(chatId, messageId);
}

function getOriginalSnapshot(record) {
    const history = Array.isArray(record?.history) ? record.history : [];
    return history[0] || null;
}

function formatSnapshot(snapshot) {
    if (!snapshot) return 'Aucune version disponible.';

    const text = String(snapshot.text || '').trim();
    const kindLabel = KIND_LABELS[snapshot.kind] || KIND_LABELS.message;

    if (!text) {
        return snapshot.kind === 'text' ? '(texte vide)' : `[${kindLabel}]`;
    }

    if (snapshot.kind === 'text') {
        return text;
    }

    return `[${kindLabel}] ${text}`;
}

function buildReplyLines(record) {
    const history = Array.isArray(record?.history) ? record.history : [];
    const original = history[0] || null;
    const latest = history[history.length - 1] || null;
    const author = String(record?.senderJid || '').trim();
    const versionCount = history.length;
    const hasHistory = versionCount > 1;
    const wasEdited = record?.wasEdited !== false;

    const lines = [];
    lines.push('*MESSAGE MODIFIE*');

    if (author && author.includes('@')) {
        lines.push(`*Auteur:* @${author.split('@')[0]}`);
    }

    lines.push(`*Versions:* ${versionCount}`);

    if (original?.timestamp) {
        lines.push(`*Date de la premiere version:* ${formatRdcDate(original.timestamp)}`);
    }

    if (hasHistory && latest?.timestamp) {
        lines.push(`*Derniere modification:* ${formatRdcDate(latest.timestamp)}`);
    }

    lines.push('');

    if (hasHistory) {
        lines.push('*Version originale:*');
        lines.push(formatSnapshot(original));
        lines.push('');
        lines.push('*Derniere version:*');
        lines.push(formatSnapshot(latest));
    } else {
        lines.push(wasEdited
            ? "Historique incomplet: seule la derniere version a ete capturee."
            : 'Aucune modification enregistree pour ce message.');
        lines.push('');
        lines.push('*Version disponible:*');
        lines.push(formatSnapshot(latest));
    }

    return {
        text: lines.join('\n'),
        mentions: author && author.endsWith('@s.whatsapp.net') ? [author] : []
    };
}

function formatOriginalEditedMessage(record) {
    const original = getOriginalSnapshot(record);
    return formatSnapshot(original).trim();
}

async function sendEditedSummary(sock, targetChatId, record, quotedMessage = null) {
    const payload = buildReplyLines(record);
    return sock.sendMessage(targetChatId, {
        text: payload.text,
        mentions: payload.mentions
    }, quotedMessage ? { quoted: quotedMessage } : {});
}

async function replyWithEditedMessage(sock, chatId, message) {
    const contextInfo = getQuotedContext(message);
    const messageId = contextInfo.stanzaId;
    const record = getEditedRecord(chatId, messageId);

    if (!messageId) {
        return sock.sendMessage(chatId, {
            text: '❌ Réponds (quote) à un message avec *.mod* pour voir sa version originale.'
        }, { quoted: message });
    }

    if (!record) {
        // Fallback: no edit history captured (bot restarted, or msg never edited).
        // Show the quoted content itself if available, so .mod remains useful.
        const quoted = contextInfo.quotedMessage;
        const fallback = quoted
            ? extractPlainText(quoted) || '[Média sans texte]'
            : null;
        return sock.sendMessage(chatId, {
            text: fallback
                ? `ℹ️ Aucun historique de modification. Contenu actuel du message cité :\n\n${fallback}`
                : "❌ Aucun historique de modification n'est disponible pour ce message."
        }, { quoted: message });
    }

    const originalText = formatOriginalEditedMessage(record);

    return sock.sendMessage(chatId, {
        text: originalText || 'Aucune version disponible.'
    }, { quoted: message });
}

function extractPlainText(msg) {
    if (!msg || typeof msg !== 'object') return '';
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        ''
    ).trim();
}

async function saveEditedMessageToSelfCommand(sock, chatId, message) {
    try {
        const contextInfo = getQuotedContext(message);
        const messageId = contextInfo.stanzaId;
        const record = getEditedRecord(chatId, messageId);

        if (!messageId) {
            return sock.sendMessage(chatId, {
                text: '❌ Réponds à un message modifié avec .mod ou .mod2.'
            }, { quoted: message });
        }

        if (!record) {
            return sock.sendMessage(chatId, {
                text: "❌ Aucun historique de modification n'est disponible pour ce message."
            }, { quoted: message });
        }

        const selfChatIds = jidVariants(sock?.user?.id);
        if (!selfChatIds.length) {
            return sock.sendMessage(chatId, {
                text: '❌ Impossible de trouver ta conversation privée.'
            }, { quoted: message });
        }

        let lastError = null;
        let sent = false;

        for (const selfChatId of selfChatIds) {
            try {
                await sendEditedSummary(sock, selfChatId, record, null);
                sent = true;
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!sent) {
            throw lastError || new Error('Failed to send edited message summary to self chat.');
        }

        return sock.sendMessage(chatId, {
            text: '✅ Succès : l\'historique a été envoyé dans tes messages enregistrés.'
        }, { quoted: message });
    } catch (error) {
        console.error('mod2 error:', error);
        return sock.sendMessage(chatId, {
            text: '❌ Impossible d\'envoyer l\'historique en privé.'
        }, { quoted: message });
    }
}

async function modCommand(sock, chatId, message) {
    return replyWithEditedMessage(sock, chatId, message);
}

async function mod2Command(sock, chatId, message) {
    return saveEditedMessageToSelfCommand(sock, chatId, message);
}

module.exports = {
    modCommand,
    mod2Command
};
