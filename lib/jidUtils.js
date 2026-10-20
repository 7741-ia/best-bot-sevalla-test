// Identité de l'expéditeur : compte connecté (fromMe) et correspondance @lid <-> numéro de téléphone.
const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '..', 'data', 'lidmap.json');
let lidToPhone = null; // { "<chiffres du lid>": "<numéro>" }
let dirty = false;

function load() {
    if (lidToPhone) return lidToPhone;
    try { lidToPhone = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) || {}; } catch { lidToPhone = {}; }
    const timer = setInterval(() => {
        if (!dirty) return;
        try {
            fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
            fs.writeFileSync(MAP_FILE, JSON.stringify(lidToPhone));
            dirty = false;
        } catch { /* ignoré */ }
    }, 60000);
    if (timer.unref) timer.unref();
    return lidToPhone;
}

const digits = (jid) => String(jid || '').split(':')[0].split('@')[0];
const isLid = (jid) => String(jid || '').endsWith('@lid');
const isPhoneJid = (jid) => String(jid || '').endsWith('@s.whatsapp.net');

function remember(lid, phoneJid) {
    if (!isLid(lid) || !isPhoneJid(phoneJid)) return;
    const map = load();
    const key = digits(lid);
    const value = digits(phoneJid);
    if (key && value && map[key] !== value) { map[key] = value; dirty = true; }
}

// Apprend les correspondances fournies par WhatsApp sur chaque message reçu
function learn(message) {
    const key = message?.key || {};
    remember(key.participant, key.participantAlt);
    remember(key.remoteJid, key.remoteJidAlt);
}

// Numéro de téléphone connu pour un identifiant (ou les chiffres de l'identifiant si inconnu)
function phoneDigits(jid) {
    const d = digits(jid);
    return isLid(jid) ? (load()[d] || d) : d;
}

function botJid() {
    return global.__botJid || '';
}

// Expéditeur réel du message : le compte connecté si c'est un message envoyé depuis ce compte
function getSender(message) {
    const key = message?.key || {};
    if (key.fromMe && botJid()) return botJid();
    const raw = key.participant || key.remoteJid;
    if (isLid(raw)) {
        const alt = key.participantAlt || key.remoteJidAlt;
        if (isPhoneJid(alt)) return alt;
        const phone = load()[digits(raw)];
        if (phone) return `${phone}@s.whatsapp.net`;
    }
    return raw;
}

module.exports = { getSender, learn, phoneDigits, botJid, digits };
