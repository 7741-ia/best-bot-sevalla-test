'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCineSubzClient, validateCineSubzUrl } = require('../lib/cinesubzApi');
const { createMovieCommand } = require('../commands/movies');

const movie = {
    title: 'Avatar (2009) Sinhala Subtitles',
    url: 'https://cinesubz.net/movies/avatar-sinhala-subtitles/',
    poster: 'https://cinesubz.net/images/avatar.jpg'
};
const details = {
    title: 'Avatar (2009)', year: '2009', quality: 'BluRay', director: '',
    genres: ['Action', 'Adventure'], cast: ['Sam Worthington'], imdb: 'tt0499549',
    description: 'Description de test.', poster: '', pageUrl: movie.url,
    downloads: [{ label: '720p', quality: '720p', size: '2 GB', portalUrl: 'https://cinesubz.net/zt-links/test123/' }]
};

function mockSocket() {
    const sent = [];
    return {
        sent,
        sock: { sendMessage: async (...args) => { sent.push(args); return {}; } }
    };
}

function response(payload, { status = 200, url = '' } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        url,
        headers: { get: () => null },
        text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload)
    };
}

function createMessage(text, sender = 'user@s.whatsapp.net') {
    return { key: { remoteJid: 'chat@g.us', participant: sender }, message: { conversation: text } };
}

function resultMovies(movies = [movie], page = 1) {
    return { query: 'Avatar', page, movies };
}

async function run(command, client, message, commandText) {
    const instance = createMovieCommand({ client });
    const { sock, sent } = mockSocket();
    await instance.handle(sock, 'chat@g.us', message || createMessage(commandText), commandText);
    return { sent, instance, client };
}

test('recherche valide affiche titre, année dérivée du titre et liens présents', async () => {
    const client = { searchMovies: async () => resultMovies() };
    const { sent } = await run('', client, createMessage('.movie Avatar'), '.movie Avatar');
    const output = sent.map((call) => call[1].text).join('\n');
    assert.match(output, /Avatar \(2009\)/);
    assert.match(output, /Année : 2009/);
    assert.match(output, /https:\/\/cinesubz\.net\/movies\/avatar-sinhala-subtitles\//);
    assert.match(output, /Affiche/);
});

test('recherche sans résultat est traitée sans inventer de contenu', async () => {
    const client = { searchMovies: async () => resultMovies([]) };
    const { sent } = await run('', client, createMessage('.movie introuvable'), '.movie introuvable');
    assert.match(sent.at(-1)[1].text, /Aucun résultat/);
});

test('caractères spéciaux et espaces sont encodés dans q via URLSearchParams', async () => {
    let requested;
    const client = createCineSubzClient({ fetchImpl: async (url) => { requested = new URL(url); return response({ status: true, result: { movies: [] } }); } });
    await client.searchMovies('Amélie & les autres?', 2);
    assert.equal(requested.searchParams.get('q'), 'Amélie & les autres?');
    assert.equal(requested.searchParams.get('page'), '2');
    assert.equal(requested.searchParams.get('limit'), '10');
});

test('consultation des détails affiche les champs réellement fournis', async () => {
    const client = {
        searchMovies: async () => resultMovies(),
        getMovieDetails: async () => details
    };
    const instance = createMovieCommand({ client });
    const { sock, sent } = mockSocket();
    await instance.handle(sock, 'chat@g.us', createMessage('.movie Avatar'), '.movie Avatar');
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.movieinfo 1'), '.movieinfo 1');
    const output = sent.at(-1)[1].text;
    assert.match(output, /IMDb : tt0499549/);
    assert.match(output, /Qualité : BluRay/);
    assert.match(output, /Sam Worthington/);
});

test('navigation directe vers une page conserve la recherche', async () => {
    const requestedPages = [];
    const client = { searchMovies: async (_query, page) => { requestedPages.push(page); return resultMovies([movie], page); } };
    const instance = createMovieCommand({ client });
    const { sock, sent } = mockSocket();
    await instance.handle(sock, 'chat@g.us', createMessage('.movie Avatar'), '.movie Avatar');
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.moviepage 2'), '.moviepage 2');
    assert.deepEqual(requestedPages, [1, 2]);
    assert.match(sent.at(-1)[1].text, /Page : 2/);
});

test('navigation next et prev est prise en charge', async () => {
    const requestedPages = [];
    const client = { searchMovies: async (_query, page) => { requestedPages.push(page); return resultMovies([movie], page); } };
    const instance = createMovieCommand({ client });
    const { sock } = mockSocket();
    await instance.handle(sock, 'chat@g.us', createMessage('.movie Avatar'), '.movie Avatar');
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.moviepage next'), '.moviepage next');
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.moviepage prev'), '.moviepage prev');
    assert.deepEqual(requestedPages, [1, 2, 1]);
});

test('moviedl résout les liens renvoyés sans envoyer de fichier', async () => {
    const client = {
        searchMovies: async () => resultMovies(),
        getMovieDetails: async () => details,
        getDownloadLinks: async () => ({ downloadUrl: 'https://downloads.example/file.mp4', originalUrl: '', cdnUrl: '', telegramUrl: '' })
    };
    const instance = createMovieCommand({ client });
    const { sock, sent } = mockSocket();
    await instance.handle(sock, 'chat@g.us', createMessage('.movie Avatar'), '.movie Avatar');
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.moviedl 1'), '.moviedl 1');
    const output = sent.map((call) => call[1].text).join('\n');
    assert.match(output, /https:\/\/downloads\.example\/file\.mp4/);
    assert.equal(sent.some((call) => Object.hasOwn(call[1], 'video') || Object.hasOwn(call[1], 'document')), false);
});

test('API HTTP indisponible et JSON invalide produisent des erreurs contrôlées', async () => {
    const unavailable = createCineSubzClient({ fetchImpl: async () => response('server error', { status: 503 }) });
    await assert.rejects(() => unavailable.searchMovies('Avatar'), { code: 'HTTP_ERROR' });
    const invalidJson = createCineSubzClient({ fetchImpl: async () => response('{not-json') });
    await assert.rejects(() => invalidJson.searchMovies('Avatar'), { code: 'INVALID_JSON' });
});

test('délai d’attente API est signalé sans bloquer la commande', async () => {
    const timedOut = createCineSubzClient({
        timeoutMs: 10,
        fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })
    });
    await assert.rejects(() => timedOut.searchMovies('Avatar'), { code: 'TIMEOUT' });
});

test('redirection vers un hôte tiers est bloquée', async () => {
    const client = createCineSubzClient({
        fetchImpl: async () => ({ ...response('', { status: 302 }), headers: { get: (name) => name === 'location' ? 'https://127.0.0.1/private' : null } })
    });
    await assert.rejects(() => client.searchMovies('Avatar'), { code: 'UNSAFE_REDIRECT' });
});

test('URL utilisateur vers un domaine interne ou arbitraire est rejetée avant requête', async () => {
    for (const input of [
        'http://localhost/movies/test',
        'https://127.0.0.1/movies/test',
        'https://attacker.example/movies/test',
        'https://user:pass@cinesubz.net/movies/test',
        'https://cinesubz.net/zt-links/test'
    ]) {
        assert.throws(() => validateCineSubzUrl(input, 'movie'), { code: 'INVALID_URL' });
    }
    let called = false;
    const client = createCineSubzClient({ fetchImpl: async () => { called = true; return response({}); } });
    await assert.rejects(() => client.getMovieDetails('https://attacker.example/movies/test'), { code: 'INVALID_URL' });
    assert.equal(called, false);
});

test('commande incomplète et numéro hors résultats reçoivent un message explicite', async () => {
    const client = { searchMovies: async () => resultMovies([]) };
    const instance = createMovieCommand({ client });
    const { sock, sent } = mockSocket();
    await instance.handle(sock, 'chat@g.us', createMessage('.movieinfo'), '.movieinfo');
    assert.match(sent.at(-1)[1].text, /Utilisation/);
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.movie Avatar'), '.movie Avatar');
    await new Promise((resolve) => setTimeout(resolve, 720));
    await instance.handle(sock, 'chat@g.us', createMessage('.movieinfo 1'), '.movieinfo 1');
    assert.match(sent.at(-1)[1].text, /ne correspond pas/);
});

test('réponse avec enveloppe JSON inattendue est rejetée', async () => {
    const client = createCineSubzClient({ fetchImpl: async () => response({ result: { movies: [] } }) });
    await assert.rejects(() => client.searchMovies('Avatar'), { code: 'INVALID_RESPONSE' });
});
