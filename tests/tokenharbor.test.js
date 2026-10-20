// node tests/tokenharbor.test.js  — test réel TokenHarbor (clé TOKENHARBOR_API_KEY dans .env)
require('dotenv').config();
const axios = require('axios');
const base = (process.env.TOKENHARBOR_BASE_URL || 'https://tokenharbor.ai/v1').replace(/\/+$/, '');
const key = process.env.TOKENHARBOR_API_KEY;
if (!key) { console.log('❌ TOKENHARBOR_API_KEY absente'); process.exit(1); }
const headers = { Authorization: `Bearer ${key}` };
(async () => {
    let ok = true, model = (process.env.TOKENHARBOR_MODEL_TEXT || 'tokenharbor/qwen3-max').split(',')[0].trim();
    try {
        const r = await axios.get(`${base}/models`, { headers, timeout: 20000 });
        const ids = (r.data?.data || []).map((m) => m.id);
        console.log(`✅ Clé acceptée — ${ids.length} modèles (ex. ${ids.slice(0, 5).join(', ')})`);
        if (ids.length && !ids.includes(model)) { console.log(`⚠️ ${model} absent de la liste, test avec ${ids[0]}`); model = ids[0]; }
    } catch (e) { ok = false; console.log('❌ /models :', e.response?.status || e.code || e.message); }
    try {
        const r = await axios.post(`${base}/chat/completions`, { model, messages: [{ role: 'user', content: 'Réponds juste: ok' }], max_tokens: 30 }, { headers, timeout: 40000 });
        console.log(`✅ Chat ${model} →`, String(r.data?.choices?.[0]?.message?.content || '').trim().slice(0, 60));
    } catch (e) { ok = false; console.log('❌ chat :', e.response?.status || e.code || e.message, JSON.stringify(e.response?.data || '').slice(0, 200)); }
    process.exit(ok ? 0 : 1);
})();
