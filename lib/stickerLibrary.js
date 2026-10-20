'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { unwrapMessageContent } = require('./waMessage');
const { getStorageDirectory } = require('./assistantMemory');

const MAX_STICKER_BYTES = 1024 * 1024;
const CATEGORIES = Object.freeze(['joie', 'rire', 'salutations', 'approbation', 'surprise', 'confusion', 'encouragement', 'empathie', 'taquinerie', 'celebration']);
const DEFAULT_CONFIG = Object.freeze({ enabled: false, cooldownMinutes: 15, dailyMax: 4, lastSentAt: 0, dailyDate: '', dailyCount: 0 });

function getLibraryDir() {
    const dir = path.join(getStorageDirectory(), 'sticker-library');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch {}
    return dir;
}

function normalizeCategory(value) {
    const category = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    if (category === 'joie') return 'joie';
    if (category === 'rire' || category === 'humour') return 'rire';
    if (['salutation', 'salutations', 'bonjour'].includes(category)) return 'salutations';
    if (['approbation', 'accord', 'validation'].includes(category)) return 'approbation';
    if (category === 'surprise') return 'surprise';
    if (category === 'confusion') return 'confusion';
    if (category === 'encouragement' || category === 'motivation') return 'encouragement';
    if (['empathie', 'tristesse'].includes(category)) return 'empathie';
    if (category === 'taquinerie' || category === 'taquin') return 'taquinerie';
    if (['celebration', 'fete', 'felicitation'].includes(category)) return 'celebration';
    return null;
}

function atomicWrite(file, content) {
    const temp = `${file}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
    try {
        fs.writeFileSync(temp, content, { mode: 0o600, flag: 'wx' });
        fs.renameSync(temp, file);
        try { fs.chmodSync(file, 0o600); } catch {}
    } finally { try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {} }
}

function readJson(name, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(getLibraryDir(), name), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') console.error('[stickerLibrary] fichier illisible:', error.message); return structuredClone(fallback); }
}

function writeJson(name, value) {
    atomicWrite(path.join(getLibraryDir(), name), JSON.stringify(value, null, 2));
}

function getConfig() {
    const config = readJson('config.json', DEFAULT_CONFIG);
    return {
        enabled: Boolean(config.enabled),
        cooldownMinutes: Math.min(1440, Math.max(1, Number(config.cooldownMinutes) || DEFAULT_CONFIG.cooldownMinutes)),
        dailyMax: Math.min(50, Math.max(1, Number(config.dailyMax) || DEFAULT_CONFIG.dailyMax)),
        lastSentAt: Math.max(0, Number(config.lastSentAt) || 0),
        dailyDate: /^\d{4}-\d{2}-\d{2}$/.test(String(config.dailyDate || '')) ? config.dailyDate : '',
        dailyCount: Math.max(0, Number(config.dailyCount) || 0)
    };
}

function configure(changes = {}) {
    const current = getConfig();
    if (typeof changes.enabled === 'boolean') current.enabled = changes.enabled;
    if (changes.cooldownMinutes !== undefined) current.cooldownMinutes = Math.min(1440, Math.max(1, Number(changes.cooldownMinutes) || DEFAULT_CONFIG.cooldownMinutes));
    if (changes.dailyMax !== undefined) current.dailyMax = Math.min(50, Math.max(1, Number(changes.dailyMax) || DEFAULT_CONFIG.dailyMax));
    if (changes.lastSentAt !== undefined) current.lastSentAt = Math.max(0, Number(changes.lastSentAt) || 0);
    if (changes.dailyDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(changes.dailyDate))) current.dailyDate = changes.dailyDate;
    if (changes.dailyCount !== undefined) current.dailyCount = Math.max(0, Math.min(50, Number(changes.dailyCount) || 0));
    writeJson('config.json', current);
    return current;
}

function loadCatalog() {
    const catalog = readJson('catalog.json', { items: [] });
    const items = Array.isArray(catalog.items) ? catalog.items.filter(item =>
        item && /^[a-f0-9]{12}$/.test(String(item.id)) && CATEGORIES.includes(item.category)
    ).slice(-500) : [];
    return { items };
}

function getCatalogStatus() {
    const counts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
    for (const item of loadCatalog().items) counts[item.category] += 1;
    return { counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), config: getConfig() };
}

function messageContext(message) {
    const body = unwrapMessageContent(message?.message || {});
    return body.extendedTextMessage?.contextInfo || body.imageMessage?.contextInfo || body.videoMessage?.contextInfo || body.documentMessage?.contextInfo || {};
}

async function importQuotedSticker(message, categoryValue) {
    const category = normalizeCategory(categoryValue);
    if (!category) throw new TypeError(`Catégorie invalide. Choisis : ${CATEGORIES.join(', ')}.`);
    const context = messageContext(message);
    const quoted = context.quotedMessage ? unwrapMessageContent(context.quotedMessage) : null;
    const body = unwrapMessageContent(message?.message || {});
    const node = quoted?.stickerMessage || body.stickerMessage;
    if (!node) throw new TypeError('Réponds à un sticker WhatsApp avec cette commande pour l’importer.');
    const declaredSize = Number(node.fileLength?.toString?.() || node.fileLength);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_STICKER_BYTES) throw new TypeError('Le sticker dépasse la limite de 1 Mo.');

    const stream = await downloadContentFromMessage(node, 'sticker');
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        total += chunk.length;
        if (total > MAX_STICKER_BYTES) throw new TypeError('Le sticker dépasse la limite de 1 Mo.');
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length < 16 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new TypeError('Le média reçu n’est pas un WebP valide.');
    }

    const id = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const relativePath = path.join(category, `${id}.webp`);
    const catalog = loadCatalog();
    const existing = catalog.items.find(item => item.id === id);
    if (existing) return { id, category: existing.category };
    if (catalog.items.length >= 500) throw new TypeError('La bibliothèque est limitée à 500 stickers; retire-en un avant d’en importer un autre.');
    const fullPath = path.join(getLibraryDir(), relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(fullPath)) atomicWrite(fullPath, buffer);
    catalog.items.push({ id, category, path: relativePath, addedAt: new Date().toISOString() });
    writeJson('catalog.json', catalog);
    return { id, category };
}

function removeSticker(id) {
    const wanted = String(id || '').toLowerCase();
    if (!/^[a-f0-9]{12}$/.test(wanted)) return false;
    const catalog = loadCatalog();
    const item = catalog.items.find(sticker => sticker.id === wanted);
    if (!item) return false;
    const file = path.join(getLibraryDir(), item.path);
    if (!file.startsWith(`${getLibraryDir()}${path.sep}`)) return false;
    try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    catalog.items = catalog.items.filter(sticker => sticker.id !== wanted);
    writeJson('catalog.json', catalog);
    return true;
}

function suggestCategory(text, recentChat = '') {
    const corpus = `${String(text || '').slice(0, 1000)} ${String(recentChat || '').slice(-700)}`.toLocaleLowerCase('fr');
    if (/\b(décès|deces|condoléance|condoleance|suicide|urgence|violence|agression|maladie grave|hospitalis|opération chirurgicale|accident grave|je souffre)\b/.test(corpus)) return null;
    const rules = [
        ['rire', /\b(rire|drôle|drole|mdr|haha|hilarant|blague|amusant|😂|🤣|ptdr)\b/],
        ['salutations', /\b(bonjour|salut|coucou|bonsoir|hello|bienvenue)\b/],
        ['celebration', /\b(bravo|félicitations|felicitations|réussi|reussi|diplôme|diplome|anniversaire|célébr|celebr)\b/],
        ['empathie', /\b(triste|désolé|desole|courage|deuil|peine|difficile|pleure|malade)\b/],
        ['surprise', /\b(incroyable|surpris|surprise|wow|vraiment\?|sérieux\?|serieux\?)\b/],
        ['approbation', /\b(exact|d'accord|dac|validé|valide|parfait|super|approuvé|approuve|oui)\b/],
        ['encouragement', /\b(vas-y|continue|tu peux|courage|bonne chance|réussite|reussite|n'abandonne)\b/],
        ['confusion', /\b(comprends pas|confus|confuse|hein\?|bizarre|je ne comprends)\b/],
        ['taquinerie', /\b(taquine|taquiner|petit malin|blagueur|tu abuses)\b/],
        ['joie', /\b(content|heureux|heureuse|joie|super nouvelle|trop bien)\b/]
    ];
    for (const [category, pattern] of rules) if (pattern.test(corpus)) return category;
    return null;
}

async function sendSuggestedSticker(sock, chatId, categoryValue) {
    const config = getConfig();
    if (!config.enabled) return false;
    const category = normalizeCategory(categoryValue);
    if (!category) return false;
    const catalog = loadCatalog();
    const choices = catalog.items.filter(item => item.category === category);
    if (!choices.length) return false;
    const now = Date.now();
    if (now - config.lastSentAt < config.cooldownMinutes * 60 * 1000) return false;
    const day = new Date(now).toISOString().slice(0, 10);
    const count = config.dailyDate === day ? config.dailyCount : 0;
    if (count >= config.dailyMax) return false;
    const selected = choices[crypto.randomInt(0, choices.length)];
    const fullPath = path.join(getLibraryDir(), selected.path);
    if (!fullPath.startsWith(`${getLibraryDir()}${path.sep}`) || !fs.existsSync(fullPath)) return false;
    const buffer = fs.readFileSync(fullPath);
    if (buffer.length > MAX_STICKER_BYTES || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return false;
    try {
        await sock.sendMessage(chatId, { sticker: buffer });
        configure({ lastSentAt: now, dailyDate: day, dailyCount: count + 1 });
        return true;
    } catch (error) {
        console.error('[stickerLibrary] envoi impossible:', error.message);
        return false;
    }
}

module.exports = {
    CATEGORIES,
    MAX_STICKER_BYTES,
    normalizeCategory,
    getConfig,
    configure,
    loadCatalog,
    getCatalogStatus,
    importQuotedSticker,
    removeSticker,
    suggestCategory,
    sendSuggestedSticker
};
