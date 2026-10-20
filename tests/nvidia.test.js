// Test réel NVIDIA : node tests/nvidia.test.js   (clé NVIDIA_API_KEY dans .env)
require('dotenv').config();
const axios = require('axios');
const base = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
const key = process.env.NVIDIA_API_KEY;
if (!key) { console.log('❌ NVIDIA_API_KEY absente'); process.exit(1); }
const headers = { Authorization: `Bearer ${key}` };
(async () => {
    let ok = true;
    try {
        const r = await axios.get(`${base}/models`, { headers, timeout: 20000 });
        console.log(`✅ Clé acceptée — ${r.data?.data?.length || 0} modèles disponibles`);
    } catch (e) { ok = false; console.log('❌ /models :', e.response?.status || e.code || e.message); }
    try {
        const model = (process.env.NVIDIA_MODEL_TEXT || 'meta/llama-3.3-70b-instruct').split(',')[0].trim();
        const r = await axios.post(`${base}/chat/completions`, { model, messages: [{ role: 'user', content: 'Réponds juste: ok' }], max_tokens: 20 }, { headers, timeout: 30000 });
        console.log(`✅ Chat ${model} →`, String(r.data?.choices?.[0]?.message?.content || '').trim().slice(0, 60));
    } catch (e) { ok = false; console.log('❌ chat :', e.response?.status || e.code || e.message); }
    process.exit(ok ? 0 : 1);
})();
