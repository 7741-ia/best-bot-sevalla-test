'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MultiSessionStore } = require('../lib/multisession-store');
const { MultiSessionManager, createServer, hashToken, normalizePhone, tokenMatches } = require('../index');

const TEST_ID = '8e1f35c0-489b-4ec0-8bb1-70fd05891c2a';

function withTestEnvironment(fn) {
    const keys = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'OWNER_NUMBER', 'MULTISESSION_DATA_DIR', 'NODE_ENV'];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
        ADMIN_USERNAME: 'test-admin',
        ADMIN_PASSWORD: 'Test-Only-Password-9f3a',
        ADMIN_SESSION_SECRET: 'test-only-session-secret-'.repeat(3),
        OWNER_NUMBER: '243859886065',
        MULTISESSION_DATA_DIR: '',
        NODE_ENV: 'test',
    });
    return Promise.resolve().then(fn).finally(() => {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
}

test('normalise les numéros internationaux sans conserver les séparateurs', () => {
    assert.equal(normalizePhone('+243 859 886 065'), '243859886065');
    assert.equal(normalizePhone('243-859-886-065'), '243859886065');
    assert.equal(normalizePhone('1234567'), null);
    assert.equal(normalizePhone('abcdefgh'), null);
    assert.equal(normalizePhone('1234567890123456'), null);
});

test('le frontend distingue les erreurs de limite, session active et connexion interrompue', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'public.js'), 'utf8');
    assert.match(source, /Trop de tentatives rapprochées/);
    assert.match(source, /Une tentative est déjà en cours/);
    assert.match(source, /connexion WhatsApp a été interrompue/);
});

test('hachage de jeton : seul le jeton d’origine correspond', () => {
    const hash = hashToken('token-test-opaque');
    assert.equal(tokenMatches(hash, 'token-test-opaque'), true);
    assert.equal(tokenMatches(hash, 'autre-token'), false);
    assert.equal(tokenMatches('', 'token-test-opaque'), false);
});

test('registre multi-session : création, mise à jour atomique et persistance', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-store-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = new MultiSessionStore(directory);
    store.create({ id: TEST_ID, phone: '243859886065', publicTokenHash: 'a'.repeat(64) });
    store.update(TEST_ID, { status: 'connected', linkedNumber: '243859886065', lastError: '' });
    const reopened = new MultiSessionStore(directory);
    const record = reopened.get(TEST_ID);
    assert.equal(record.phone, '243859886065');
    assert.equal(record.status, 'connected');
    assert.equal(record.linkedNumber, '243859886065');
    assert.equal(record.publicTokenHash, 'a'.repeat(64));
    assert.equal(Object.hasOwn(record, 'pairingCode'), false);
    assert.equal(reopened.remove(TEST_ID), true);
    assert.equal(reopened.get(TEST_ID), null);
    assert.equal(reopened.remove(TEST_ID), false);
});

test('suppression admin : refuse un compte actif et efface une fiche déconnectée', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-delete-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const manager = new MultiSessionManager({ dataRoot: directory, maxSessions: 5 });
    manager.store.create({ id: TEST_ID, phone: '243859886065', publicTokenHash: 'b'.repeat(64) });
    manager.store.update(TEST_ID, { status: 'connected' });
    const sessionDirectory = path.join(directory, 'sessions', TEST_ID);
    fs.mkdirSync(sessionDirectory, { recursive: true });
    fs.writeFileSync(path.join(sessionDirectory, 'saved-data.json'), '{}');

    const storage = manager.storageStats();
    assert.equal(storage.available, true);
    assert.ok(storage.totalBytes > 0);
    assert.equal(manager.deleteDisconnected(TEST_ID), false);
    assert.ok(fs.existsSync(sessionDirectory));

    manager.store.update(TEST_ID, { status: 'disconnected' });
    assert.equal(manager.deleteDisconnected(TEST_ID), true);
    assert.equal(manager.store.get(TEST_ID), null);
    assert.equal(fs.existsSync(sessionDirectory), false);
    assert.equal(manager.deleteDisconnected(TEST_ID), false);
});

test('serveur HTTP : pages, authentification admin, CSRF et jeton public d’appairage', async (t) => {
    await withTestEnvironment(async () => {
        const stored = { id: TEST_ID, status: 'pairing' };
        let tokenHash = '';
        let disconnectedId = '';
        let deletedId = '';
        const manager = {
            maxSessions: 10,
            store: { get: (id) => id === TEST_ID ? stored : null },
            publicSessionCount: () => 1,
            storageStats: () => ({ available: true, usedBytes: 256, totalBytes: 1024, freeBytes: 768 }),
            createPairing: async (phone, hash) => { tokenHash = hash; assert.equal(phone, '243859886065'); return TEST_ID; },
            getPublicStatus: (id, token) => id === TEST_ID && tokenMatches(tokenHash, token) ? ({ id, phone: '243859886065', status: 'pairing', pairingCode: 'ABCD-1234', codeExpiresAt: Date.now() + 30000, lastError: '' }) : null,
            cancelPairing: async (id, token) => id === TEST_ID && tokenMatches(tokenHash, token),
            listAdminSessions: () => [{ id: TEST_ID, phone: '243859886065', status: 'pairing', createdAt: Date.now(), updatedAt: Date.now(), lastError: '', retryCount: 0 }],
            disconnect: async (id) => { disconnectedId = id; return true; },
            restart: async () => true,
            deleteDisconnected: (id) => { if (id !== TEST_ID || stored.status !== 'disconnected') return false; deletedId = id; return true; },
        };
        const { server } = createServer(manager);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        t.after(() => new Promise((resolve) => server.close(resolve)));
        const base = `http://127.0.0.1:${server.address().port}`;

        const home = await fetch(`${base}/`);
        assert.equal(home.status, 200);
        assert.match(await home.text(), /Bienvenue dans/);
        assert.equal((await fetch(`${base}/style.css`)).status, 200);
        assert.equal((await fetch(`${base}/public.js`)).status, 200);
        assert.equal((await fetch(`${base}/Best_bot_admin`)).status, 200);
        assert.equal((await fetch(`${base}/api/admin/sessions`)).status, 401);

        const badPhone = await fetch(`${base}/api/pairings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: 'abc' }) });
        assert.equal(badPhone.status, 400);
        const pairResponse = await fetch(`${base}/api/pairings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+243 859 886 065' }) });
        assert.equal(pairResponse.status, 201);
        const pair = await pairResponse.json();
        assert.ok(pair.token);
        const publicStatus = await fetch(`${base}/api/pairings/${TEST_ID}`, { headers: { authorization: `Bearer ${pair.token}` } });
        assert.equal(publicStatus.status, 200);
        assert.equal((await publicStatus.json()).pairingCode, 'ABCD-1234');
        const wrongToken = await fetch(`${base}/api/pairings/${TEST_ID}`, { headers: { authorization: 'Bearer wrong' } });
        assert.equal(wrongToken.status, 404);
        const wrongCancel = await fetch(`${base}/api/pairings/${TEST_ID}/cancel`, { method: 'POST', headers: { authorization: 'Bearer wrong' } });
        assert.equal(wrongCancel.status, 404);
        const cancel = await fetch(`${base}/api/pairings/${TEST_ID}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${pair.token}` } });
        assert.equal(cancel.status, 202);

        const loginResponse = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'test-admin', password: 'Test-Only-Password-9f3a' }) });
        assert.equal(loginResponse.status, 200);
        const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
        const login = await loginResponse.json();
        const me = await fetch(`${base}/api/admin/me`, { headers: { cookie } });
        assert.equal(me.status, 200);
        const sessions = await fetch(`${base}/api/admin/sessions`, { headers: { cookie } });
        assert.equal(sessions.status, 200);
        const sessionData = await sessions.json();
        assert.equal(sessionData.sessions.length, 1);
        assert.equal(sessionData.storage.totalBytes, 1024);

        const noCsrf = await fetch(`${base}/api/admin/sessions/${TEST_ID}/disconnect`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
        assert.equal(noCsrf.status, 403);
        const withCsrf = await fetch(`${base}/api/admin/sessions/${TEST_ID}/disconnect`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': login.csrfToken, origin: base }, body: '{}' });
        assert.equal(withCsrf.status, 202);
        assert.equal(disconnectedId, TEST_ID);

        const deleteActive = await fetch(`${base}/api/admin/sessions/${TEST_ID}/delete`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': login.csrfToken, origin: base }, body: '{}' });
        assert.equal(deleteActive.status, 409);
        stored.status = 'disconnected';
        const deleteNoCsrf = await fetch(`${base}/api/admin/sessions/${TEST_ID}/delete`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
        assert.equal(deleteNoCsrf.status, 403);
        const deleteDisconnected = await fetch(`${base}/api/admin/sessions/${TEST_ID}/delete`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': login.csrfToken, origin: base }, body: '{}' });
        assert.equal(deleteDisconnected.status, 200);
        assert.equal(deletedId, TEST_ID);
    });
});
