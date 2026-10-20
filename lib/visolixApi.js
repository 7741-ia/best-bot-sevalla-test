/**
 * visolixApi.js — Wrapper Visolix (téléchargement vidéo)
 * Utilise VISOLIX_API_KEY (déjà présent dans .env)
 *
 * Doc: https://developers.visolix.com/rest-api
 * Flux: GET /api/download -> id, puis GET /api/progress?id=... jusqu'à success=1.
 */

const axios = require('axios');

const BASE = (process.env.VISOLIX_API_BASE_URL || 'https://developers.visolix.com').replace(/\/+$/, '');
const KEY = process.env.VISOLIX_API_KEY || '';

const HAS_VISOLIX = Boolean(KEY);

const HTTP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; BestKingBot/1.0)',
    'Accept': 'application/json'
};

async function startDownload({ url, platform, format }) {
    if (!HAS_VISOLIX) throw new Error('VISOLIX_API_KEY manquant');
    const headers = {
        ...HTTP_HEADERS,
        'X-API-KEY': KEY,
        'X-PLATFORM': platform,
        'URL': encodeURIComponent(url),
    };
    if (format) headers['X-FORMAT'] = format;

    const res = await axios.get(`${BASE}/api/download`, {
        headers,
        timeout: 30000,
        validateStatus: (s) => s >= 200 && s < 500,
    });
    if (res.status >= 400 || !res.data?.id) {
        throw new Error(`Visolix start failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 200)}`);
    }
    return { id: res.data.id, info: res.data.info || {} };
}

async function pollProgress(id, { maxMs = 60000, intervalMs = 1500 } = {}) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
        const res = await axios.get(`${BASE}/api/progress`, {
            params: { id },
            headers: HTTP_HEADERS,
            timeout: 15000,
            validateStatus: (s) => s >= 200 && s < 500,
        });
        const data = res.data || {};
        if (data.success === 1 && data.download_url) {
            return data.download_url;
        }
        if (data.text && /error|fail/i.test(String(data.text))) {
            throw new Error(`Visolix error: ${data.text}`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Visolix timeout (polling)');
}

async function visolixDownload({ url, platform, format, title }) {
    const { id, info } = await startDownload({ url, platform, format });
    const downloadUrl = await pollProgress(id);
    return {
        url: downloadUrl,
        title: title || info?.title || `${platform} media`,
        provider: 'visolix',
    };
}

module.exports = {
    HAS_VISOLIX,
    visolixDownload,
};
