// Mémorise les contacts dont tu vois les statuts (= ceux qui ont ton numéro et dont tu as le leur).
// Alimenté à chaque statut reçu ; persisté dans data/statusContacts.json.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'statusContacts.json');
let contacts = null; // { jid: { name, at } }
let dirty = false;
let timer = null;

function load() {
    if (contacts) return contacts;
    try { contacts = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { contacts = {}; }
    if (!timer) {
        timer = setInterval(flush, 120000);
        if (timer.unref) timer.unref();
    }
    return contacts;
}

function flush() {
    if (!dirty || !contacts) return;
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE + '.tmp', JSON.stringify(contacts));
        fs.renameSync(FILE + '.tmp', FILE);
        dirty = false;
    } catch (error) {
        console.error('[statusContacts] save failed:', error.message);
    }
}

function normalize(jid) {
    return String(jid || '').replace(/:\d+@/, '@');
}

// Préfère le numéro de téléphone (@s.whatsapp.net) à l'identifiant @lid
function record(participant, participantAlt, name) {
    const jid = normalize([participantAlt, participant].find((j) => String(j || '').endsWith('@s.whatsapp.net')) || participant);
    if (!jid || jid === 'status@broadcast' || !/@(s\.whatsapp\.net|lid)$/.test(jid)) return;
    const all = load();
    const previous = all[jid];
    all[jid] = { name: name || previous?.name || '', at: Date.now() };
    dirty = true;
}

// Liste : contacts mémorisés + auteurs des statuts encore présents dans le store
function list(store) {
    const all = { ...load() };
    for (const msg of store?.messages?.['status@broadcast'] || []) {
        if (msg?.key?.fromMe) continue;
        const jid = normalize([msg.key.participantAlt, msg.key.participant].find((j) => String(j || '').endsWith('@s.whatsapp.net')) || msg.key.participant);
        if (jid && /@(s\.whatsapp\.net|lid)$/.test(jid) && !all[jid]) all[jid] = { name: msg.pushName || '', at: Date.now() };
    }
    return Object.keys(all);
}

module.exports = { record, list, flush };
