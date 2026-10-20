// lib/kcey.js
// Client KCEY API Hub (https://api.kcey.online). Clé dans .env : KCEY_API_KEY (jamais loguée).
// Endpoints vérifiés : /api/deepseek, /api/overchat, /api/chatgpt (param `prompt`),
// /api/ytmp3, /api/tiktok (param `url`). Auth : paramètre `key`.
const axios = require('axios');

const BASE_URL = () => (process.env.KCEY_BASE_URL || 'https://api.kcey.online').replace(/\/+$/, '');
const hasKey = () => Boolean(process.env.KCEY_API_KEY);
const AI_ENDPOINTS = () =>
    String(process.env.KCEY_AI_ENDPOINTS || 'deepseek,overchat,chatgpt').split(',').map((s) => s.trim()).filter(Boolean);

async function call(endpoint, params = {}, timeout = 30000) {
    if (!hasKey()) throw new Error('KCEY_API_KEY manquante');
    const res = await axios.get(`${BASE_URL()}/api/${endpoint}`, {
        params: { ...params, key: process.env.KCEY_API_KEY },
        timeout,
        validateStatus: () => true,
    });
    if (res.status >= 400) throw Object.assign(new Error(`KCEY ${endpoint} HTTP ${res.status}`), { response: { status: res.status } });
    const data = res.data;
    if (!data || typeof data !== 'object') throw new Error(`KCEY ${endpoint} : réponse invalide`);
    if (data.ok === false || data.error) throw new Error(`KCEY ${endpoint} : ${data.error || data.message || 'erreur'}`);
    if (data.message && /no worker module/i.test(data.message)) throw new Error(`KCEY ${endpoint} : non implémenté`);
    return data;
}

// ---- Parseurs (purs, testables hors-ligne) ----
const parseAi = (data) => {
    const t = typeof data?.response === 'string' ? data.response.trim() : '';
    if (!t) throw new Error('KCEY : réponse IA vide');
    return t;
};
const parseYtmp3 = (data) => {
    const url = data?.download || data?.raw?.BK9?.downloadUrl;
    if (!url) throw new Error('KCEY ytmp3 : aucun lien');
    return { url, title: data.title || 'YouTube' };
};
const parseTiktok = (data) => {
    const url = data?.hdplay || data?.play;
    if (!url) throw new Error('KCEY tiktok : aucun lien');
    return { url, title: data.title || 'TikTok' };
};

// ---- API ----
async function ai(endpoint, prompt, timeout) { return parseAi(await call(endpoint, { prompt }, timeout)); }
async function ytmp3(url) { return parseYtmp3(await call('ytmp3', { url }, 60000)); }
async function tiktok(url) { return parseTiktok(await call('tiktok', { url }, 45000)); }

module.exports = { hasKey, call, ai, ytmp3, tiktok, AI_ENDPOINTS, parseAi, parseYtmp3, parseTiktok };
