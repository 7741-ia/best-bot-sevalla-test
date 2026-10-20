const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/userGroupData.json');
const TICK_MS = 60 * 1000;
const activity = new Map();
const runtime = new Map();
let activeSock = null;
let timer = null;

const DEFAULT_GAMES = ['quiz', 'devinette', 'enigme', 'vrai ou faux', 'culture générale', 'débat léger'];

function readData() {
    try {
        if (!fs.existsSync(DATA_PATH)) return {};
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (error) {
        console.error('[groupAmbience] lecture configuration:', error.message);
        return {};
    }
}

function writeData(data) {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('[groupAmbience] sauvegarde configuration:', error.message);
    }
}

function normalizeAmbience(raw = {}) {
    const games = Array.isArray(raw.games)
        ? raw.games.map((game) => String(game).trim()).filter(Boolean).slice(0, 20)
        : DEFAULT_GAMES;
    return {
        enabled: Boolean(raw.enabled),
        idleMinutes: clampNumber(raw.idleMinutes, 30, 1, 1440),
        cooldownMinutes: clampNumber(raw.cooldownMinutes, 360, 1, 10080),
        maxDaily: clampNumber(raw.maxDaily, 2, 1, 20),
        games: games.length ? games : DEFAULT_GAMES,
        humor: ['low', 'medium', 'high'].includes(raw.humor) ? raw.humor : 'medium',
        lastAnimationAt: Number(raw.lastAnimationAt) || 0,
        dailyCount: Number(raw.dailyCount) || 0,
        dailyDate: String(raw.dailyDate || '')
    };
}

function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function touchGroupActivity(groupId) {
    if (!groupId || !String(groupId).endsWith('@g.us')) return;
    const state = runtime.get(groupId) || {};
    state.pending = false;
    runtime.set(groupId, state);
    activity.set(groupId, Date.now());
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function chooseAnimation(ambience) {
    const game = ambience.games[Math.floor(Math.random() * ambience.games.length)] || 'quiz';
    const humor = ambience.humor;
    const openers = humor === 'high'
        ? ['Le groupe dort plus fort que mon Wi-Fi 😂', 'Réveil général, sans tricher 😄', 'Qui ose relever le défi ? 😎']
        : humor === 'low'
            ? ['Petite animation du jour :', 'Question du jour :', 'Un petit défi pour le groupe :']
            : ['Le groupe est calme aujourd’hui 😄', 'Petit jeu pour réveiller un peu le groupe :', 'Question du jour, qui pense pouvoir répondre ? 🤔'];
    const opener = openers[Math.floor(Math.random() * openers.length)];
    const prompts = {
        quiz: 'Quel langage de programmation préférez-vous, et pourquoi ?',
        devinette: 'Je suis partout sur WhatsApp mais je ne parle jamais. Qui suis-je ?',
        enigme: 'Énigme rapide : qu’est-ce qui monte mais ne redescend jamais ?',
        'vrai ou faux': 'Vrai ou faux : la lumière du Soleil met environ 8 minutes à nous parvenir ?',
        'culture générale': 'Question culture générale : quel est le plus grand océan du monde ?',
        'débat léger': 'Petit débat : matin ou soir, quel est le meilleur moment pour être productif ?'
    };
    const prompt = prompts[game.toLowerCase()] || `Mini-jeu (${game}) : proposez votre réponse au groupe.`;
    return `${opener}\n${prompt}`;
}

async function tick() {
    if (!activeSock?.user) return;
    const data = readData();
    const groups = data.chatbot && typeof data.chatbot === 'object' ? data.chatbot : {};
    const now = Date.now();

    for (const [groupId, rawConfig] of Object.entries(groups)) {
        if (!groupId.endsWith('@g.us') || !rawConfig || typeof rawConfig !== 'object') continue;
        const ambience = normalizeAmbience(rawConfig.ambience);
        if (!ambience.enabled) continue;

        const lastActivity = activity.get(groupId);
        if (!lastActivity || now - lastActivity < ambience.idleMinutes * 60 * 1000) continue;
        if (ambience.lastAnimationAt && now - ambience.lastAnimationAt < ambience.cooldownMinutes * 60 * 1000) continue;

        const today = getTodayKey();
        if (ambience.dailyDate !== today) {
            ambience.dailyDate = today;
            ambience.dailyCount = 0;
        }
        if (ambience.dailyCount >= ambience.maxDaily) continue;

        const state = runtime.get(groupId) || {};
        if (state.pending) continue;
        state.pending = true;
        runtime.set(groupId, state);

        // Relecture juste avant l'envoi : un nouveau message annule l'animation.
        if (activity.get(groupId) !== lastActivity) {
            state.pending = false;
            continue;
        }

        try {
            await activeSock.sendMessage(groupId, { text: chooseAnimation(ambience) });
            ambience.lastAnimationAt = Date.now();
            ambience.dailyCount += 1;
            rawConfig.ambience = ambience;
            data.chatbot[groupId] = { ...rawConfig, ambience };
            writeData(data);
            activity.set(groupId, Date.now());
        } catch (error) {
            console.error('[groupAmbience] envoi:', error.message);
        } finally {
            state.pending = false;
            runtime.set(groupId, state);
        }
    }
}

function initGroupAmbienceScheduler(sock) {
    activeSock = sock;
    if (timer) return;
    timer = setInterval(() => { tick().catch((error) => console.error('[groupAmbience] tick:', error.message)); }, TICK_MS);
    timer.unref?.();
}

module.exports = {
    initGroupAmbienceScheduler,
    touchGroupActivity,
    normalizeAmbience,
    DEFAULT_GAMES
};

// Keep the scheduler testable without exposing its internal timer.
module.exports._tick = tick;
