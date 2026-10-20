const fs = require('fs');
const path = require('path');

const config = require('../config');
const isAdmin = require('../lib/isAdmin');
const { incrementWarningCount, resetWarningCount, isSudo } = require('../lib/index');
const { extractMessageTexts, normalizeMessageText, safeDeleteMessage } = require('../lib/moderationUtils');

const DATA_PATH = path.join(__dirname, '../data/userGroupData.json');
const DEFAULT_WINDOW_SECONDS = 8;
const DEFAULT_LIMIT = 4;
const DEFAULT_REPEAT_LIMIT = 3;
const WARN_LIMIT = config.WARN_COUNT || 3;

const spamHistory = new Map();
let cleanupTimer = null;

function ensureCleanupTimer() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(pruneSpamHistory, 5 * 60 * 1000);
    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }
}

function readData() {
    try {
        if (!fs.existsSync(DATA_PATH)) return {};
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (error) {
        console.error('Failed to read antispam data:', error.message);
        return {};
    }
}

function saveData(data) {
    try {
        fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save antispam data:', error.message);
        return false;
    }
}

function ensureBucket(data) {
    if (!data.antispam || typeof data.antispam !== 'object' || Array.isArray(data.antispam)) {
        data.antispam = {};
    }
    return data.antispam;
}

function getConfig(groupId) {
    const data = readData();
    return data.antispam?.[groupId] || null;
}

function applyConfig(groupId, patch, enableIfMissing = true) {
    const data = readData();
    const bucket = ensureBucket(data);
    const current = bucket[groupId] || {
        enabled: false,
        action: 'delete',
        limit: DEFAULT_LIMIT,
        windowSeconds: DEFAULT_WINDOW_SECONDS,
        repeatLimit: DEFAULT_REPEAT_LIMIT,
        lastTriggered: {}
    };

    const next = {
        ...current,
        ...patch,
        lastTriggered: current.lastTriggered || {},
        lastUpdated: Date.now()
    };

    if (!bucket[groupId]) {
        next.enabled = enableIfMissing ? true : false;
    }

    bucket[groupId] = next;
    saveData(data);
    return next;
}

function removeConfig(groupId) {
    const data = readData();
    const bucket = ensureBucket(data);
    if (bucket[groupId]) {
        delete bucket[groupId];
        saveData(data);
    }
}

function buildHistoryKey(groupId, senderId) {
    return `${groupId}:${senderId}`;
}

function clearGroupHistory(groupId) {
    for (const key of spamHistory.keys()) {
        if (key.startsWith(`${groupId}:`)) {
            spamHistory.delete(key);
        }
    }
}

function pruneSpamHistory() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, entry] of spamHistory.entries()) {
        const nextEvents = (entry.events || []).filter((item) => item.ts >= cutoff);
        if (nextEvents.length) {
            entry.events = nextEvents;
            spamHistory.set(key, entry);
        } else {
            spamHistory.delete(key);
        }
    }
}

function stripCommandPrefix(text) {
    return String(text || '').trim().replace(/^\.\S+\s*/i, '');
}

function formatConfigSummary(groupId, configData) {
    if (!configData?.enabled) {
        return '*Antispam*\nStatus: OFF';
    }

    return [
        '*Antispam*',
        `Status: ON`,
        `Action: ${configData.action || 'delete'}`,
        `Limit: ${configData.limit || DEFAULT_LIMIT} messages`,
        `Window: ${configData.windowSeconds || DEFAULT_WINDOW_SECONDS} seconds`,
        `Repeat: ${configData.repeatLimit || DEFAULT_REPEAT_LIMIT} same messages`
    ].join('\n');
}

async function handleAntispamCommand(sock, chatId, rawText, senderId, isSenderAdmin, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement etre utilisee dans un groupe.' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```Commande reservee aux admins du groupe !```' }, { quoted: message });
            return;
        }

        const body = stripCommandPrefix(rawText);
        const tokens = body.split(/\s+/).filter(Boolean);
        const action = (tokens[0] || '').toLowerCase();

        if (!action || action === 'help' || action === 'usage') {
            const usage = [
                '```CONFIGURATION ANTISPAM',
                '',
                '.antispam on',
                '.antispam off',
                '.antispam get',
                '.antispam set delete | warn | kick',
                '.antispam limit <number>',
                '.antispam window <seconds>',
                '.antispam repeat <number>',
                '```'
            ].join('\n');
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        if (action === 'on') {
            const current = getConfig(chatId) || {};
            const updated = applyConfig(chatId, {
                enabled: true,
                action: current.action || 'delete',
                limit: current.limit || DEFAULT_LIMIT,
                windowSeconds: current.windowSeconds || DEFAULT_WINDOW_SECONDS,
                repeatLimit: current.repeatLimit || DEFAULT_REPEAT_LIMIT,
                lastTriggered: {}
            });

            clearGroupHistory(chatId);
            await sock.sendMessage(chatId, {
                text: `Antispam activé.\nAction : ${updated.action}\nLimite : ${updated.limit} messages / ${updated.windowSeconds}s\nRépétition : ${updated.repeatLimit}`
            }, { quoted: message });
            return;
        }

        if (action === 'off') {
            removeConfig(chatId);
            clearGroupHistory(chatId);
            await sock.sendMessage(chatId, { text: 'Antispam desactive.' }, { quoted: message });
            return;
        }

        if (action === 'get' || action === 'status' || action === 'show') {
            const current = getConfig(chatId);
            await sock.sendMessage(chatId, { text: formatConfigSummary(chatId, current) }, { quoted: message });
            return;
        }

        if (action === 'set') {
            const nextAction = (tokens[1] || '').toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(nextAction)) {
                await sock.sendMessage(chatId, { text: 'Action invalide. Choisis delete, warn ou kick.' }, { quoted: message });
                return;
            }

            const current = getConfig(chatId) || {};
            const updated = applyConfig(chatId, {
                enabled: true,
                action: nextAction,
                limit: current.limit || DEFAULT_LIMIT,
                windowSeconds: current.windowSeconds || DEFAULT_WINDOW_SECONDS,
                repeatLimit: current.repeatLimit || DEFAULT_REPEAT_LIMIT
            });

            clearGroupHistory(chatId);
            await sock.sendMessage(chatId, {
                text: `Antispam configuré.\nAction : ${updated.action}\nLimite : ${updated.limit} messages / ${updated.windowSeconds}s\nRépétition : ${updated.repeatLimit}`
            }, { quoted: message });
            return;
        }

        if (action === 'limit') {
            const limitValue = Number.parseInt(tokens[1], 10);
            if (!Number.isFinite(limitValue) || limitValue < 2 || limitValue > 50) {
                await sock.sendMessage(chatId, { text: 'Limite invalide. Utilise un nombre entre 2 et 50.' }, { quoted: message });
                return;
            }

            const current = getConfig(chatId) || {};
            const updated = applyConfig(chatId, {
                enabled: true,
                limit: limitValue,
                action: current.action || 'delete',
                windowSeconds: current.windowSeconds || DEFAULT_WINDOW_SECONDS,
                repeatLimit: current.repeatLimit || DEFAULT_REPEAT_LIMIT
            });

            clearGroupHistory(chatId);
            await sock.sendMessage(chatId, {
                text: `Antispam mis à jour.\nLimite : ${updated.limit} messages / ${updated.windowSeconds}s`
            }, { quoted: message });
            return;
        }

        if (action === 'window') {
            const windowValue = Number.parseInt(tokens[1], 10);
            if (!Number.isFinite(windowValue) || windowValue < 2 || windowValue > 60) {
                await sock.sendMessage(chatId, { text: 'Fenetre invalide. Utilise un nombre entre 2 et 60 secondes.' }, { quoted: message });
                return;
            }

            const current = getConfig(chatId) || {};
            const updated = applyConfig(chatId, {
                enabled: true,
                windowSeconds: windowValue,
                action: current.action || 'delete',
                limit: current.limit || DEFAULT_LIMIT,
                repeatLimit: current.repeatLimit || DEFAULT_REPEAT_LIMIT
            });

            clearGroupHistory(chatId);
            await sock.sendMessage(chatId, {
                text: `Antispam mis à jour.\nFenêtre : ${updated.windowSeconds} secondes`
            }, { quoted: message });
            return;
        }

        if (action === 'repeat') {
            const repeatValue = Number.parseInt(tokens[1], 10);
            if (!Number.isFinite(repeatValue) || repeatValue < 2 || repeatValue > 10) {
                await sock.sendMessage(chatId, { text: 'Repeat invalide. Utilise un nombre entre 2 et 10.' }, { quoted: message });
                return;
            }

            const current = getConfig(chatId) || {};
            const updated = applyConfig(chatId, {
                enabled: true,
                repeatLimit: repeatValue,
                action: current.action || 'delete',
                limit: current.limit || DEFAULT_LIMIT,
                windowSeconds: current.windowSeconds || DEFAULT_WINDOW_SECONDS
            });

            clearGroupHistory(chatId);
            await sock.sendMessage(chatId, {
                text: `Antispam mis à jour.\nRépétition : ${updated.repeatLimit} messages identiques`
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: 'Utilise .antispam pour voir l aide.' }, { quoted: message });
    } catch (error) {
        console.error('Error in antispam command:', error);
        await sock.sendMessage(chatId, { text: 'Erreur lors du traitement de la commande antispam.' }, { quoted: message });
    }
}

async function handleAntispamDetection(sock, chatId, message, senderId) {
    try {
        ensureCleanupTimer();

        if (!chatId.endsWith('@g.us')) return false;
        if (!message?.message || message.key?.fromMe) return false;

        const configData = getConfig(chatId);
        if (!configData?.enabled) return false;

        const sender = senderId || require('../lib/jidUtils').getSender(message);
        if (!sender) return false;

        try {
            const adminStatus = await isAdmin(sock, chatId, sender);
            if (adminStatus.isSenderAdmin) return false;
        } catch (_) {}

        if (await isSudo(sender)) return false;

        const texts = extractMessageTexts(message);
        const normalizedText = normalizeMessageText(texts.join(' '));
        if (!normalizedText) return false;

        const limit = Number.parseInt(configData.limit, 10) || DEFAULT_LIMIT;
        const windowSeconds = Number.parseInt(configData.windowSeconds, 10) || DEFAULT_WINDOW_SECONDS;
        const repeatLimit = Number.parseInt(configData.repeatLimit, 10) || DEFAULT_REPEAT_LIMIT;
        const windowMs = windowSeconds * 1000;

        const historyKey = buildHistoryKey(chatId, sender);
        const now = Date.now();
        const entry = spamHistory.get(historyKey) || { events: [] };
        entry.events = (entry.events || []).filter((item) => now - item.ts <= windowMs);
        entry.events.push({ text: normalizedText, ts: now });
        spamHistory.set(historyKey, entry);

        const totalMessages = entry.events.length;
        const repeatedMessages = entry.events.filter((item) => item.text === normalizedText).length;
        const isSpam = totalMessages > limit || repeatedMessages >= repeatLimit;
        if (!isSpam) return false;

        await safeDeleteMessage(sock, chatId, message, sender);

        const action = (configData.action || 'delete').toLowerCase();
        try {
            if (action === 'kick') {
                await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🚫 @${sender.split('@')[0]} a ete retire pour spam.`,
                    mentions: [sender]
                }, { quoted: message });
            } else if (action === 'warn') {
                const warningCount = await incrementWarningCount(chatId, sender, 'antispam');
                await sock.sendMessage(chatId, {
                    text: `⚠️ @${sender.split('@')[0]} spam detecte.\nWarning: ${warningCount}/${WARN_LIMIT}`,
                    mentions: [sender]
                }, { quoted: message });

                if (warningCount >= WARN_LIMIT) {
                    await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                    await resetWarningCount(chatId, sender, 'antispam');
                    await sock.sendMessage(chatId, {
                        text: `🚫 @${sender.split('@')[0]} a ete retire apres ${WARN_LIMIT} warnings antispam.`,
                        mentions: [sender]
                    }, { quoted: message });
                }
            }
        } catch (noticeError) {
            console.error('Erreur pendant le traitement Antispam:', noticeError.message);
        }

        return true;
    } catch (error) {
        console.error('Error in antispam detection:', error.message);
        return false;
    }
}

module.exports = {
    handleAntispamCommand,
    handleAntispamDetection
};
