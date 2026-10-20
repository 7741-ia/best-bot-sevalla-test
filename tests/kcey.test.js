// Tests KCEY.  Hors-ligne : node tests/kcey.test.js
// En ligne (clé requise dans .env) : node tests/kcey.test.js --live
require('dotenv').config();
const assert = require('assert');
const kcey = require('../lib/kcey');
const { buildProviders } = require('../lib/textProviders');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✅', name); } catch (e) { fails++; console.log('❌', name, '-', e.message); } };

(async () => {
    await t('parseAi (deepseek/overchat/chatgpt)', () => {
        assert.strictEqual(kcey.parseAi({ ok: true, response: ' salut ' }), 'salut');
        assert.throws(() => kcey.parseAi({ response: '' }));
    });
    await t('parseYtmp3', () => {
        assert.strictEqual(kcey.parseYtmp3({ download: 'http://a/b.mp3', title: 'T' }).url, 'http://a/b.mp3');
        assert.strictEqual(kcey.parseYtmp3({ raw: { BK9: { downloadUrl: 'http://x' } } }).url, 'http://x');
        assert.throws(() => kcey.parseYtmp3({}));
    });
    await t('parseTiktok', () => {
        assert.strictEqual(kcey.parseTiktok({ play: 'p', hdplay: 'h' }).url, 'h');
        assert.strictEqual(kcey.parseTiktok({ play: 'p' }).url, 'p');
        assert.throws(() => kcey.parseTiktok({}));
    });
    await t('KCEY ajouté au pool texte quand la clé existe', () => {
        const old = process.env.KCEY_API_KEY; process.env.KCEY_API_KEY = 'x';
        const p = buildProviders().find((q) => q.name === 'kcey');
        process.env.KCEY_API_KEY = old;
        assert.ok(p && p.models.length >= 1);
    });

    if (process.argv.includes('--live')) {
        if (!kcey.hasKey()) { console.log('❌ KCEY_API_KEY absente'); process.exit(1); }
        for (const ep of kcey.AI_ENDPOINTS()) {
            await t(`LIVE ia/${ep}`, async () => { const r = await kcey.ai(ep, 'Réponds juste: ok'); assert.ok(r.length > 0); console.log('   →', r.slice(0, 80)); });
        }
        await t('LIVE ytmp3', async () => { const r = await kcey.ytmp3('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); assert.ok(r.url); });
        await t('LIVE tiktok', async () => { const r = await kcey.tiktok(process.env.KCEY_TEST_TIKTOK || 'https://www.tiktok.com/@tiktok/video/7106594312292453675'); assert.ok(r.url); });
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
    process.exit(fails ? 1 : 0);
})();
