'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const memory = require('../lib/assistantMemory');
const stickers = require('../lib/stickerLibrary');

function withTempStorage(t) {
    const previous = process.env.BESTBOT_MEMORY_DIR;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-sticker-test-'));
    process.env.BESTBOT_MEMORY_DIR = dir;
    t.after(() => {
        if (previous === undefined) delete process.env.BESTBOT_MEMORY_DIR;
        else process.env.BESTBOT_MEMORY_DIR = previous;
        fs.rmSync(dir, { recursive: true, force: true });
    });
    return dir;
}

test('normalizes only whitelisted sticker categories', () => {
    assert.equal(stickers.normalizeCategory('célébration'), 'celebration');
    assert.equal(stickers.normalizeCategory('Bonjour'), 'salutations');
    assert.equal(stickers.normalizeCategory('../../etc'), null);
});

test('suggests a contextual category cautiously and suppresses serious situations', () => {
    assert.equal(stickers.suggestCategory('Cette blague est trop drôle 😂'), 'rire');
    assert.equal(stickers.suggestCategory('Bravo pour ton diplôme !'), 'celebration');
    assert.equal(stickers.suggestCategory('Je suis désolé pour le décès de ton proche'), null);
    assert.equal(stickers.suggestCategory('Un sticker ambigu'), null);
});

test('automatic sending defaults off and does not send without imported local assets', async (t) => {
    withTempStorage(t);
    assert.equal(stickers.getConfig().enabled, false);
    stickers.configure({ enabled: true });
    let sends = 0;
    const sent = await stickers.sendSuggestedSticker({ sendMessage: async () => { sends += 1; } }, '243111111111@s.whatsapp.net', 'rire');
    assert.equal(sent, false);
    assert.equal(sends, 0);
});

test('enforces persistent global cooldown and daily limit for an imported local WebP', async (t) => {
    const root = withTempStorage(t);
    stickers.configure({ enabled: true, cooldownMinutes: 15, dailyMax: 1, lastSentAt: 0, dailyDate: '', dailyCount: 0 });
    const storage = memory.getStorageDirectory();
    const stickerDir = path.join(storage, 'sticker-library', 'rire');
    fs.mkdirSync(stickerDir, { recursive: true });
    const id = 'abcdef123456';
    const webp = Buffer.alloc(20);
    webp.write('RIFF', 0, 'ascii');
    webp.writeUInt32LE(12, 4);
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8X', 12, 'ascii');
    fs.writeFileSync(path.join(stickerDir, `${id}.webp`), webp);
    fs.writeFileSync(path.join(storage, 'sticker-library', 'catalog.json'), JSON.stringify({ items: [{ id, category: 'rire', path: `rire/${id}.webp` }] }));
    let sends = 0;
    const sock = { sendMessage: async (chatId, payload) => { sends += 1; assert.equal(payload.sticker.toString('ascii', 8, 12), 'WEBP'); } };
    assert.equal(await stickers.sendSuggestedSticker(sock, '243111111111@s.whatsapp.net', 'rire'), true);
    assert.equal(await stickers.sendSuggestedSticker(sock, '243222222222@s.whatsapp.net', 'rire'), false);
    assert.equal(sends, 1);
    assert.equal(stickers.getConfig().dailyCount, 1);
    assert.ok(fs.existsSync(root));
});
