const fetchFn = (...args) => {
    if (typeof globalThis.fetch === 'function') {
        return globalThis.fetch(...args);
    }

    // Fallback for older Node runtimes where node-fetch is installed.
    // eslint-disable-next-line global-require
    return require('node-fetch')(...args);
};

const SUPPORTED_LANGUAGE_ALIASES = {
    english: 'en',
    anglais: 'en',
    en: 'en',
    french: 'fr',
    francais: 'fr',
    français: 'fr',
    fr: 'fr',
    spanish: 'es',
    espagnol: 'es',
    es: 'es',
    german: 'de',
    allemand: 'de',
    de: 'de',
    italian: 'it',
    italien: 'it',
    it: 'it',
    portuguese: 'pt',
    portugais: 'pt',
    pt: 'pt',
    russian: 'ru',
    russe: 'ru',
    ru: 'ru',
    japanese: 'ja',
    japonais: 'ja',
    ja: 'ja',
    korean: 'ko',
    coreen: 'ko',
    coréen: 'ko',
    ko: 'ko',
    chinese: 'zh',
    chinois: 'zh',
    zh: 'zh',
    arabic: 'ar',
    arabe: 'ar',
    ar: 'ar',
    hindi: 'hi',
    hi: 'hi'
};

function normalizeLanguage(input) {
    const value = String(input || '').trim().toLowerCase();
    return SUPPORTED_LANGUAGE_ALIASES[value] || value;
}

function extractTranslatedText(payload) {
    if (!payload) return null;

    if (Array.isArray(payload) && Array.isArray(payload[0])) {
        return payload[0]
            .map((part) => Array.isArray(part) ? part[0] : '')
            .filter(Boolean)
            .join('');
    }

    if (payload.responseData?.translatedText) {
        return payload.responseData.translatedText;
    }

    if (payload.translated) {
        return payload.translated;
    }

    if (payload.data?.translatedText) {
        return payload.data.translatedText;
    }

    return null;
}

async function requestJson(url, options = {}) {
    const response = await fetchFn(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

async function translateText(text, targetLanguage) {
    const target = normalizeLanguage(targetLanguage);
    if (!target) {
        throw new Error('Missing target language');
    }

    const providers = [
        async () => {
            const customBase = process.env.TRANSLATE_API_URL;
            if (!customBase) {
                throw new Error('TRANSLATE_API_URL not configured');
            }

            const payload = await requestJson(customBase, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.TRANSLATE_API_KEY ? { 'Authorization': `Bearer ${process.env.TRANSLATE_API_KEY}` } : {})
                },
                body: JSON.stringify({
                    q: text,
                    source: 'auto',
                    target,
                    format: 'text'
                })
            });

            return extractTranslatedText(payload);
        },
        async () => {
            const payload = await requestJson(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`
            );
            return extractTranslatedText(payload);
        },
        async () => {
            const payload = await requestJson(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${encodeURIComponent(target)}`
            );
            return extractTranslatedText(payload);
        }
    ];

    let lastError;
    for (const provider of providers) {
        try {
            const translated = await provider();
            if (translated) {
                return { translatedText: translated, targetLanguage: target };
            }
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Translation failed');
}

module.exports = {
    SUPPORTED_LANGUAGE_ALIASES,
    normalizeLanguage,
    translateText
};
