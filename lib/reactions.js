const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const commandEmojis = ['⏳', '⚡', '👀', '✅', '🔥'];
const recentReactionKeys = new Map();
const REACTION_TTL_MS = 5 * 60 * 1000;

function loadData() {
    if (!fs.existsSync(USER_GROUP_DATA)) return {};
    return JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
}

function getGroupConfig(groupId) {
    const data = loadData();

    if (data.autoReaction === true) {
        return { enabled: true, delay: 0 };
    }

    return data.autoReaction?.[groupId] || { enabled: false, delay: 0 };
}

function setGroupConfig(groupId, config) {
    const data = loadData();
    if (!data.autoReaction || typeof data.autoReaction !== 'object') data.autoReaction = {};
    data.autoReaction[groupId] = config;
    saveData(data);
}

function getRandomEmoji() {
    return commandEmojis[Math.floor(Math.random() * commandEmojis.length)];
}

function getReactionKey(message) {
    const remoteJid = message?.key?.remoteJid || '';
    const messageId = message?.key?.id || '';
    return remoteJid && messageId ? `${remoteJid}:${messageId}` : '';
}

function pruneRecentReactionKeys(now = Date.now()) {
    for (const [key, timestamp] of recentReactionKeys.entries()) {
        if (now - timestamp > REACTION_TTL_MS) {
            recentReactionKeys.delete(key);
        }
    }
}

async function addCommandReaction(sock, message) {
    try {
        const jid = message.key.remoteJid;
        if (!jid.endsWith('@g.us')) return;

        const config = getGroupConfig(jid);
        if (!config.enabled) return;

        const userMessage =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            '';

        if (
            userMessage.startsWith('.autoreact') ||
            userMessage.startsWith('.autoreaction') ||
            userMessage.startsWith('.areact')
        ) {
            return;
        }

        const reactionKey = getReactionKey(message);
        if (!reactionKey) return;

        const now = Date.now();
        pruneRecentReactionKeys(now);
        if (recentReactionKeys.has(reactionKey)) return;
        recentReactionKeys.set(reactionKey, now);

        const emoji = getRandomEmoji();
        const delay = config.delay || 0;

        setTimeout(async () => {
            try {
                await sock.sendMessage(jid, {
                    react: {
                        text: emoji,
                        key: message.key
                    }
                });
            } catch (error) {
                console.error('Auto reaction send error:', error.message);
            }
        }, delay);
    } catch (err) {
        console.error('Auto reaction error:', err.message);
    }
}

async function handleAreactCommand(sock, chatId, message, senderId) {
    if (!chatId.endsWith('@g.us')) return;

    const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    if (!isSenderAdmin && !isOwner) {
        return sock.sendMessage(chatId, {
            text: 'Seuls les admins du groupe ou le proprietaire peuvent utiliser cette commande.'
        }, { quoted: message });
    }

    const args =
        message.message?.conversation?.split(' ') ||
        message.message?.extendedTextMessage?.text?.split(' ') ||
        [];
    const action = String(args[1] || '').toLowerCase();
    const delay = parseInt(args[2], 10) || 0;

    if (action === 'on') {
        setGroupConfig(chatId, { enabled: true, delay });
        return sock.sendMessage(chatId, {
            text: `Auto reaction activee.\nDelai: ${delay} ms`
        }, { quoted: message });
    }

    if (action === 'off') {
        setGroupConfig(chatId, { enabled: false, delay: 0 });
        return sock.sendMessage(chatId, {
            text: 'Auto reaction desactivee pour ce groupe.'
        }, { quoted: message });
    }

    const current = getGroupConfig(chatId);
    return sock.sendMessage(chatId, {
        text: [
            '*Etat Auto Reaction*',
            `Statut: ${current.enabled ? 'ON' : 'OFF'}`,
            `Delai: ${current.delay} ms`,
            '',
            'Utilisation:',
            '.areact on [delay]',
            '.areact off'
        ].join('\n')
    }, { quoted: message });
}

module.exports = {
    addCommandReaction,
    handleAreactCommand
};
