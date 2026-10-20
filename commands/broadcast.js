/**
 * .broadcast : envoie un message à tes contacts (ceux dont tu vois les statuts = ils ont ton numéro).
 *   .broadcast <message>            -> prépare l'envoi (aperçu + nombre de destinataires)
 *   .broadcast contacts <message>   -> cible tous les contacts enregistrés connus du bot
 *   .broadcast oui                  -> lance l'envoi (lent, par petits lots)
 *   .broadcast count                -> nombre de destinataires possibles
 *   .broadcast stop                 -> arrête l'envoi en cours
 * Envois espacés de quelques secondes pour limiter le risque de blocage par WhatsApp.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const isOwnerOrSudo = require('../lib/isOwner');
const store = require('../lib/lightweight_store');
const statusContacts = require('../lib/statusContacts');

const SENT_FILE = path.join(__dirname, '..', 'data', 'broadcastSent.json');
const MAX_PER_RUN = Number(process.env.BROADCAST_MAX) || 100;
const DELAY_MIN = Number(process.env.BROADCAST_DELAY_MIN) || 6000;
const DELAY_MAX = Number(process.env.BROADCAST_DELAY_MAX) || 14000;
const CONFIRM_WINDOW = 5 * 60 * 1000;

const pending = new Map(); // chatId -> { text, audience, at }
let running = null; // { stop: boolean }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (jid) => String(jid || '').replace(/:\d+@/, '@');
const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

function readSent() {
    try { return JSON.parse(fs.readFileSync(SENT_FILE, 'utf8')) || {}; } catch { return {}; }
}
function writeSent(data) {
    try {
        fs.mkdirSync(path.dirname(SENT_FILE), { recursive: true });
        fs.writeFileSync(SENT_FILE, JSON.stringify(data));
    } catch (error) {
        console.error('[broadcast] save failed:', error.message);
    }
}

function audience(kind, selfJid) {
    let ids;
    if (kind === 'contacts') {
        ids = Object.values(store.contacts || {}).filter((c) => c.saved || c.name).map((c) => c.id);
    } else {
        ids = statusContacts.list(store);
    }
    const unique = new Set(ids.map(normalize).filter((id) => /@(s\.whatsapp\.net|lid)$/.test(id) && id !== selfJid));
    return [...unique];
}

async function runBroadcast(sock, chatId, text, targets, hash) {
    running = { stop: false };
    const sentDb = readSent();
    sentDb[hash] = sentDb[hash] || [];
    let ok = 0;
    let failed = 0;
    try {
        for (const [index, jid] of targets.entries()) {
            if (running.stop) break;
            try {
                await sock.sendMessage(jid, { text });
                sentDb[hash].push(jid);
                ok += 1;
            } catch (error) {
                failed += 1;
                console.error('[broadcast]', jid, error.message);
            }
            if ((index + 1) % 10 === 0) {
                writeSent(sentDb);
                await sock.sendMessage(chatId, { text: `📤 Progression : ${index + 1}/${targets.length} (✅ ${ok}${failed ? ` · ⚠️ ${failed}` : ''})` });
            }
            await sleep(DELAY_MIN + Math.random() * Math.max(0, DELAY_MAX - DELAY_MIN));
        }
        writeSent(sentDb);
        const stopped = running.stop;
        await sock.sendMessage(chatId, {
            text: [
                stopped ? '⏹️ *Envoi arrêté.*' : '✅ *Envoi terminé !* 🙌',
                `Messages envoyés : ${ok}`,
                failed ? `Échecs : ${failed}` : '',
                'Relance la même commande pour envoyer au lot suivant (les contacts déjà servis sont ignorés).',
            ].filter(Boolean).join('\n'),
        });
    } finally {
        running = null;
    }
}

async function broadcastCommand(sock, chatId, message) {
    const senderId = require('../lib/jidUtils').getSender(message);
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
        await sock.sendMessage(chatId, { text: '❌ Cette commande est réservée au propriétaire.' }, { quoted: message });
        return;
    }

    const raw = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
    const body = raw.replace(/^\.broadcast\s*/i, '');
    const [first = '', ...rest] = body.split(/\s+/);
    const keyword = first.toLowerCase();
    const selfJid = normalize(sock.user?.id || '');
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

    if (!body) {
        return reply([
            '📢 *Message à tous mes contacts*',
            '',
            '• *.broadcast <message>* : contacts dont tu vois les statuts',
            '• *.broadcast contacts <message>* : tous les contacts enregistrés connus du bot',
            '• *.broadcast count* : nombre de destinataires',
            '• *.broadcast oui* : confirmer et lancer',
            '• *.broadcast stop* : arrêter',
        ].join('\n'));
    }

    if (keyword === 'stop') {
        if (!running) return reply('ℹ️ Aucun envoi en cours.');
        running.stop = true;
        return reply('⏹️ Arrêt demandé, le rapport arrive dans un instant.');
    }

    if (keyword === 'count') {
        const status = audience('status', selfJid).length;
        const contacts = audience('contacts', selfJid).length;
        return reply(`👥 Destinataires possibles :\n• Contacts dont tu vois les statuts : *${status}*\n• Contacts enregistrés connus du bot : *${contacts}*\n\nLe bot enregistre les contacts au fur et à mesure que tu reçois leurs statuts.`);
    }

    if (['oui', 'confirm', 'confirmer', 'yes'].includes(keyword)) {
        const job = pending.get(chatId);
        if (!job || Date.now() - job.at > CONFIRM_WINDOW) return reply('ℹ️ Rien à confirmer. Écris d’abord *.broadcast <message>*.');
        if (running) return reply('⏳ Un envoi est déjà en cours.');
        pending.delete(chatId);
        const hash = hashOf(`${job.audience}:${job.text}`);
        const already = new Set(readSent()[hash] || []);
        const targets = audience(job.audience, selfJid).filter((jid) => !already.has(jid)).slice(0, MAX_PER_RUN);
        if (!targets.length) return reply('✅ Tous les destinataires ont déjà reçu ce message.');
        await reply(`🚀 Envoi lancé vers *${targets.length}* contact(s), un message toutes les ${Math.round(DELAY_MIN / 1000)}-${Math.round(DELAY_MAX / 1000)} s. Tu peux arrêter avec *.broadcast stop*.`);
        runBroadcast(sock, chatId, job.text, targets, hash).catch((error) => console.error('[broadcast] error:', error));
        return;
    }

    const kind = keyword === 'contacts' ? 'contacts' : 'status';
    const text = (kind === 'contacts' ? rest.join(' ') : body).trim();
    if (!text) return reply('❌ Écris le message à envoyer. Exemple : *.broadcast Salut, voici mon nouveau numéro !*');

    const recipients = audience(kind, selfJid);
    if (!recipients.length) {
        return reply(kind === 'status'
            ? '❌ Aucun contact détecté pour l’instant : le bot les enregistre quand tu reçois leurs statuts. Réessaie plus tard ou utilise *.broadcast contacts <message>*.'
            : '❌ Aucun contact enregistré connu du bot pour l’instant.');
    }
    pending.set(chatId, { text, audience: kind, at: Date.now() });
    const batch = Math.min(recipients.length, MAX_PER_RUN);
    return reply([
        '📢 *Aperçu de l’envoi*',
        '',
        text,
        '',
        `👥 Destinataires : *${recipients.length}* (lot de ${batch} par envoi)`,
        `⏱️ Durée estimée : ~${Math.ceil(batch * ((DELAY_MIN + DELAY_MAX) / 2000) / 60)} min`,
        '⚠️ Les envois en masse peuvent entraîner un blocage par WhatsApp : le bot envoie lentement pour limiter le risque.',
        '',
        'Pour lancer : *.broadcast oui*',
    ].join('\n'));
}

module.exports = broadcastCommand;
