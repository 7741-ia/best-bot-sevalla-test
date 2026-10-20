/**
 * .resetchats : supprime TOUTES les discussions WhatsApp du compte connecté (sauf ta conversation personnelle "Moi") pour libérer de l'espace.
 *   .resetchats        -> demande confirmation
 *   .resetchats oui    -> supprime les discussions (et leurs médias)
 *   .resetchats vider  -> vide le contenu mais garde les discussions (puis "oui" pour confirmer)
 * Le bot ne peut supprimer que les discussions qu'il connaît (récentes + groupes).
 */
const crypto = require('crypto');
const isOwnerOrSudo = require('../lib/isOwner');
const store = require('../lib/lightweight_store');

const pending = new Map(); // chatId -> { mode, at }
let running = false;
const CONFIRM_WINDOW = 2 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (jid) => String(jid || '').replace(/:\d+@/, '@');

async function collectChats(sock) {
    const ids = new Set([...Object.keys(store.chats || {}), ...Object.keys(store.messages || {}), ...Object.keys(store.contacts || {})]);
    try {
        const groups = await sock.groupFetchAllParticipating();
        Object.keys(groups || {}).forEach((id) => ids.add(id));
    } catch (error) {
        console.error('[resetchats] groupFetchAllParticipating:', error.message);
    }
    return [...ids].map(normalize).filter((id) =>
        /@(s\.whatsapp\.net|lid|g\.us)$/.test(id) && id !== 'status@broadcast');
}

function lastMessagesFor(jid) {
    const last = (store.messages?.[jid] || []).slice(-1)[0];
    if (last?.key) {
        return [{ key: last.key, messageTimestamp: Number(last.messageTimestamp) || Math.floor(Date.now() / 1000) }];
    }
    // Aucune trace locale : on couvre tout jusqu'à maintenant
    return [{ key: { remoteJid: jid, fromMe: true, id: crypto.randomBytes(8).toString('hex').toUpperCase() }, messageTimestamp: Math.floor(Date.now() / 1000) }];
}

async function resetChatsCommand(sock, chatId, message) {
    const senderId = require('../lib/jidUtils').getSender(message);
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
        await sock.sendMessage(chatId, { text: '❌ Cette commande est réservée au propriétaire.' }, { quoted: message });
        return;
    }
    if (running) {
        await sock.sendMessage(chatId, { text: '⏳ Une suppression est déjà en cours. Patiente la fin du rapport.' }, { quoted: message });
        return;
    }

    const raw = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
    const words = raw.toLowerCase().split(/\s+/).slice(1);
    const waiting = pending.get(chatId);
    const valid = Boolean(waiting && Date.now() - waiting.at <= CONFIRM_WINDOW);
    const said = words.some((w) => ['oui', 'confirm', 'confirmer', 'yes'].includes(w));
    const mode = words.includes('vider') ? 'clear' : (valid ? waiting.mode : 'delete');
    const noConfirm = process.env.RESETCHATS_NO_CONFIRM === '1';

    if (!noConfirm && !(said && valid)) {
        pending.set(chatId, { mode, at: Date.now() });
        await sock.sendMessage(chatId, {
            text: [
                mode === 'clear' ? '🧹 *Vider toutes les discussions ?*' : '🗑️ *Supprimer TOUTES les discussions ?*',
                '',
                'Cette action est *irréversible* : messages et médias seront effacés du téléphone pour libérer de l’espace.',
                'Toutes les discussions et groupes seront supprimés, *sauf ta conversation personnelle* (« Moi ») où arrivera le rapport.',
                '',
                `Pour confirmer (dans les 2 minutes) : *.resetchats ${mode === 'clear' ? 'vider ' : ''}oui*`,
            ].join('\n'),
        }, { quoted: message });
        return;
    }

    pending.delete(chatId);
    running = true;
    try {
        const botPhone = normalize(sock.user?.id || '');
        const botLid = normalize(sock.user?.lid || '');
        const isPersonal = (jid) => jid === botPhone || (botLid && jid === botLid);
        const reportTo = botPhone || chatId; // le rapport arrive dans ta conversation personnelle

        const all = [...new Set([...(await collectChats(sock)), normalize(chatId)])].filter((id) => !isPersonal(id));
        // La discussion où tu as tapé la commande est supprimée en dernier (après le rapport)
        const current = isPersonal(normalize(chatId)) ? null : normalize(chatId);
        const targets = all.filter((id) => id !== current);

        if (!targets.length && !current) {
            await sock.sendMessage(reportTo, { text: 'ℹ️ Aucune autre discussion connue du bot à supprimer.' });
            return;
        }
        await sock.sendMessage(reportTo, { text: `⏳ ${mode === 'clear' ? 'Nettoyage' : 'Suppression'} de ${targets.length + (current ? 1 : 0)} discussions en cours… (environ ${Math.max(1, Math.ceil(targets.length * 0.4 / 60))} min)` });

        const run = async (jid) => {
            await sock.chatModify(mode === 'clear'
                ? { clear: true, lastMessages: lastMessagesFor(jid) }
                : { delete: true, lastMessages: lastMessagesFor(jid) }, jid);
            delete store.messages?.[jid]; // libère aussi la mémoire du bot
        };

        let ok = 0;
        let failed = 0;
        for (const jid of targets) {
            try { await run(jid); ok += 1; } catch (error) { failed += 1; console.error('[resetchats]', jid, error.message); }
            await sleep(350);
        }
        store.dirty = true;

        await sock.sendMessage(reportTo, {
            text: [
                `✅ *Terminé !* ${ok + (current ? 1 : 0)} discussion(s) ${mode === 'clear' ? 'vidée(s)' : 'supprimée(s)'} 🙌`,
                failed ? `⚠️ ${failed} échec(s).` : '',
                'Il ne reste que ta conversation personnelle.',
                'ℹ️ Le bot ne peut supprimer que les discussions qu’il connaît (récentes, contacts et groupes). Relance la commande si une ancienne discussion apparaît encore.',
            ].filter(Boolean).join('\n'),
        });

        if (current) {
            try { await run(current); } catch (error) { console.error('[resetchats] discussion courante:', error.message); }
        }
    } catch (error) {
        console.error('[resetchats] error:', error);
        try { await sock.sendMessage(normalize(sock.user?.id || '') || chatId, { text: '❌ Une erreur est survenue pendant la suppression.' }); } catch (_) { /* ignoré */ }
    } finally {
        running = false;
    }
}

module.exports = resetChatsCommand;
