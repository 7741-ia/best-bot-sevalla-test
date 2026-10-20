const LINK_PATTERNS = [
    /https?:\/\/\S+/i,
    /\bwww\.\S+/i,
    /\b(?:chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel|t\.me|telegram\.me|discord\.gg|discord\.com\/invite)\/\S*/i,
    /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i
];

const MEDIA_KEYS = new Set([
    'imageMessage',
    'videoMessage',
    'stickerMessage',
    'audioMessage',
    'pttMessage',
    'documentMessage',
    'documentWithCaptionMessage',
    'contactMessage',
    'contactArrayMessage',
    'locationMessage',
    'liveLocationMessage',
    'productMessage',
    'orderMessage',
    'pollCreationMessage',
    'pollUpdateMessage'
]);

// Types that carry rich embedded content typically used to share channel /
// newsletter posts, group invites or link previews inside another message.
const RICH_SHARE_KEYS = new Set([
    'groupInviteMessage',
    'templateMessage',
    'interactiveMessage',
    'buttonsMessage',
    'listMessage',
    'productMessage',
    'orderMessage'
]);

function unwrapMessageContent(content) {
    let current = content;
    let guard = 0;

    while (current && typeof current === 'object' && guard < 10) {
        const next =
            current.ephemeralMessage?.message ||
            current.viewOnceMessage?.message ||
            current.viewOnceMessageV2?.message ||
            current.viewOnceMessageV2Extension?.message;

        if (!next) break;
        current = next;
        guard += 1;
    }

    return current;
}

function pushText(value, fragments) {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) fragments.push(trimmed);
}

function collectMessageTexts(content, fragments = []) {
    const body = unwrapMessageContent(content);
    if (!body || typeof body !== 'object') return fragments;

    pushText(body.conversation, fragments);
    pushText(body.text, fragments);
    pushText(body.caption, fragments);
    pushText(body.contentText, fragments);
    pushText(body.body, fragments);
    pushText(body.title, fragments);
    pushText(body.description, fragments);
    pushText(body.footerText, fragments);
    pushText(body.displayText, fragments);
    pushText(body.selectedButtonId, fragments);
    pushText(body.selectedRowId, fragments);
    pushText(body.rowId, fragments);
    pushText(body.name, fragments);

    if (body.extendedTextMessage) pushText(body.extendedTextMessage.text, fragments);
    if (body.imageMessage) pushText(body.imageMessage.caption, fragments);
    if (body.videoMessage) pushText(body.videoMessage.caption, fragments);
    if (body.documentMessage) pushText(body.documentMessage.caption, fragments);
    if (body.audioMessage) pushText(body.audioMessage.caption, fragments);
    if (body.locationMessage) pushText(body.locationMessage.caption, fragments);
    if (body.liveLocationMessage) pushText(body.liveLocationMessage.caption, fragments);

    if (body.buttonsResponseMessage) {
        pushText(body.buttonsResponseMessage.selectedButtonId, fragments);
    }

    if (body.listResponseMessage) {
        pushText(body.listResponseMessage.title, fragments);
        pushText(body.listResponseMessage.description, fragments);
        pushText(body.listResponseMessage.singleSelectReply?.selectedRowId, fragments);
    }

    if (body.templateButtonReplyMessage) {
        pushText(body.templateButtonReplyMessage.selectedId, fragments);
    }

    if (body.interactiveResponseMessage) {
        pushText(body.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson, fragments);
    }

    if (body.nativeFlowResponseMessage) {
        pushText(body.nativeFlowResponseMessage.paramsJson, fragments);
    }

    return fragments;
}

function extractMessageTexts(message) {
    const fragments = collectMessageTexts(message?.message || message, []);
    return [...new Set(fragments)];
}

function messageContainsLink(message) {
    const texts = extractMessageTexts(message);
    if (texts.some((text) => LINK_PATTERNS.some((pattern) => pattern.test(String(text))))) {
        return true;
    }
    // Detect embedded links / channel-forward signals (WhatsApp channel shares
    // typically arrive as a normal message with contextInfo pointing to a
    // newsletter, or with an externalAdReply that carries the channel URL).
    return messageContainsChannelShare(message);
}

function hasMediaMessage(message) {
    const body = unwrapMessageContent(message?.message || message);
    if (!body || typeof body !== 'object') return false;

    for (const key of MEDIA_KEYS) {
        if (body[key]) return true;
    }

    for (const key of RICH_SHARE_KEYS) {
        if (body[key]) return true;
    }

    if (messageContainsChannelShare(message)) return true;

    return false;
}

// Antimedia strict : uniquement photos et vidéos (y compris view-once / captions).
const PHOTO_VIDEO_KEYS = ['imageMessage', 'videoMessage'];
function hasPhotoOrVideoMessage(message) {
    const body = unwrapMessageContent(message?.message || message);
    if (!body || typeof body !== 'object') return false;
    for (const key of PHOTO_VIDEO_KEYS) {
        if (body[key]) return true;
    }
    return false;
}

function collectContextInfos(content, acc = []) {
    const body = unwrapMessageContent(content);
    if (!body || typeof body !== 'object') return acc;

    if (body.contextInfo) acc.push(body.contextInfo);
    for (const key of Object.keys(body)) {
        const child = body[key];
        if (child && typeof child === 'object' && child.contextInfo) {
            acc.push(child.contextInfo);
        }
    }
    return acc;
}

function messageContainsChannelShare(message) {
    const body = unwrapMessageContent(message?.message || message);
    if (!body || typeof body !== 'object') return false;

    const contexts = collectContextInfos(body);
    for (const ctx of contexts) {
        if (!ctx || typeof ctx !== 'object') continue;
        if (ctx.forwardedNewsletterMessageInfo) return true;
        if (typeof ctx.forwardingScore === 'number' && ctx.forwardingScore >= 5 && ctx.isForwarded) return true;
        const ext = ctx.externalAdReply;
        if (ext && (ext.sourceUrl || ext.sourceType === 'CHANNEL' || ext.sourceId)) return true;
        const mentions = Array.isArray(ctx.mentionedJid) ? ctx.mentionedJid : [];
        if (mentions.some((jid) => typeof jid === 'string' && jid.endsWith('@newsletter'))) return true;
        if (Array.isArray(ctx.groupMentions) && ctx.groupMentions.some((g) => g?.groupJid?.endsWith?.('@newsletter'))) return true;
    }
    return false;
}

async function safeDeleteMessage(sock, chatId, message, participantId) {
    if (!sock || !chatId || !message?.key?.id) return false;

    const deleteKey = {
        remoteJid: message.key.remoteJid || chatId,
        fromMe: false,
        id: message.key.id,
        participant: participantId || require('./jidUtils').getSender(message)
    };

    const attempts = [
        async () => sock.sendMessage(chatId, { delete: message.key }),
        async () => sock.sendMessage(chatId, { delete: deleteKey }),
        async () => {
            if (typeof sock.relayMessage !== 'function') return false;
            await sock.relayMessage(
                chatId,
                {
                    protocolMessage: {
                        key: deleteKey,
                        type: 0
                    }
                },
                {}
            );
            return true;
        }
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            await attempt();
            return true;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Failed to delete message:', lastError.message);
    }

    return false;
}

function normalizeMessageText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

module.exports = {
    unwrapMessageContent,
    collectMessageTexts,
    extractMessageTexts,
    messageContainsLink,
    hasMediaMessage,
    hasPhotoOrVideoMessage,
    safeDeleteMessage,
    normalizeMessageText,
    messageContainsChannelShare
};
