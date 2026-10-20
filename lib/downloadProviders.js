const axios = require('axios');
const { HAS_VISOLIX, visolixDownload } = require('./visolixApi');
const knight = require('./knightbotApi');
const kcey = require('./kcey');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
};

const DIGIX_BASE_URL = 'https://digix-core.vercel.app';

function visolixProvider(platform, url, format) {
    return async () => {
        if (!HAS_VISOLIX) throw new Error('Visolix indisponible');
        return visolixDownload({ url, platform, format });
    };
}

async function tryProviders(providers) {
    let lastError;
    for (const provider of providers) {
        try {
            const result = await provider();
            if (result && result.url) {
                return result;
            }
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Aucun fournisseur n\'a retourné une URL valide');
}

async function getJson(url, extra = {}) {
    const response = await axios.get(url, {
        timeout: 30000,
        headers: { ...DEFAULT_HEADERS, ...(extra.headers || {}) },
        validateStatus: (status) => status >= 200 && status < 500,
        ...extra
    });

    if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Fournisseurs de secours (API publiques gratuites, sans clé) ---------------------------
// TikTok : tikwm (limite gratuite : 1 requête/seconde -> un réessai après une courte pause)
async function tikwmProvider(url) {
    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const data = await getJson(api);
        if (data?.code === 0 && data?.data) {
            const link = data.data.play || data.data.wmplay;
            if (link) return { url: link, title: data.data.title || 'Vidéo TikTok' };
            break;
        }
        if (attempt === 1 && /limit|1 request|parsing/i.test(data?.msg || '')) {
            await sleep(1500);
            continue;
        }
        break;
    }
    throw new Error('tikwm indisponible');
}

// Instagram : aswin-sparky puis movanest
async function aswinInstagram(url) {
    const data = await getJson(`https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`);
    const item = data?.status && Array.isArray(data.data) ? data.data.find((entry) => entry?.url) : null;
    if (!item) throw new Error('aswin igdl : aucun média');
    return { url: item.url, title: 'Instagram Media' };
}
async function movanestInstagram(url) {
    const data = await getJson(`https://movanest.xyz/v2/instagram?url=${encodeURIComponent(url)}`);
    const link = data?.status ? data?.results?.videoUrl || data?.results?.downloadUrl : null;
    if (!link) throw new Error('movanest : aucun média');
    return { url: link, title: 'Instagram Media' };
}

// Facebook : aswin-sparky puis jawad-tech
async function aswinFacebook(url) {
    const data = await getJson(`https://api-aswin-sparky.koyeb.app/api/downloader/fbdl?url=${encodeURIComponent(url)}`);
    const link = data?.status ? data?.data?.high || data?.data?.low : null;
    if (!link) throw new Error('aswin fbdl : aucune vidéo');
    return { url: link, title: data.data.title || 'Vidéo Facebook' };
}
async function jawadFacebook(url) {
    const data = await getJson(`https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(url)}`);
    const item = data?.status && Array.isArray(data.result) ? data.result.find((entry) => entry?.url) : null;
    if (!item) throw new Error('jawad-tech : aucune vidéo');
    return { url: item.url, title: 'Vidéo Facebook' };
}

// YouTube : arslan-apis-v2 (ytmp3 = vrai fichier audio, ytmp4 = vidéo)
async function arslanYouTube(kind, url) {
    const data = await getJson(`https://arslan-apis-v2.vercel.app/download/${kind}?url=${encodeURIComponent(url)}`, { timeout: 60000 });
    const link = data?.status && data?.result?.status ? data.result.download?.url : null;
    if (!link) throw new Error(`arslan ${kind} : aucun lien`);
    return { url: link, title: data.result.metadata?.title || 'YouTube' };
}

function parseDigixPayload(data, platform) {
    // Digix standard payload extraction
    const url = 
        data?.result?.download_url || 
        data?.result?.url || 
        data?.data?.download_url || 
        data?.data?.url || 
        data?.download_url || 
        data?.url;
        
    const title = 
        data?.result?.title || 
        data?.data?.title || 
        data?.title || 
        `${platform} Video`;

    return { url, title };
}

async function resolveFacebookDownload(url) {
    const providers = [
        () => knight.download('facebook', { url }, { timeout: 90000 }),
        visolixProvider('facebook', url),
        async () => {
            const data = await getJson(`${DIGIX_BASE_URL}/downloader/fbdlv2?url=${encodeURIComponent(url)}`);
            return parseDigixPayload(data, 'Facebook');
        },
        async () => {
            const data = await getJson(`${DIGIX_BASE_URL}/downloader/fbdl?url=${encodeURIComponent(url)}`);
            return parseDigixPayload(data, 'Facebook');
        },
        async () => {
            const data = await getJson(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(url)}`);
            return {
                url: data?.result?.video || data?.result?.url,
                title: data?.result?.title || 'Vidéo Facebook'
            };
        },
        () => aswinFacebook(url),
        () => jawadFacebook(url)
    ];

    return tryProviders(providers);
}

async function resolveTikTokDownload(url) {
    const providers = [
        () => knight.download('tiktok', { url }, { timeout: 120000 }),
        () => knight.download('tiktokdl', { url }, { timeout: 120000 }),
        visolixProvider('tiktok', url),
        async () => {
            const data = await getJson(`${DIGIX_BASE_URL}/downloader/tikdl?url=${encodeURIComponent(url)}`);
            return parseDigixPayload(data, 'TikTok');
        },
        async () => {
            const data = await getJson(`https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(url)}`);
            return {
                url: data?.result?.video || data?.result?.video_hd || data?.result?.url,
                title: data?.result?.title || 'Vidéo TikTok'
            };
        },
        () => tikwmProvider(url),
        () => kcey.tiktok(url)
    ];

    return tryProviders(providers);
}

async function resolveYouTubeAudio(url) {
    const providers = [
        () => knight.ytaudio(url),
        visolixProvider('youtube', url, 'mp3'),
        async () => {
            const data = await getJson(`${DIGIX_BASE_URL}/downloader/ytmp3?url=${encodeURIComponent(url)}`);
            return parseDigixPayload(data, 'YouTube Audio');
        },
        () => arslanYouTube('ytmp3', url),
        () => kcey.ytmp3(url)
    ];

    return tryProviders(providers);
}

async function resolveYouTubeVideo(url) {
    const providers = [
        () => knight.ytmp4(url),
        visolixProvider('youtube', url, '720'),
        async () => {
            const data = await getJson(`${DIGIX_BASE_URL}/downloader/ytmp4?url=${encodeURIComponent(url)}`);
            return parseDigixPayload(data, 'YouTube Video');
        },
        () => arslanYouTube('ytmp4', url)
    ];

    return tryProviders(providers);
}

async function resolveInstagramDownload(url) {
    const providers = [
        () => knight.download('instagram', { url }, { timeout: 120000 }),
        () => knight.download('instagramdl', { url }, { timeout: 120000 }),
        visolixProvider('instagram', url),
        async () => {
            const data = await getJson(`${DIGIX_BASE_URL}/downloader/igdl?url=${encodeURIComponent(url)}`);
            return parseDigixPayload(data, 'Instagram');
        },
        async () => {
            const data = await getJson(`https://api.vreden.my.id/api/igdl?url=${encodeURIComponent(url)}`);
            return {
                url: data?.result?.[0]?.url || data?.result?.url,
                title: data?.result?.title || 'Instagram Media'
            };
        },
        () => aswinInstagram(url),
        () => movanestInstagram(url)
    ];
    return tryProviders(providers);
}

async function resolveSnapchatDownload(url) {
    const providers = [
        visolixProvider('snapchat', url),
    ];
    return tryProviders(providers);
}

module.exports = {
    resolveFacebookDownload,
    resolveTikTokDownload,
    resolveYouTubeAudio,
    resolveYouTubeVideo,
    resolveInstagramDownload,
    resolveSnapchatDownload
};
