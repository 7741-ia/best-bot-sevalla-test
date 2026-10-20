// commands/antistatustag.js
// Supprime auto les repartages / mentions de statut publiés dans un groupe.
// Système de warnings identique à .antilink, avec message d'avertissement généré par l'IA
// (fallback message par défaut si l'IA n'est pas disponible).
//
// Utilisation : .antistatustag on | off | set delete|warn|kick | get

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { incrementWarningCount, resetWarningCount, isSudo } = require('../lib/index');

let askAssistantPrompt = null;
try { ({ askAssistantPrompt } = require('../lib/chatAiRouter')); } catch {}

const STATE_FILE = path.join(__dirname, '..', 'data', 'antistatustag.json');
const WARN_LIMIT = config.WARN_COUNT || 3;

function readState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {};
    } catch { return {}; }
}
function writeState(s) {
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
    } catch (e) { console.error('[antistatustag] save error:', e.message); }
}
function getConf(chatId) {
    const s = readState();
    return s[chatId] || { enabled: false, action: 'warn' };
}
function setConf(chatId, patch) {
    const s = readState();
    s[chatId] = { ...(s[chatId] || { enabled: false, action: 'warn' }), ...patch, updatedAt: Date.now() };
    writeState(s);
    return s[chatId];
}
function isEnabled(chatId) { return Boolean(getConf(chatId).enabled); }

async function handleAntistatusTagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Cette commande est réservée aux groupes.' }, { quoted: message });
        return;
    }
    if (!isSenderAdmin && !message.key.fromMe) {
        await sock.sendMessage(chatId, { text: '❌ Réservé aux admins du groupe.' }, { quoted: message });
        return;
    }
    const parts = String(userMessage || '').trim().split(/\s+/);
    const action = (parts[1] || '').toLowerCase();
    const sub = (parts[2] || '').toLowerCase();

    if (!action || action === 'get' || action === 'status') {
        const c = getConf(chatId);
        const usage = [
            '```CONFIGURATION ANTISTATUSTAG',
            '',
            `Status : ${c.enabled ? 'ON' : 'OFF'}`,
            `Action : ${c.action || 'warn'}`,
            '',
            '.antistatustag on',
            '.antistatustag off',
            '.antistatustag set delete | warn | kick',
            '.antistatustag get',
            '```'
        ].join('\n');
        await sock.sendMessage(chatId, { text: usage }, { quoted: message });
        return;
    }
    if (action === 'on') {
        setConf(chatId, { enabled: true });
        await sock.sendMessage(chatId, { text: '✅ *AntiStatusTag activé*.' }, { quoted: message });
        return;
    }
    if (action === 'off') {
        setConf(chatId, { enabled: false });
        await sock.sendMessage(chatId, { text: '✅ *AntiStatusTag désactivé*.' }, { quoted: message });
        return;
    }
    if (action === 'set') {
        if (!['delete', 'warn', 'kick'].includes(sub)) {
            await sock.sendMessage(chatId, { text: 'Action invalide. Choisis delete, warn ou kick.' }, { quoted: message });
            return;
        }
        setConf(chatId, { action: sub });
        await sock.sendMessage(chatId, { text: `✅ Action AntiStatusTag définie sur *${sub}*.` }, { quoted: message });
        return;
    }
    await sock.sendMessage(chatId, { text: 'Utilisation : .antistatustag on | off | set delete|warn|kick | get' }, { quoted: message });
}

// Déballe les enveloppes Baileys (ephemeral, viewOnce, documentWithCaption, etc.)
function unwrap(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return node;
    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage',
        'editedMessage',
        'futureproofMessage',
        'deviceSentMessage'
    ];
    for (const w of wrappers) {
        if (node[w]?.message) return unwrap(node[w].message, depth + 1);
    }
    return node;
}

const STATUS_KEYS = [
    'groupStatusMentionMessage',
    'statusMentionMessage',
    'groupStatusMessage',
    'statusMessage',
    'statusAttributionMessage',
    'groupStatusMentionMessageV2'
];

function hasStatusKey(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return false;
    for (const key of Object.keys(node)) {
        if (STATUS_KEYS.includes(key) && node[key]) return true;
        const value = node[key];
        if (value && typeof value === 'object' && hasStatusKey(value, depth + 1)) return true;
    }
    return false;
}

function hasStatusContext(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return false;
    const ctx = node.contextInfo;
    if (ctx) {
        if (ctx.remoteJid === 'status@broadcast') return true;
        if (ctx.quotedMessage && ctx.remoteJid === 'status@broadcast') return true;
        if (ctx.forwardedNewsletterMessageInfo?.newsletterJid === 'status@broadcast') return true;
        // Repartage d'un statut : WhatsApp marque le message comme "status mention"
        if (ctx.statusAttributionType || ctx.isStatusMention || ctx.groupMentions?.length && ctx.remoteJid === 'status@broadcast') return true;
    }
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (value && typeof value === 'object' && hasStatusContext(value, depth + 1)) return true;
    }
    return false;
}

function collectText(node, depth = 0, out = []) {
    if (!node || typeof node !== 'object' || depth > 6) return out;
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === 'string' && ['conversation', 'text', 'caption', 'title', 'description'].includes(key)) {
            out.push(value);
        } else if (value && typeof value === 'object') {
            collectText(value, depth + 1, out);
        }
    }
    return out;
}

function looksLikeStatusShare(message) {
    const root = unwrap(message?.message || {});
    if (!root || typeof root !== 'object') return false;

    if (hasStatusKey(root)) return true;
    if (hasStatusContext(root)) return true;

    const text = collectText(root).join(' ');
    if (/status@broadcast/i.test(text)) return true;
    if (/wa\.me\/status\//i.test(text)) return true;
    return false;
}

function defaultWarnMessage(mention, count) {
    return `⚠️ @${mention} partage de statut détecté.\nWarning: ${count}/${WARN_LIMIT}`;
}
function defaultDeleteMessage(mention) {
    return `⚠️ @${mention} les partages/mentions de statut ne sont pas autorisés ici.`;
}
function defaultKickMessage(mention) {
    return `🚫 @${mention} a été retiré pour partage de statut.`;
}
function defaultKickAfterWarnMessage(mention) {
    return `🚫 @${mention} a été retiré après ${WARN_LIMIT} warnings AntiStatusTag.`;
}

async function aiMessage(kind, { mention, count }) {
    if (!askAssistantPrompt) return null;
    try {
        let intent = '';
        if (kind === 'warn') {
            intent = `Un membre vient de partager/mentionner un statut WhatsApp dans le groupe alors que c'est interdit. Écris UN SEUL court message d'avertissement en français (1 à 2 phrases, ton ferme mais poli, avec un emoji ⚠️ au début). Mentionne l'utilisateur par "@${mention}" tel quel. Termine EXACTEMENT par la ligne "Warning: ${count}/${WARN_LIMIT}". Pas de guillemets, pas de préambule.`;
        } else if (kind === 'delete') {
            intent = `Un membre vient de partager/mentionner un statut WhatsApp dans le groupe alors que c'est interdit. Écris UN SEUL court message en français (1 phrase, ton ferme mais poli, emoji ⚠️ au début) pour lui rappeler la règle. Mentionne-le par "@${mention}" tel quel. Pas de guillemets, pas de préambule.`;
        } else if (kind === 'kick') {
            intent = `Annonce en français (1 phrase, emoji 🚫 au début) qu'un membre "@${mention}" vient d'être retiré du groupe pour avoir partagé un statut. Pas de guillemets, pas de préambule.`;
        } else if (kind === 'kickAfterWarn') {
            intent = `Annonce en français (1 phrase, emoji 🚫 au début) qu'un membre "@${mention}" a été retiré du groupe après ${WARN_LIMIT} avertissements pour partages de statut. Pas de guillemets, pas de préambule.`;
        }
        const out = await Promise.race([
            askAssistantPrompt(intent, { maxTokens: 120 }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('ai_timeout')), 6000))
        ]);
        const t = String(out || '').trim();
        if (!t) return null;
        if (!t.includes(`@${mention}`)) return null;
        if (kind === 'warn' && !/Warning:\s*\d+\s*\/\s*\d+/i.test(t)) {
            return `${t}\nWarning: ${count}/${WARN_LIMIT}`;
        }
        return t;
    } catch (e) {
        console.error('[antistatustag] AI warn failed:', e.message);
        return null;
    }
}

async function handleAntistatusTagDetection(sock, chatId, message, senderId) {
    try {
        if (!chatId.endsWith('@g.us')) return false;
        if (message.key.fromMe) return false;
        const conf = getConf(chatId);
        if (!conf.enabled) return false;
        if (!looksLikeStatusShare(message)) return false;
        console.log('[antistatustag] partage de statut détecté dans', chatId);

        const sender = senderId || require('../lib/jidUtils').getSender(message);
        if (!sender) return false;

        try {
            const md = await sock.groupMetadata(chatId);
            const isAdmin = md.participants?.some(p => (p.id === sender) && (p.admin === 'admin' || p.admin === 'superadmin'));
            if (isAdmin) return false;
        } catch {}
        try { if (await isSudo(sender)) return false; } catch {}

        try {
            await sock.sendMessage(chatId, {
                delete: {
                    remoteJid: chatId,
                    fromMe: false,
                    id: message.key.id,
                    participant: message.key.participant || sender
                }
            });
        } catch (e) {
            console.error('[antistatustag] delete failed (le bot doit être admin):', e.message);
        }

        const mention = (sender || '').split('@')[0];
        const action = (conf.action || 'warn').toLowerCase();

        try {
            if (action === 'kick') {
                const txt = (await aiMessage('kick', { mention })) || defaultKickMessage(mention);
                try { await sock.groupParticipantsUpdate(chatId, [sender], 'remove'); } catch {}
                await sock.sendMessage(chatId, { text: txt, mentions: [sender] });
            } else if (action === 'warn') {
                const count = await incrementWarningCount(chatId, sender, 'antistatustag');
                const txt = (await aiMessage('warn', { mention, count })) || defaultWarnMessage(mention, count);
                await sock.sendMessage(chatId, { text: txt, mentions: [sender] });
                if (count >= WARN_LIMIT) {
                    try { await sock.groupParticipantsUpdate(chatId, [sender], 'remove'); } catch {}
                    await resetWarningCount(chatId, sender, 'antistatustag');
                    const kickTxt = (await aiMessage('kickAfterWarn', { mention })) || defaultKickAfterWarnMessage(mention);
                    await sock.sendMessage(chatId, { text: kickTxt, mentions: [sender] });
                }
            } else {
                const txt = (await aiMessage('delete', { mention })) || defaultDeleteMessage(mention);
                await sock.sendMessage(chatId, { text: txt, mentions: [sender] });
            }
        } catch (e) {
            console.error('[antistatustag] notice error:', e.message);
        }

        return true;
    } catch (e) {
        console.error('[antistatustag] detection error:', e.message);
        return false;
    }
}

module.exports = {
    handleAntistatusTagCommand,
    handleAntistatusTagDetection,
    isAntistatusTagEnabled: isEnabled,
};
