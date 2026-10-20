const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');
const { stickercropFromBuffer } = require('./stickercrop');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {}
    }
};

const configPath = path.join(__dirname, '../data/autoStatus.json');
const stickerSourcePath = path.join(__dirname, '../assets/bot_image.jpg');
const processedStatuses = new Set();
let cachedStickerBuffer = null;
let cachedStickerPromise = null;

const DEFAULT_REACTION_EMOJIS = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎'];
const REACTION_EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])/u;
const EMOJI_COMMANDS = new Set(['emoji', 'emojis', 'imojis']);

function createDefaultConfig() {
    return {
        enabled: true,
        reactOn: true,
        stickerOn: false,
        reactionEmojis: DEFAULT_REACTION_EMOJIS
    };
}

function splitReactionTokens(value) {
    const text = String(value ?? '').trim();
    if (!text) return [];

    const segments = [];
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        for (const { segment } of segmenter.segment(text)) {
            const token = segment.trim();
            if (token) segments.push(token);
        }
    } else {
        segments.push(
            ...text
                .split(/[,\s]+/g)
                .map((item) => item.trim())
                .filter(Boolean)
        );
    }

    return segments.filter((token) => REACTION_EMOJI_PATTERN.test(token));
}

function normalizeReactionEmojis(value) {
    const emojis = Array.isArray(value)
        ? value.flatMap((item) => splitReactionTokens(item))
        : splitReactionTokens(value);

    const unique = [...new Set(emojis)];
    return unique.length > 0 ? unique : DEFAULT_REACTION_EMOJIS;
}

function readConfigFile() {
    if (!fs.existsSync(configPath)) {
        const fallback = createDefaultConfig();
        fs.writeFileSync(configPath, JSON.stringify(fallback, null, 2));
        return fallback;
    }

    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.error('Auto status config parse error:', error.message);
        const fallback = createDefaultConfig();
        fs.writeFileSync(configPath, JSON.stringify(fallback, null, 2));
        return fallback;
    }
}

function ensureConfig() {
    const parsed = readConfigFile();
    const normalized = {
        ...parsed,
        enabled: Boolean(parsed.enabled),
        reactOn: true,
        stickerOn: Boolean(parsed.stickerOn),
        reactionEmojis: normalizeReactionEmojis(parsed.reactionEmojis)
    };

    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2));
    }

    return normalized;
}

function saveConfig(config) {
    const normalized = {
        enabled: Boolean(config.enabled),
        reactOn: true,
        stickerOn: Boolean(config.stickerOn),
        reactionEmojis: normalizeReactionEmojis(config.reactionEmojis)
    };
    fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2));
}

function getStatusKeyId(statusKey) {
    return `${statusKey?.id || 'unknown'}:${getStatusTargetJid(statusKey) || 'unknown'}`;
}

function getStatusTargetJid(statusKey) {
    const candidates = [
        statusKey?.participant,
        statusKey?.remoteJidAlt,
        statusKey?.remoteJid
    ];

    return candidates.find((jid) => jid && jid !== 'status@broadcast') || null;
}

function pickReactionEmoji(config) {
    const emojis = normalizeReactionEmojis(config?.reactionEmojis);
    return emojis[Math.floor(Math.random() * emojis.length)] || '🔥';
}

async function getStatusStickerBuffer() {
    if (cachedStickerBuffer) return cachedStickerBuffer;
    if (!fs.existsSync(stickerSourcePath)) return null;

    if (!cachedStickerPromise) {
        cachedStickerPromise = (async () => {
            const source = fs.readFileSync(stickerSourcePath);
            const buffer = await stickercropFromBuffer(source, false);
            cachedStickerBuffer = buffer;
            return buffer;
        })().catch((error) => {
            cachedStickerPromise = null;
            throw error;
        });
    }

    return cachedStickerPromise;
}

async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: 'Cette commande est reservee au proprietaire.',
                ...channelInfo
            });
            return;
        }

        const config = ensureConfig();
        const command = String(args?.[0] || '').toLowerCase();

        if (!command || command === 'view' || command === 'show' || command === 'status') {
            await sock.sendMessage(chatId, {
                text:
                    `*Auto Status*\n\n` +
                    `• Lecture auto: ${config.enabled ? 'ON' : 'OFF'}\n` +
                    `• Reaction: ${config.reactOn ? 'ON' : 'OFF'}\n` +
                    `• Emojis reaction: ${config.reactionEmojis.join(' ') || 'par defaut'}\n` +
                    `• Sticker reply: ${config.stickerOn ? 'ON' : 'OFF'}\n\n` +
                    `Commandes:\n` +
                    `.autostatus on/off\n` +
                    `.autostatus react on/off\n` +
                    `.autostatus react emoji(s) 😀 😍 🔥\n` +
                    `.autostatus react emoji(s) reset\n` +
                    `.autostatus emoji(s) 😀 😍 🔥\n` +
                    `.autostatus emoji(s) reset\n` +
                    `.autostatus sticker on/off`,
                ...channelInfo
            });
            return;
        }

        if (command === 'on' || command === 'off') {
            config.enabled = command === 'on';
            saveConfig(config);
            await sock.sendMessage(chatId, {
                text: `Lecture automatique des statuts ${config.enabled ? 'activee' : 'desactivee'}.`,
                ...channelInfo
            });
            return;
        }

        if (command === 'react') {
            const sub = String(args[1] || '').toLowerCase();

            if (EMOJI_COMMANDS.has(sub)) {
                const emojiArg = args.slice(2).join(' ').trim();
                if (!emojiArg) {
                    await sock.sendMessage(chatId, {
                        text: 'Utilise .autostatus react emoji(s) 😀 😍 🔥 ou .autostatus react emoji(s) reset',
                        ...channelInfo
                    });
                    return;
                }

                if (emojiArg.toLowerCase() === 'reset' || emojiArg.toLowerCase() === 'default') {
                    config.reactionEmojis = DEFAULT_REACTION_EMOJIS;
                } else {
                    config.reactionEmojis = normalizeReactionEmojis(emojiArg);
                }

                saveConfig(config);
                await sock.sendMessage(chatId, {
                    text: `Emojis de reaction mis a jour: ${config.reactionEmojis.join(' ')}`,
                    ...channelInfo
                });
                return;
            }

            if (!['on', 'off'].includes(sub)) {
                await sock.sendMessage(chatId, {
                    text: 'Utilise .autostatus react on/off ou .autostatus react emoji ...',
                    ...channelInfo
                });
                return;
            }

            config.reactOn = true;
            saveConfig(config);
            await sock.sendMessage(chatId, {
                text: sub === 'off'
                    ? 'Les reactions automatiques restent activees comme demande.'
                    : 'Reactions automatiques de status activees.',
                ...channelInfo
            });
            return;
        }

        if (EMOJI_COMMANDS.has(command)) {
            const emojiArg = args.slice(1).join(' ').trim();
            if (!emojiArg) {
                await sock.sendMessage(chatId, {
                    text: 'Utilise .autostatus emoji(s) 😀 😍 🔥 ou .autostatus emoji(s) reset',
                    ...channelInfo
                });
                return;
            }

            if (emojiArg.toLowerCase() === 'reset' || emojiArg.toLowerCase() === 'default') {
                config.reactionEmojis = DEFAULT_REACTION_EMOJIS;
            } else {
                config.reactionEmojis = normalizeReactionEmojis(emojiArg);
            }

            saveConfig(config);
            await sock.sendMessage(chatId, {
                text: `Emojis de reaction mis a jour: ${config.reactionEmojis.join(' ')}`,
                ...channelInfo
            });
            return;
        }

        if (command === 'sticker') {
            const state = String(args[1] || '').toLowerCase();
            if (!['on', 'off'].includes(state)) {
                await sock.sendMessage(chatId, {
                    text: 'Utilise .autostatus sticker on/off',
                    ...channelInfo
                });
                return;
            }

            config.stickerOn = state === 'on';
            saveConfig(config);
            if (config.stickerOn) {
                void getStatusStickerBuffer().catch((error) => {
                    console.error('Auto status sticker warmup error:', error.message);
                });
            }
            await sock.sendMessage(chatId, {
                text: `Reponse sticker sur status ${config.stickerOn ? 'activee' : 'desactivee'}.`,
                ...channelInfo
            });
            return;
        }

        await sock.sendMessage(chatId, {
            text: 'Commande invalide. Utilise .autostatus, .autostatus react on/off, .autostatus react emoji(s) ... ou .autostatus sticker on/off',
            ...channelInfo
        });
    } catch (error) {
        console.error('Error in autostatus command:', error);
        await sock.sendMessage(chatId, {
            text: `Erreur autostatus: ${error.message}`,
            ...channelInfo
        });
    }
}

function isAutoStatusEnabled() {
    try {
        return ensureConfig().enabled;
    } catch (error) {
        console.error('Auto status config read error:', error.message);
        return false;
    }
}

function isStatusReactionEnabled() {
    try {
        return ensureConfig().reactOn;
    } catch (error) {
        console.error('Status reaction config read error:', error.message);
        return false;
    }
}

function isStatusStickerEnabled() {
    try {
        return ensureConfig().stickerOn;
    } catch (error) {
        console.error('Status sticker config read error:', error.message);
        return false;
    }
}

async function reactToStatus(sock, statusKey) {
    try {
        if (!isStatusReactionEnabled()) return;

        const config = ensureConfig();
        const participant = getStatusTargetJid(statusKey);
        const emoji = pickReactionEmoji(config);
        if (!participant) return;

        await sock.sendMessage(
            'status@broadcast',
            {
                react: {
                    text: emoji,
                    key: statusKey
                }
            },
            {
                broadcast: true,
                statusJidList: [participant]
            }
        );
    } catch (error) {
        console.error('Status react error:', error.message);
    }
}

async function replyStickerToStatus(sock, statusKey) {
    try {
        if (!isStatusStickerEnabled()) return;

        const targetJid = getStatusTargetJid(statusKey);
        if (!targetJid) return;

        const stickerBuffer = await getStatusStickerBuffer();
        if (!stickerBuffer) return;

        await sock.sendMessage(targetJid, { sticker: stickerBuffer });
    } catch (error) {
        console.error('Status sticker reply error:', error.message);
    }
}

async function processStatusMessage(sock, statusKey) {
    if (!statusKey || statusKey.remoteJid !== 'status@broadcast') return;

    const targetJid = getStatusTargetJid(statusKey);
    if (!targetJid) return;

    const uniqueId = getStatusKeyId(statusKey);
    if (processedStatuses.has(uniqueId)) return;
    processedStatuses.add(uniqueId);

    if (processedStatuses.size > 500) {
        const first = processedStatuses.values().next().value;
        processedStatuses.delete(first);
    }

    let readError = null;

    try {
        await sock.readMessages([statusKey]);
    } catch (error) {
        readError = error;
    }

    try {
        await Promise.all([
            reactToStatus(sock, statusKey),
            replyStickerToStatus(sock, statusKey)
        ]);
    } catch (error) {
        console.error('Auto status process error:', error.message);
    }

    if (readError) {
        if (readError.message?.includes('rate-overlimit')) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
            console.error('Auto status read error:', readError.message);
        }
    }
}

async function handleStatusUpdate(sock, status) {
    try {
        if (!isAutoStatusEnabled()) return;

        const statusMessages = Array.isArray(status?.messages)
            ? status.messages.filter((msg) => msg?.key?.remoteJid === 'status@broadcast' && msg?.message)
            : status?.key?.remoteJid === 'status@broadcast' && status?.message
                ? [status]
                : [];

        for (const msg of statusMessages) {
            await processStatusMessage(sock, msg.key);
        }
    } catch (error) {
        console.error('Auto status handler error:', error.message);
    }
}

module.exports = {
    autoStatusCommand,
    handleStatusUpdate
};
