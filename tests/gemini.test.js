// Test réel Gemini : node tests/gemini.test.js   (clé GEMINI_API_KEY dans .env)
require('dotenv').config();
const axios = require('axios');
const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('❌ GEMINI_API_KEY absente'); process.exit(1); }
const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
let model = (process.env.GEMINI_MODEL_TEXT || '').trim();
(async () => {
    let ok = true;
    try {
        const r = await axios.get(`${base}/models`, { params: { pageSize: 200 }, headers, timeout: 20000 });
        const names = (r.data?.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
        const flash = names.filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n)).sort().reverse();
        console.log(`✅ Clé acceptée — ${names.length} modèles. Flash disponibles :`, flash.join(', ') || '(aucun)');
        if (!model) model = flash.find((n) => !n.endsWith('-lite')) || 'gemini-3.5-flash';
    } catch (e) { ok = false; model = model || 'gemini-3.5-flash'; console.log('❌ liste des modèles :', e.response?.status || e.code || e.message); }
    try {
        const r = await axios.post(`${base}/models/${model}:generateContent`, {
            contents: [{ parts: [{ text: 'Réponds juste: ok' }] }],
            generationConfig: { maxOutputTokens: 200 },
        }, { headers, timeout: 30000 });
        console.log(`✅ Texte ${model} →`, String(r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().slice(0, 60));
    } catch (e) { ok = false; console.log('❌ texte :', e.response?.status || e.code || e.message, e.response?.data?.error?.message || ''); }
    const ttsModels = String(process.env.GEMINI_MODEL_TTS || 'gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-flash-tts').split(',').map((m) => m.trim());
    let voiceOk = false;
    for (const ttsModel of ttsModels) {
        try {
            const r = await axios.post(`${base}/models/${ttsModel}:generateContent`, {
                contents: [{ parts: [{ text: 'Bonjour, ceci est un test.' }] }],
                generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || 'Kore' } } } },
            }, { headers, timeout: 60000 });
            const has = (r.data?.candidates?.[0]?.content?.parts || []).some((p) => p?.inlineData?.data);
            console.log(has ? `✅ Voix ${ttsModel}` : `⚠️ voix ${ttsModel} : pas d'audio reçu`);
            if (has) { voiceOk = true; break; }
        } catch (e) { console.log(`⚠️ voix ${ttsModel} :`, e.response?.status || e.code || e.message, String(e.response?.data?.error?.message || '').slice(0, 100)); }
    }
    if (!voiceOk) console.log('ℹ️ Aucune voix Gemini disponible : le bot utilisera gTTS (ou mets GEMINI_TTS=0).');
    process.exit(ok ? 0 : 1);
})();
