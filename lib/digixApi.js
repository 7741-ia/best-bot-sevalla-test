const axios = require('axios');
const { isBadProviderReply, truncatePromptForGet } = require('./aiValidation');

const DIGIX_BASE_URL = (process.env.DIGIX_API_BASE_URL || 'https://digix-core.vercel.app').replace(/\/+$/, '');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*'
};

function normalizePath(pathname) {
    const value = String(pathname || '').trim();
    if (!value) {
        throw new Error('Digix path is required');
    }

    return value.startsWith('/') ? value : `/${value}`;
}

function buildDigixUrl(pathname, params = {}) {
    const url = new URL(normalizePath(pathname), `${DIGIX_BASE_URL}/`);

    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null) continue;
        const stringValue = String(value).trim();
        if (!stringValue) continue;
        url.searchParams.set(key, stringValue);
    }

    return url.toString();
}

function safeParseJson(value) {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function firstString(...values) {
    for (const value of values.flat()) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

function extractText(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload.trim();

    const direct = firstString(
        payload.reponse,
        payload.réponse,
        payload.response,
        payload.answer,
        payload.result,
        payload.message,
        payload.text,
        payload.output,
        payload.code,
        payload.post,
        payload.paroles,
        payload.lyrics
    );
    if (direct) return direct;

    const nested = firstString(
        payload?.data?.reponse,
        payload?.data?.réponse,
        payload?.data?.response,
        payload?.data?.answer,
        payload?.data?.result,
        payload?.data?.message,
        payload?.data?.text,
        payload?.data?.output,
        payload?.data?.code,
        payload?.data?.post,
        payload?.data?.paroles,
        payload?.data?.lyrics,
        payload?.result?.reponse,
        payload?.result?.réponse,
        payload?.result?.response,
        payload?.result?.answer,
        payload?.result?.result,
        payload?.result?.message,
        payload?.result?.text,
        payload?.result?.output,
        payload?.result?.code,
        payload?.result?.post,
        payload?.result?.paroles,
        payload?.result?.lyrics
    );
    if (nested) return nested;

    return '';
}

function extractImageSource(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload.trim();

    return firstString(
        payload.image,
        payload.url,
        payload.src,
        payload.file,
        payload.data?.image,
        payload.data?.url,
        payload.data?.src,
        payload.data?.file,
        payload.result?.image,
        payload.result?.url,
        payload.result?.src,
        payload.result?.file,
        payload.donnees?.image,
        payload.donnees?.url
    );
}

function extractMediaUrl(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload.trim();

    const direct = firstString(
        payload.download_url,
        payload.downloadUrl,
        payload.videoUrl,
        payload.video_url,
        payload.audioUrl,
        payload.audio_url,
        payload.url,
        payload.link,
        payload.file,
        payload.result?.download_url,
        payload.result?.downloadUrl,
        payload.result?.videoUrl,
        payload.result?.video_url,
        payload.result?.audioUrl,
        payload.result?.audio_url,
        payload.result?.url,
        payload.result?.link,
        payload.result?.file,
        payload.data?.download_url,
        payload.data?.downloadUrl,
        payload.data?.videoUrl,
        payload.data?.video_url,
        payload.data?.audioUrl,
        payload.data?.audio_url,
        payload.data?.url,
        payload.data?.link,
        payload.data?.file
    );
    if (direct) return direct;

    if (Array.isArray(payload.data)) {
        for (const item of payload.data) {
            const candidate = extractMediaUrl(item);
            if (candidate) return candidate;
        }
    }

    return '';
}

function dataUrlToBuffer(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || '').trim());
    if (!match) {
        return null;
    }

    return {
        buffer: Buffer.from(match[2], 'base64'),
        mimeType: match[1]
    };
}

async function resolveBufferFromSource(source, options = {}) {
    if (Buffer.isBuffer(source)) {
        return { buffer: source, mimeType: options.mimeType || null };
    }

    const value = String(source || '').trim();
    if (!value) {
        throw new Error('Image source is empty');
    }

    const dataUrl = dataUrlToBuffer(value);
    if (dataUrl) {
        return dataUrl;
    }

    if (/^https?:\/\//i.test(value)) {
        const response = await axios.get(value, {
            responseType: 'arraybuffer',
            timeout: options.timeout || 60000,
            headers: DEFAULT_HEADERS,
            validateStatus: () => true
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`HTTP ${response.status} while fetching media`);
        }

        return {
            buffer: Buffer.from(response.data),
            mimeType: response.headers['content-type'] || null
        };
    }

    throw new Error('Unsupported image source format');
}

async function requestDigix(pathname, params = {}, options = {}) {
    const response = await axios.get(buildDigixUrl(pathname, params), {
        timeout: options.timeout || 30000,
        headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
        responseType: 'text',
        validateStatus: () => true
    });

    const payload = safeParseJson(response.data);
    if (response.status < 200 || response.status >= 300) {
        const errorMessage = firstString(
            payload?.message,
            payload?.erreur,
            payload?.error,
            payload?.details,
            response.statusText,
            `HTTP ${response.status}`
        );
        const error = new Error(errorMessage || `HTTP ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    if (payload && typeof payload === 'object' && (payload.succes === false || payload.success === false)) {
        const errorMessage = firstString(
            payload.message,
            payload.erreur,
            payload.error,
            payload.details,
            'Digix request failed'
        );
        const error = new Error(errorMessage);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

async function requestDigixText(pathname, params = {}, options = {}) {
    // GET : on borne la taille des paramètres texte pour éviter les 400 / "Invalid Request"
    const safeParams = {};
    for (const [key, value] of Object.entries(params || {})) {
        safeParams[key] = typeof value === 'string' ? truncatePromptForGet(value, options.maxPromptLength || 1400) : value;
    }

    const payload = await requestDigix(pathname, safeParams, options);
    const text = extractText(payload);
    if (!text) {
        throw new Error('Digix response did not contain text');
    }
    if (isBadProviderReply(text)) {
        throw new Error(`Digix ${pathname} returned an unusable reply`);
    }
    return text;
}

async function requestDigixImage(pathname, params = {}, options = {}) {
    const payload = await requestDigix(pathname, params, options);
    const source = extractImageSource(payload);
    if (!source) {
        throw new Error('Digix response did not contain an image');
    }

    const { buffer, mimeType } = await resolveBufferFromSource(source, options);
    return { buffer, mimeType, payload, source };
}

async function requestDigixMedia(pathname, params = {}, options = {}) {
    const payload = await requestDigix(pathname, params, options);
    const url = extractMediaUrl(payload);
    if (!url) {
        throw new Error('Digix response did not contain downloadable media');
    }

    return { url, payload };
}

module.exports = {
    DIGIX_BASE_URL,
    buildDigixUrl,
    extractImageSource,
    extractMediaUrl,
    extractText,
    requestDigix,
    requestDigixImage,
    requestDigixMedia,
    requestDigixText,
    resolveBufferFromSource,
    safeParseJson
};
