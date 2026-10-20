const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function unwrapMessageContent(content) {
    if (!content) return null;

    if (content.message) {
        return unwrapMessageContent(content.message);
    }
    if (content.ephemeralMessage?.message) {
        return unwrapMessageContent(content.ephemeralMessage.message);
    }
    if (content.viewOnceMessageV2?.message) {
        return unwrapMessageContent(content.viewOnceMessageV2.message);
    }
    if (content.viewOnceMessageV2Extension?.message) {
        return unwrapMessageContent(content.viewOnceMessageV2Extension.message);
    }
    if (content.viewOnceMessage?.message) {
        return unwrapMessageContent(content.viewOnceMessage.message);
    }

    return content;
}

function getContextInfo(message) {
    const body = message?.message || {};
    return (
        body?.extendedTextMessage?.contextInfo ||
        body?.imageMessage?.contextInfo ||
        body?.videoMessage?.contextInfo ||
        body?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo ||
        body?.buttonsResponseMessage?.contextInfo ||
        body?.listResponseMessage?.contextInfo ||
        body?.templateButtonReplyMessage?.contextInfo ||
        null
    );
}

function getQuotedSourceMessage(message) {
    const quoted = getContextInfo(message)?.quotedMessage;
    return unwrapMessageContent(quoted);
}

function hasViewOnceMedia(content) {
    if (!content || typeof content !== 'object') return false;
    if (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension) return true;
    if (content.imageMessage?.viewOnce || content.videoMessage?.viewOnce || content.audioMessage?.viewOnce) return true;
    if (content.message && hasViewOnceMedia(content.message)) return true;
    if (content.ephemeralMessage?.message && hasViewOnceMedia(content.ephemeralMessage.message)) return true;
    if (content.documentWithCaptionMessage?.message && hasViewOnceMedia(content.documentWithCaptionMessage.message)) return true;
    return false;
}

function shouldSaveViewOnceFromEmojiReply(message, text) {
    const value = String(text || '').trim();
    if (!value || typeof Intl?.Segmenter !== 'function') return false;

    const graphemes = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(value)]
        .map(({ segment }) => segment)
        .filter((segment) => !/^\s+$/u.test(segment));
    if (graphemes.length < 5 || !graphemes.every((segment) => /\p{Extended_Pictographic}/u.test(segment))) return false;

    const quoted = getContextInfo(message)?.quotedMessage;
    return hasViewOnceMedia(quoted);
}

function getDirectSourceMessage(message) {
    return unwrapMessageContent(message?.message);
}

function jidVariants(jid) {
    if (!jid || typeof jid !== 'string') return [];

    const normalized = jid.split(':')[0];
    const base = normalized.split('@')[0];
    const variants = new Set();

    if (normalized.includes('@')) variants.add(normalized);
    if (base) {
        variants.add(`${base}@s.whatsapp.net`);
        variants.add(`${base}@lid`);
    }

    return [...variants];
}

async function bufferFromContent(media, type) {
    const stream = await downloadContentFromMessage(media, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

async function revealViewOnceToChat(sock, targetChatId, sourceMessage, quotedMessage, options = {}) {
    const source = options.direct ? getDirectSourceMessage(sourceMessage) : getQuotedSourceMessage(sourceMessage);

    const image = source?.imageMessage;
    const video = source?.videoMessage;
    const audio = source?.audioMessage;

    if (image) {
        const buffer = await bufferFromContent(image, 'image');
        await sock.sendMessage(targetChatId, {
            image: buffer,
            caption: image.caption || options.caption || ''
        }, quotedMessage ? { quoted: quotedMessage } : {});
        return { type: 'image', targetChatId };
    }

    if (video) {
        const buffer = await bufferFromContent(video, 'video');
        await sock.sendMessage(targetChatId, {
            video: buffer,
            caption: video.caption || options.caption || ''
        }, quotedMessage ? { quoted: quotedMessage } : {});
        return { type: 'video', targetChatId };
    }

    if (audio) {
        const buffer = await bufferFromContent(audio, 'audio');
        await sock.sendMessage(targetChatId, {
            audio: buffer,
            mimetype: audio.mimetype || 'audio/ogg; codecs=opus',
            ptt: audio.ptt || false
        }, quotedMessage ? { quoted: quotedMessage } : {});
        return { type: 'audio', targetChatId };
    }

    return null;
}

function getSelfChatIds(sock) {
    return jidVariants(sock?.user?.id);
}

async function viewonceCommand(sock, chatId, message) {
    try {
        const result = await revealViewOnceToChat(sock, chatId, message, message);
        if (!result) {
            await sock.sendMessage(chatId, {
                text: '❌ Réponds à une image, vidéo ou audio en vue unique.'
            }, { quoted: message });
        }
    } catch (err) {
        console.error(err);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors du traitement du media.'
        }, { quoted: message });
    }
}

async function viewonceSaveToSelfCommand(sock, chatId, message, { silent = false } = {}) {
    try {
        const selfChatIds = getSelfChatIds(sock);
        if (!selfChatIds.length) {
            if (!silent) {
                await sock.sendMessage(chatId, { text: '❌ Impossible de trouver votre conversation personnelle.' }, { quoted: message });
            }
            return;
        }

        let lastError = null;
        let result = null;

        for (const selfChatId of selfChatIds) {
            try {
                result = await revealViewOnceToChat(sock, selfChatId, message, null);
                if (result) break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!result && lastError) {
            throw lastError;
        }

        if (!result) {
            if (!silent) {
                await sock.sendMessage(chatId, {
                    text: '❌ Réponds à une image, vidéo ou audio en vue unique.'
                }, { quoted: message });
            }
            return;
        }

        if (!silent) {
            await sock.sendMessage(chatId, {
                text: `Succès : la vue unique (${result.type}) a été sauvegardée dans ta conversation personnelle.`
            }, { quoted: message });
        }
    } catch (error) {
        console.error('vv2 error:', error);
        if (!silent) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur pendant la sauvegarde de la vue unique.'
            }, { quoted: message });
        }
    }
}

module.exports = {
    viewonceCommand,
    viewonceSaveToSelfCommand,
    revealViewOnceToChat,
    getDirectSourceMessage,
    unwrapMessageContent,
    shouldSaveViewOnceFromEmojiReply,
    jidVariants
};
