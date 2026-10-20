'use strict';

const { createCineSubzClient, cleanApiText } = require('../lib/cinesubzApi');

const STATE_TTL_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 12;
const COMMAND_COOLDOWN_MS = 700;
const MAX_DOWNLOAD_LOOKUPS = 5;

function normalizeTitle(value) {
    return cleanApiText(value, 300).normalize('NFKC').toLocaleLowerCase();
}

function extractYear(title) {
    const match = String(title || '').match(/\b(19\d{2}|20\d{2})\b/);
    return match ? match[1] : '';
}

function formatSearchResult(movie, index) {
    const lines = [`${index + 1}. 🎥 *${movie.title}*`];
    const year = extractYear(movie.title);
    if (year) lines.push(`   📅 Année : ${year}`);
    if (movie.poster) lines.push(`   🖼️ Affiche : ${movie.poster}`);
    lines.push(`   🔗 Fiche : ${movie.url}`);
    return lines.join('\n');
}

function createMovieCommand({ client = createCineSubzClient(), now = Date.now, cooldownMs = COMMAND_COOLDOWN_MS } = {}) {
    const sessions = new Map();
    const rateLimits = new Map();

    function pruneMaps() {
        const currentTime = now();
        for (const [key, value] of sessions) {
            if (currentTime - value.updatedAt > STATE_TTL_MS) sessions.delete(key);
        }
        for (const [key, value] of rateLimits) {
            if (!value.timestamps.length || currentTime - value.timestamps[value.timestamps.length - 1] > RATE_WINDOW_MS) rateLimits.delete(key);
        }
        while (sessions.size > 500) sessions.delete(sessions.keys().next().value);
        while (rateLimits.size > 1000) rateLimits.delete(rateLimits.keys().next().value);
    }

    function makeSessionKey(chatId, message) {
        const sender = message?.key?.participant || message?.key?.participantAlt || message?.key?.remoteJid || chatId;
        return `${String(chatId)}::${String(sender)}`;
    }

    function allowedNow(key) {
        const currentTime = now();
        const entry = rateLimits.get(key) || { timestamps: [] };
        entry.timestamps = entry.timestamps.filter((timestamp) => currentTime - timestamp < RATE_WINDOW_MS);
        const last = entry.timestamps[entry.timestamps.length - 1];
        if ((last !== undefined && currentTime - last < cooldownMs) || entry.timestamps.length >= RATE_LIMIT) {
            rateLimits.set(key, entry);
            return false;
        }
        entry.timestamps.push(currentTime);
        rateLimits.set(key, entry);
        return true;
    }

    function saveSession(key, prior, update) {
        const session = { ...(prior || {}), ...update, updatedAt: now() };
        sessions.set(key, session);
        return session;
    }

    function commandParts(rawText) {
        const match = String(rawText || '').trim().match(/^\.(movieinfo|moviedl|moviepage|movie)(?:\s+([\s\S]*))?$/i);
        if (!match) return null;
        return { command: match[1].toLowerCase(), argument: (match[2] || '').trim() };
    }

    async function handle(sock, chatId, message, rawText) {
        pruneMaps();
        const parsed = commandParts(rawText);
        if (!parsed) return false;
        const key = makeSessionKey(chatId, message);
        const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

        if (!allowedNow(key)) {
            await reply('⏳ Tu envoies les commandes cinéma trop rapidement. Attends un instant puis réessaie.');
            return true;
        }

        let session = sessions.get(key);
        try {
            if (parsed.command === 'movie') {
                if (!parsed.argument) {
                    await reply('Utilisation : *.movie <titre>*\nExemple : *.movie Avatar*');
                    return true;
                }
                await reply(`🔎 Recherche de films : *${cleanApiText(parsed.argument, 120)}*…`);
                const result = await client.searchMovies(parsed.argument, 1);
                session = saveSession(key, session, { query: result.query || parsed.argument, page: 1, movies: result.movies || [] });
                await reply(formatPage(session));
                return true;
            }

            if (parsed.command === 'moviepage') {
                if (!session?.query) {
                    await reply('Aucune recherche en cours. Lance d’abord *.movie <titre>*.');
                    return true;
                }
                const requested = parsed.argument.toLowerCase();
                let targetPage;
                if (requested === 'next' || requested === 'suivant') targetPage = Number(session.page || 1) + 1;
                else if (requested === 'prev' || requested === 'previous' || requested === 'précédent' || requested === 'precedent') targetPage = Number(session.page || 1) - 1;
                else if (/^\d{1,4}$/.test(requested)) targetPage = Number(requested);
                else {
                    await reply('Utilisation : *.moviepage <numéro|next|prev>*');
                    return true;
                }
                if (targetPage < 1 || targetPage > 1000) {
                    await reply('Le numéro de page doit être compris entre 1 et 1000.');
                    return true;
                }
                const result = await client.searchMovies(session.query, targetPage);
                session = saveSession(key, session, { page: result.page || targetPage, movies: result.movies || [] });
                await reply(formatPage(session));
                return true;
            }

            const movie = await resolveMovie(client, key, session, parsed.argument, reply, saveSession);
            if (!movie) return true;
            session = sessions.get(key) || session;

            if (parsed.command === 'movieinfo') {
                const details = await client.getMovieDetails(movie.url);
                await reply(formatDetails(details));
                return true;
            }

            if (parsed.command === 'moviedl') {
                await reply('🔗 Récupération des liens disponibles… Le bot ne télécharge ni ne redistribue de fichier.');
                const details = await client.getMovieDetails(movie.url);
                if (!details.downloads.length) {
                    await reply('L’API ne fournit aucun portail de liens pour ce résultat.');
                    return true;
                }
                const portals = details.downloads.slice(0, MAX_DOWNLOAD_LOOKUPS);
                const links = await Promise.allSettled(portals.map((item) => client.getDownloadLinks(item.portalUrl)));
                const blocks = [];
                links.forEach((outcome, index) => {
                    if (outcome.status !== 'fulfilled') return;
                    const data = outcome.value;
                    const url = data.downloadUrl || data.originalUrl || data.cdnUrl;
                    if (!url) return;
                    const item = portals[index];
                    const metadata = [item.quality, item.size].filter(Boolean).join(' · ');
                    blocks.push(`• ${item.label || item.quality || `Lien ${index + 1}`}${metadata ? ` (${metadata})` : ''}\n  ${url}`);
                });
                if (!blocks.length) {
                    await reply('Aucun lien exploitable n’a été renvoyé par l’API pour ce titre. Vérifie les droits applicables avant d’utiliser un lien.');
                    return true;
                }
                await reply(`🎬 *Liens CineSubz — ${details.title}*\n\n${blocks.join('\n\n')}\n\nVérifie que tu es autorisé à accéder au contenu. Les liens sont fournis par un service tiers et peuvent expirer.`);
                return true;
            }
        } catch (error) {
            const code = error?.code || error?.name || 'UNKNOWN';
            console.warn('[movies] requête échouée:', String(code).slice(0, 40));
            await reply('❌ Impossible de traiter la demande cinéma pour le moment. Vérifie le titre et réessaie plus tard.');
            return true;
        }
        return false;
    }

    return { handle, sessions, rateLimits };
}

function formatPage(session) {
    const movies = Array.isArray(session.movies) ? session.movies : [];
    if (!movies.length) {
        return `🎬 *BEST BOT — MOVIE CENTER*\n\n🔎 Recherche : ${session.query}\n\nAucun résultat sur cette page.\n📄 Page : ${session.page}`;
    }
    return [
        '🎬 *BEST BOT — MOVIE CENTER*',
        '',
        `🔎 Recherche : ${session.query}`,
        '',
        movies.map(formatSearchResult).join('\n\n'),
        '',
        `📄 Page : ${session.page}`,
        'Réponds avec *.movieinfo 1* ou *.moviedl 1* pour un résultat de cette page. Utilise *.moviepage next*, *.moviepage prev* ou *.moviepage 2* pour naviguer.'
    ].join('\n');
}

async function resolveMovie(client, key, session, argument, reply, saveSession) {
    if (!argument) {
        await reply('Utilisation : *.movieinfo <titre|numéro>* ou *.moviedl <titre|numéro>*.');
        return null;
    }

    if (/^\d{1,2}$/.test(argument)) {
        const index = Number(argument) - 1;
        const movie = session?.movies?.[index];
        if (!movie) {
            await reply('Ce numéro ne correspond pas aux résultats de la page affichée. Lance une recherche ou vérifie le numéro.');
            return null;
        }
        return movie;
    }

    const target = normalizeTitle(argument);
    const cached = Array.isArray(session?.movies) ? session.movies : [];
    const exact = cached.filter((item) => normalizeTitle(item.title) === target);
    if (exact.length === 1) return exact[0];

    await reply(`🔎 Recherche du titre : *${cleanApiText(argument, 120)}*…`);
    const result = await client.searchMovies(argument, 1);
    const updated = saveSession(key, session, { query: result.query || argument, page: 1, movies: result.movies || [] });
    const exactMatches = updated.movies.filter((item) => normalizeTitle(item.title) === target);
    if (exactMatches.length === 1) return exactMatches[0];
    if (updated.movies.length === 1) return updated.movies[0];
    if (updated.movies.length > 1) {
        await reply(`Plusieurs résultats correspondent. Choisis un numéro avec *.movieinfo 1* ou *.moviedl 1* :\n\n${updated.movies.map(formatSearchResult).join('\n\n')}`);
        return null;
    }
    await reply('Aucun film correspondant trouvé.');
    return null;
}

function formatDetails(details) {
    const lines = ['🎬 *BEST BOT — MOVIE INFO*', '', `*${details.title}*`];
    if (details.year) lines.push(`📅 Année : ${details.year}`);
    if (details.quality) lines.push(`🎞️ Qualité : ${details.quality}`);
    if (details.director) lines.push(`🎬 Réalisation : ${details.director}`);
    if (details.genres.length) lines.push(`🏷️ Genres / tags : ${details.genres.join(', ')}`);
    if (details.cast.length) lines.push(`👥 Distribution : ${details.cast.join(', ')}`);
    if (details.imdb) lines.push(`IMDb : ${details.imdb}`);
    if (details.description) lines.push(`\n${details.description}`);
    if (details.poster) lines.push(`\n🖼️ Affiche : ${details.poster}`);
    lines.push(`\n🔗 Fiche : ${details.pageUrl}`);
    if (details.downloads.length) lines.push(`\n🔗 Portails de liens disponibles : ${details.downloads.length}\nPour les liens retournés par l’API : *.moviedl 1* (résultat sélectionné).`);
    return lines.join('\n');
}

const defaultCommand = createMovieCommand();

module.exports = {
    handleMovieCommand: defaultCommand.handle,
    createMovieCommand,
    formatPage,
    formatDetails,
    extractYear
};
