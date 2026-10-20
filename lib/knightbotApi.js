const axios = require('axios');

const BASE_URL = (process.env.KNIGHTBOT_API_URL || 'https://knightbotapi.stream').replace(/\/+$/, '');
const API_KEY = process.env.KNIGHTBOT_API_KEY || 'knight';
const http = axios.create({
    baseURL: BASE_URL,
    timeout: Number(process.env.KNIGHTBOT_API_TIMEOUT || 45000),
    headers: { 'User-Agent': 'BestBot/1.0', Accept: 'application/json, text/plain, */*' }
});

function request(path, params = {}, options = {}) {
    return http.get(path, { params: { apikey: API_KEY, ...params }, timeout: options.timeout || http.defaults.timeout });
}

function resultOf(payload) {
    return payload?.result ?? payload?.data ?? payload;
}

function firstUrl(value) {
    if (!value) return null;
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = firstUrl(item);
            if (found) return found;
        }
        return null;
    }
    if (typeof value === 'object') {
        for (const key of ['download', 'dl_url', 'dl', 'url', 'video', 'video_hd', 'image', 'src', 'link', 'media']) {
            const found = firstUrl(value[key]);
            if (found) return found;
        }
    }
    return null;
}

function mediaFrom(payload, fallbackTitle = 'KnightBot media') {
    const result = resultOf(payload);
    const url = firstUrl(result) || firstUrl(payload);
    if (!url) throw new Error('KnightBot n’a pas retourné de fichier téléchargeable');
    return {
        url,
        title: result?.title || payload?.title || fallbackTitle,
        thumbnail: result?.thumbnail || payload?.thumbnail || null,
        duration: result?.duration || payload?.duration || ''
    };
}

async function download(kind, params, options) {
    const paths = {
        ytaudio: '/api/download/ytaudio',
        ytmp4: '/api/download/ytmp4',
        twitter: '/api/download/twitter',
        facebook: '/api/download/facebook',
        tiktok: '/api/download/tiktok',
        tiktokdl: '/api/download/tiktokdl',
        instagram: '/api/download/instagram',
        instagramdl: '/api/download/instagramdl',
        pinterest: '/api/download/pinterest'
    };
    const payload = (await request(paths[kind], params, options)).data;
    return mediaFrom(payload, kind);
}

async function ytaudio(input, format = '128kbps') {
    const params = /^https?:\/\//i.test(input) ? { url: input, format } : { query: input, format };
    try { return await download('ytaudio', params, { timeout: 90000 }); }
    catch { return mediaFrom((await request('/api/ytmp3', params, { timeout: 90000 })).data, 'YouTube Audio'); }
}

async function ytmp4(input, format = '720p') {
    const params = /^https?:\/\//i.test(input) ? { url: input, format } : { query: input, format };
    try { return await download('ytmp4', params, { timeout: 120000 }); }
    catch { return mediaFrom((await request('/api/ytmp4', params, { timeout: 120000 })).data, 'YouTube Video'); }
}

async function lyrics(query) {
    const payload = (await request('/api/lyrics', { query }, { timeout: 30000 })).data;
    const result = resultOf(payload) || {};
    return {
        title: result.title || payload.title || query,
        artist: result.artist || payload.artist || '',
        lyrics: result.lyrics || result.paroles || payload.lyrics || payload.paroles || ''
    };
}

async function screenshot(url) {
    const payload = (await request('/api/ssweb', { url }, { timeout: 60000 })).data;
    return mediaFrom(payload, 'Website screenshot');
}

async function tts(text, lang = 'fr') {
    const payload = (await request('/api/tts', { text: String(text).slice(0, 200), lang }, { timeout: 60000 })).data;
    return mediaFrom(payload, 'TTS audio');
}

async function qr(text) {
    const payload = (await request('/api/qr', { text }, { timeout: 30000 })).data;
    return mediaFrom(payload, 'QR code');
}

async function progress(id) {
    return (await request(`/api/progress/${encodeURIComponent(id)}`, {}, { timeout: 30000 })).data;
}

module.exports = {
    BASE_URL,
    API_KEY,
    request,
    resultOf,
    firstUrl,
    mediaFrom,
    download,
    ytaudio,
    ytmp4,
    lyrics,
    screenshot,
    tts,
    qr,
    progress
};
