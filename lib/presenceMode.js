/**
 * Modes de présence du compte connecté :
 *  - normal  : comportement WhatsApp habituel
 *  - online  : apparaît toujours "en ligne" + lit les messages privés (coches bleues)
 *  - offline : apparaît hors ligne : pas de "en ligne", pas d'écriture, pas de coches bleues
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'presenceMode.json');
const MODES = ['normal', 'online', 'offline'];
const REFRESH_MS = 20000;

let timer = null;
let cachedMode = null;

function getMode() {
    if (cachedMode) return cachedMode;
    try {
        const mode = JSON.parse(fs.readFileSync(FILE, 'utf8')).mode;
        cachedMode = MODES.includes(mode) ? mode : 'normal';
    } catch {
        cachedMode = 'normal';
    }
    return cachedMode;
}

function saveMode(mode) {
    cachedMode = mode;
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify({ mode }, null, 2));
    } catch (error) {
        console.error('[presence] save failed:', error.message);
    }
}

// Remplace sendPresenceUpdate / readMessages pour respecter le mode (une seule fois par socket).
function install(sock) {
    if (!sock || sock.__presenceModeInstalled) return;
    sock.__presenceModeInstalled = true;

    const rawPresence = sock.sendPresenceUpdate.bind(sock);
    const rawRead = sock.readMessages.bind(sock);
    sock.__rawSendPresence = rawPresence;

    sock.sendPresenceUpdate = async (type, toJid) => {
        if (getMode() === 'offline' && ['composing', 'recording', 'available'].includes(type)) return;
        return rawPresence(type, toJid);
    };
    sock.readMessages = async (keys) => {
        if (getMode() === 'offline') return;
        return rawRead(keys);
    };
}

async function applyPresence(sock) {
    const raw = sock?.__rawSendPresence;
    if (!raw) return;
    const mode = getMode();
    try {
        if (mode === 'online') await raw('available');
        else if (mode === 'offline') await raw('unavailable');
    } catch (error) {
        console.error('[presence] update failed:', error.message);
    }
}

function start(sock) {
    install(sock);
    if (timer) clearInterval(timer);
    applyPresence(sock);
    timer = setInterval(() => applyPresence(sock), REFRESH_MS);
    if (timer.unref) timer.unref();
}

// Appelé pour chaque message entrant : en mode online, on lit les messages privés (coches bleues).
async function handleIncoming(sock, message) {
    if (getMode() !== 'online') return;
    const key = message?.key;
    if (!key || key.fromMe || !String(key.remoteJid || '').endsWith('@s.whatsapp.net')) return;
    try {
        await sock.readMessages([{ remoteJid: key.remoteJid, id: key.id, participant: key.participant }]);
    } catch (error) {
        console.error('[presence] read receipt failed:', error.message);
    }
}

const DESCRIPTIONS = {
    online: '🟢 Mode *online* activé : tu apparais toujours en ligne, même si tu ne l\'es pas. Les messages privés reçus passent en lu (coches bleues).',
    offline: '⚫ Mode *offline* activé : tu apparais hors ligne, même si tu es connecté. Pas de "en ligne", pas d\'indicateur d\'écriture, pas de coches bleues.',
    normal: '⚪ Mode *normal* : retour au comportement habituel de WhatsApp.'
};

async function handleModeCommand(sock, chatId, message, mode) {
    saveMode(mode);
    install(sock);
    if (mode === 'normal') {
        try { await sock.__rawSendPresence?.('unavailable'); } catch {}
    } else {
        await applyPresence(sock);
    }
    return sock.sendMessage(chatId, { text: DESCRIPTIONS[mode] }, { quoted: message });
}

module.exports = { getMode, install, start, handleIncoming, handleModeCommand, MODES };
