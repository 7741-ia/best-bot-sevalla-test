'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatHandler } = require('../api/chat');

function harness() {
    const state = { status: 200, payload: null };
    const response = { status(code) { state.status = code; return this; }, json(payload) { state.payload = payload; return this; } };
    return { state, response };
}

function makeRequest({ method = 'POST', token = '', body = { prompt: 'salut' }, ip = '127.0.0.1', query = {} } = {}) {
    return { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body, query, socket: { remoteAddress: ip } };
}

const TEST_TOKEN = 'token-test-suffisamment-long';

test('endpoint fermé si CHAT_API_TOKEN manque', async () => {
    const handler = createChatHandler({ token: () => '', ask: async () => 'inattendu' });
    const { state, response } = harness();
    await handler(makeRequest(), response);
    assert.equal(state.status, 503);
});

test('refuse un bearer token absent ou incorrect avant d’appeler un fournisseur', async () => {
    let calls = 0;
    const handler = createChatHandler({ token: () => TEST_TOKEN, ask: async () => { calls += 1; return 'ok'; } });
    const { state, response } = harness();
    await handler(makeRequest(), response);
    assert.equal(state.status, 401);
    assert.equal(calls, 0);
});

test('accepte une requête POST autorisée avec un fournisseur factice', async () => {
    const handler = createChatHandler({ token: () => TEST_TOKEN, ask: async (prompt) => `réponse:${prompt}` });
    const { state, response } = harness();
    await handler(makeRequest({ token: TEST_TOKEN }), response);
    assert.equal(state.status, 200);
    assert.equal(state.payload.data, 'réponse:salut');
});

test('rejette les méthodes non supportées et les prompts trop longs', async () => {
    const handler = createChatHandler({ token: () => TEST_TOKEN, ask: async () => 'ok' });
    const wrongMethod = harness();
    await handler(makeRequest({ method: 'DELETE', token: TEST_TOKEN }), wrongMethod.response);
    assert.equal(wrongMethod.state.status, 405);
    const tooLong = harness();
    await handler(makeRequest({ token: TEST_TOKEN, body: { prompt: 'x'.repeat(4001) } }), tooLong.response);
    assert.equal(tooLong.state.status, 413);
});

test('limite les appels par adresse source', async () => {
    let now = 1000;
    const handler = createChatHandler({ token: () => TEST_TOKEN, ask: async () => 'ok', now: () => now });
    for (let index = 0; index < 20; index += 1) {
        const { response } = harness();
        await handler(makeRequest({ token: TEST_TOKEN }), response);
    }
    const limited = harness();
    await handler(makeRequest({ token: TEST_TOKEN }), limited.response);
    assert.equal(limited.state.status, 429);
    now += 60001;
    const afterWindow = harness();
    await handler(makeRequest({ token: TEST_TOKEN }), afterWindow.response);
    assert.equal(afterWindow.state.status, 200);
});
