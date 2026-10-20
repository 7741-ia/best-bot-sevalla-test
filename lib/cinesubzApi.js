'use strict';

const API_ORIGIN = 'https://dtz-movie-script.vercel.app';
const API_HOST = new URL(API_ORIGIN).hostname;
const CINESUBZ_HOSTS = new Set(['cinesubz.net', 'www.cinesubz.net']);
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

class CineSubzApiError extends Error {
    constructor(message, code = 'API_ERROR') {
        super(message);
        this.name = 'CineSubzApiError';
        this.code = code;
    }
}

function validateCineSubzUrl(value, kind = 'movie') {
    if (typeof value !== 'string' || value.length > 2048) {
        throw new CineSubzApiError('URL invalide.', 'INVALID_URL');
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        throw new CineSubzApiError('URL invalide.', 'INVALID_URL');
    }

    const allowedPath = kind === 'portal' ? /^\/zt-links\// : /^\/movies\//;
    if (url.protocol !== 'https:' || !CINESUBZ_HOSTS.has(url.hostname.toLowerCase()) ||
        url.username || url.password || (url.port && url.port !== '443') || !allowedPath.test(url.pathname)) {
        throw new CineSubzApiError('URL CineSubz non autorisée.', 'INVALID_URL');
    }

    url.hash = '';
    return url.toString();
}

function isSafeDisplayUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return false;
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        return url.protocol === 'https:' && !url.username && !url.password &&
            (!url.port || url.port === '443') && hostname.includes('.') &&
            hostname !== 'localhost' && !hostname.endsWith('.localhost') &&
            !hostname.endsWith('.local') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
            !hostname.startsWith('[');
    } catch {
        return false;
    }
}

function cleanApiText(value, maxLength = 2000) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function ensureResultEnvelope(payload) {
    if (!payload || typeof payload !== 'object' || payload.status !== true ||
        !payload.result || typeof payload.result !== 'object' || Array.isArray(payload.result)) {
        throw new CineSubzApiError('Réponse API inattendue.', 'INVALID_RESPONSE');
    }
    return payload.result;
}

function createCineSubzClient({ fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new CineSubzApiError('Fetch indisponible dans cette version de Node.js.', 'FETCH_UNAVAILABLE');
    }

    async function requestJson(pathname, params) {
        const endpoint = new URL(pathname, API_ORIGIN);
        if (endpoint.origin !== API_ORIGIN || endpoint.hostname !== API_HOST) {
            throw new CineSubzApiError('Endpoint API non autorisé.', 'INVALID_ENDPOINT');
        }
        for (const [key, value] of Object.entries(params || {})) {
            endpoint.searchParams.set(key, String(value));
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let currentUrl = endpoint;
        try {
            for (let redirects = 0; redirects <= 2; redirects += 1) {
                let response;
                try {
                    response = await fetchImpl(currentUrl.toString(), {
                        method: 'GET',
                        headers: { accept: 'application/json', 'user-agent': 'BestBot/3.3' },
                        redirect: 'manual',
                        signal: controller.signal
                    });
                } catch (error) {
                    if (controller.signal.aborted || error?.name === 'AbortError') {
                        throw new CineSubzApiError('Délai de réponse de l’API dépassé.', 'TIMEOUT');
                    }
                    throw new CineSubzApiError('API CineSubz momentanément inaccessible.', 'NETWORK');
                }

                if (response?.url) {
                    let responseUrl;
                    try { responseUrl = new URL(response.url); } catch { throw new CineSubzApiError('Réponse API invalide.', 'INVALID_RESPONSE'); }
                    if (responseUrl.origin !== API_ORIGIN) {
                        throw new CineSubzApiError('Redirection API non autorisée.', 'UNSAFE_REDIRECT');
                    }
                }

                if (response.status >= 300 && response.status < 400) {
                    const location = response.headers?.get?.('location');
                    if (!location || redirects === 2) {
                        throw new CineSubzApiError('Trop de redirections API.', 'UNSAFE_REDIRECT');
                    }
                    let nextUrl;
                    try { nextUrl = new URL(location, currentUrl); } catch { throw new CineSubzApiError('Redirection API invalide.', 'UNSAFE_REDIRECT'); }
                    if (nextUrl.origin !== API_ORIGIN || nextUrl.hostname !== API_HOST) {
                        throw new CineSubzApiError('Redirection API non autorisée.', 'UNSAFE_REDIRECT');
                    }
                    currentUrl = nextUrl;
                    continue;
                }

                if (!response?.ok) {
                    throw new CineSubzApiError(`Erreur HTTP ${Number(response?.status) || 0} de l’API.`, 'HTTP_ERROR');
                }
                const contentLength = Number(response.headers?.get?.('content-length'));
                if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
                    throw new CineSubzApiError('Réponse API trop volumineuse.', 'INVALID_RESPONSE');
                }

                let text;
                try { text = await response.text(); } catch {
                    throw new CineSubzApiError('Lecture de la réponse API impossible.', 'INVALID_RESPONSE');
                }
                if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
                    throw new CineSubzApiError('Réponse API trop volumineuse.', 'INVALID_RESPONSE');
                }
                try { return JSON.parse(text); } catch {
                    throw new CineSubzApiError('L’API a renvoyé un JSON invalide.', 'INVALID_JSON');
                }
            }
            throw new CineSubzApiError('Trop de redirections API.', 'UNSAFE_REDIRECT');
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        async searchMovies(query, page = 1) {
            const cleanQuery = cleanApiText(query, 120);
            const safePage = Number(page);
            if (!cleanQuery || cleanQuery.length < 1 || !Number.isInteger(safePage) || safePage < 1 || safePage > 1000) {
                throw new CineSubzApiError('Recherche ou page invalide.', 'INVALID_INPUT');
            }
            const result = ensureResultEnvelope(await requestJson('/api/movie/cinesubzsearch', {
                q: cleanQuery,
                page: safePage,
                limit: 10
            }));
            if (!Array.isArray(result.movies)) {
                throw new CineSubzApiError('La réponse de recherche ne contient pas de liste de films.', 'INVALID_RESPONSE');
            }
            const movies = result.movies.slice(0, 10).flatMap((movie) => {
                if (!movie || typeof movie !== 'object') return [];
                const title = cleanApiText(movie.title, 300);
                let url;
                try { url = validateCineSubzUrl(movie.url, 'movie'); } catch { return []; }
                const poster = isSafeDisplayUrl(movie.poster) ? movie.poster : '';
                return title ? [{ title, url, poster }] : [];
            });
            return { query: cleanQuery, page: safePage, movies };
        },

        async getMovieDetails(movieUrl) {
            const safeUrl = validateCineSubzUrl(movieUrl, 'movie');
            const result = ensureResultEnvelope(await requestJson('/api/movie/cinesubzdetails', { url: safeUrl }));
            const title = cleanApiText(result.title, 300);
            if (!title) throw new CineSubzApiError('Les détails du film sont incomplets.', 'INVALID_RESPONSE');
            return {
                title,
                poster: isSafeDisplayUrl(result.poster) ? result.poster : '',
                description: cleanApiText(result.description, 1200),
                imdb: cleanApiText(result.imdb, 40),
                year: cleanApiText(result.year, 10),
                quality: cleanApiText(result.quality, 40),
                director: cleanApiText(result.director, 200),
                genres: Array.isArray(result.genres) ? result.genres.map((item) => cleanApiText(item, 60)).filter(Boolean).slice(0, 12) : [],
                cast: Array.isArray(result.cast) ? result.cast.map((item) => cleanApiText(item, 80)).filter(Boolean).slice(0, 12) : [],
                pageUrl: isSafeDisplayUrl(result.page_url) ? result.page_url : safeUrl,
                downloads: Array.isArray(result.downloads) ? result.downloads.slice(0, 5).flatMap((item) => {
                    if (!item || typeof item !== 'object') return [];
                    const label = cleanApiText(item.label, 200);
                    try {
                        return [{
                            label,
                            quality: cleanApiText(item.quality, 40),
                            size: cleanApiText(item.size, 40),
                            portalUrl: validateCineSubzUrl(item.portal_url, 'portal')
                        }];
                    } catch { return []; }
                }) : []
            };
        },

        async getDownloadLinks(portalUrl) {
            const safeUrl = validateCineSubzUrl(portalUrl, 'portal');
            const result = ensureResultEnvelope(await requestJson('/api/movie/cinesubzdown', { url: safeUrl }));
            return {
                label: cleanApiText(result.label, 200),
                downloadUrl: isSafeDisplayUrl(result.download_url) ? result.download_url : '',
                originalUrl: isSafeDisplayUrl(result.original_url) ? result.original_url : '',
                cdnUrl: isSafeDisplayUrl(result.cdn_url) ? result.cdn_url : '',
                telegramUrl: isSafeDisplayUrl(result.telegram) ? result.telegram : '',
                contentType: cleanApiText(result.content_type, 80),
                contentLength: cleanApiText(result.content_length, 40)
            };
        }
    };
}

module.exports = {
    API_ORIGIN,
    CineSubzApiError,
    createCineSubzClient,
    validateCineSubzUrl,
    isSafeDisplayUrl,
    cleanApiText
};
