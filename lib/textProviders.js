// lib/textProviders.js
// Pool de fournisseurs "OpenAI-compatible" avec bascule automatique.
// Ordre par défaut : NVIDIA -> xKiro -> Groq (seuls ceux qui ont une clé dans .env sont utilisés).
// Quand un fournisseur/modèle est limité (429), en panne (5xx/timeout) ou refuse la clé (401/403),
// il est mis en pause quelques instants et on passe IMMÉDIATEMENT au suivant.

const axios = require('axios');
const kcey = require('./kcey');

// ---------- Pauses (cooldowns) ----------
const cooldowns = new Map(); // clé -> timestamp de fin de pause
const keyOf = (provider, model = '') => `${provider}|${model}`;

function coolUntil(key) {
    const until = cooldowns.get(key);
    if (!until) return 0;
    if (Date.now() >= until) { cooldowns.delete(key); return 0; }
    return until;
}
function setCooldown(key, ms) { cooldowns.set(key, Date.now() + ms); }

function isCoolingDown(provider, model = '') {
    return coolUntil(keyOf(provider)) > 0 || (model && coolUntil(keyOf(provider, model)) > 0);
}
function markLimited(provider, model, ms = 45000) { setCooldown(keyOf(provider, model), ms); }

// ---------- Config ----------
const list = (value, fallback = '') =>
    String(value || fallback).split(',').map((s) => s.trim()).filter(Boolean);

function buildProviders() {
    const all = {};

    if (process.env.NVIDIA_API_KEY) {
        all.nvidia = {
            name: 'nvidia',
            key: process.env.NVIDIA_API_KEY,
            baseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
            discover: process.env.NVIDIA_AUTO_MODELS !== '0',
            timeout: Number(process.env.NVIDIA_TIMEOUT_MS) || 25000,
            models: list(
                process.env.NVIDIA_MODEL_TEXT,
                'meta/llama-3.3-70b-instruct,nvidia/llama-3.3-nemotron-super-49b-v1.5,nvidia/nvidia-nemotron-nano-9b-v2'
            ),
        };
    }

    if (process.env.XKIRO_API_KEY && process.env.XKIRO_BASE_URL) {
        all.xkiro = {
            name: 'xkiro',
            key: process.env.XKIRO_API_KEY,
            baseUrl: process.env.XKIRO_BASE_URL.replace(/\/+$/, ''),
            timeout: Number(process.env.XKIRO_TIMEOUT_MS) || 45000,
            // XKIRO_MODEL_TEXT accepte une liste séparée par des virgules
            models: [
                ...list(process.env.XKIRO_MODEL_TEXT, 'qwen/qwen3.5-flash:free'),
                ...list(process.env.XKIRO_MODEL_TEXT_FALLBACKS),
            ],
        };
    }

    if (process.env.GROQ_API_KEY) {
        all.groq = {
            name: 'groq',
            key: process.env.GROQ_API_KEY,
            baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
            timeout: Number(process.env.GROQ_TIMEOUT_MS) || 15000,
            models: list(process.env.GROQ_MODEL_TEXT, 'llama-3.3-70b-versatile'),
        };
    }

    if (process.env.TOKENHARBOR_API_KEY) {
        // Passerelle OpenAI-compatible (https://tokenharbor.ai/docs) : POST /v1/chat/completions, Authorization: Bearer thk_live_…
        all.tokenharbor = {
            name: 'tokenharbor',
            key: process.env.TOKENHARBOR_API_KEY,
            baseUrl: (process.env.TOKENHARBOR_BASE_URL || 'https://tokenharbor.ai/v1').replace(/\/+$/, ''),
            discover: process.env.TOKENHARBOR_AUTO_MODELS !== '0', // lit GET /v1/models et garde les modèles de chat
            models: list(process.env.TOKENHARBOR_MODEL_TEXT, 'tokenharbor/qwen3-max'),
        };
    }

    if (kcey.hasKey()) {
        all.kcey = { name: 'kcey', type: 'kcey', key: process.env.KCEY_API_KEY, models: kcey.AI_ENDPOINTS(), timeout: 30000 };
    }

    const order = list(process.env.TEXT_PROVIDER_ORDER, 'nvidia,xkiro,groq');
    // Fournisseurs de secours ajoutés automatiquement (dans cet ordre) si leur clé existe.
    for (const extra of ['tokenharbor', 'kcey']) if (all[extra] && !order.includes(extra)) order.push(extra);
    return order.map((name) => all[name]).filter(Boolean);
}


// ---------- Découverte des modèles disponibles (NVIDIA retire régulièrement des modèles : 404/410) ----------
const discoveryCache = new Map(); // provider -> { at, models }
const DISCOVERY_TTL = 6 * 60 * 60 * 1000;
const NOT_CHAT = /embed|rerank|retriev|guard|safety|reward|clip|whisper|parakeet|canary|tts|riva|vision|vlm|-vl|image|diffusion|flux|sdxl|stable|cosmos|nemoguard|genmol|bio|molmim|paddle|ocr|translate|audio|speech|fuyu|neva|kosmos|deplot|nv-/i;
const PRIORITY = [/nemotron-3.*super/i, /nemotron-3.*nano/i, /llama-3\.3-70b/i, /llama-3\.1-70b/i, /kimi/i, /qwen/i, /deepseek/i, /mistral|mixtral/i, /gemma/i, /llama/i];

async function discoverModels(provider, configured) {
    const cached = discoveryCache.get(provider.name);
    if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.models;
    try {
        const res = await axios.get(`${provider.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${provider.key}` },
            timeout: 10000,
        });
        const ids = (res.data?.data || []).map((m) => m.id).filter(Boolean);
        if (!ids.length) throw new Error('liste vide');
        const available = new Set(ids);
        const chosen = configured.filter((id) => available.has(id));
        const chat = ids.filter((id) => !NOT_CHAT.test(id) && !chosen.includes(id));
        for (const re of PRIORITY) {
            for (const id of chat.filter((m) => re.test(m))) {
                if (chosen.length >= 4) break;
                if (!chosen.includes(id)) chosen.push(id);
            }
        }
        const models = chosen.slice(0, 4);
        if (!models.length) throw new Error('aucun modèle de chat reconnu');
        console.log(`[textProviders] ${provider.name}: modèles disponibles -> ${models.join(', ')}`);
        discoveryCache.set(provider.name, { at: Date.now(), models });
        return models;
    } catch (error) {
        console.error(`[textProviders] ${provider.name}: impossible de lister les modèles (${error?.response?.status || error.message}), utilisation de la config`);
        discoveryCache.set(provider.name, { at: Date.now() - DISCOVERY_TTL + 10 * 60 * 1000, models: configured }); // on réessaie dans 10 min
        return configured;
    }
}

// ---------- Nettoyage de la réponse ----------
function cleanModelText(text) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^[\s\S]*?<\/think>/i, '')      // </think> orphelin
        .replace(/<think>[\s\S]*$/i, '')          // <think> jamais fermé
        .trim();
}

function extractContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
        ? content.map((part) => part?.text || '').join('')
        : String(content || '');
    return cleanModelText(text);
}

function retryAfterMs(error, fallback) {
    const header = error?.response?.headers?.['retry-after'];
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 5 * 60 * 1000);
    return fallback;
}

// ---------- Appel d'un modèle ----------
async function callModel(provider, model, messages, { maxTokens, temperature, timeout }) {
    if (provider.type === 'kcey') {
        // KCEY n'accepte qu'un `prompt` texte : on aplatit la conversation.
        const prompt = messages.map((m) => {
            const c = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map((p) => p.text || '').join(' ') : '');
            return m.role === 'system' ? `[Instructions] ${c}` : (m.role === 'assistant' ? `Assistant: ${c}` : `Utilisateur: ${c}`);
        }).join('\n').slice(-6000);
        return kcey.ai(model, prompt, timeout);
    }
    const url = `${provider.baseUrl}/chat/completions`;
    const headers = { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' };

    // Les modèles Nemotron raisonnent par défaut : on coupe le raisonnement pour répondre vite.
    let msgs = messages;
    if (/nemotron/i.test(model)) {
        msgs = messages.map((m, i) => (i === 0 && m.role === 'system' && typeof m.content === 'string')
            ? { ...m, content: `${m.content}\n/no_think` }
            : m);
    }

    const variants = [
        { model, messages: msgs, temperature, max_tokens: maxTokens, stream: false },
        { model, messages: msgs, max_tokens: maxTokens, stream: false },   // si un paramètre est refusé
    ];

    let lastError;
    for (const body of variants) {
        try {
            const res = await axios.post(url, body, { headers, timeout });
            const text = extractContent(res.data);
            if (!text) throw Object.assign(new Error('empty completion'), { code: 'EMPTY' });
            return text;
        } catch (error) {
            lastError = error;
            const status = error?.response?.status;
            if (status !== 400 && status !== 422) break; // seules les erreurs de paramètres méritent un 2e essai
        }
    }
    throw lastError;
}

// ---------- API publique ----------
/**
 * Essaie chaque fournisseur/modèle dans l'ordre, passe au suivant dès qu'il y a un problème.
 * @param {Array} messages  [{role, content}]
 * @param {Object} opts     { maxTokens, temperature, attemptTimeout, deadlineMs, validate(text)->bool }
 * @returns {Promise<{text, provider, model}>}
 */
async function chatWithFailover(messages, opts = {}) {
    const {
        maxTokens = 800,
        temperature = 0.8,
        attemptTimeout = 0,
        deadlineMs = 85000,
        validate = null,
    } = opts;

    const providers = buildProviders();
    if (!providers.length) throw new Error('No text provider configured (NVIDIA_API_KEY / XKIRO_API_KEY / GROQ_API_KEY / TOKENHARBOR_API_KEY / KCEY_API_KEY)');

    const startedAt = Date.now();
    const failures = [];

    // Jusqu'à 2 passes : si tout est en pause très brièvement, on attend puis on réessaie.
    for (let pass = 0; pass < 2; pass += 1) {
        let soonestWake = Infinity;
        let tried = 0;

        for (const provider of providers) {
            const models = provider.discover ? await discoverModels(provider, provider.models) : provider.models;
            for (const model of models) {
                if (Date.now() - startedAt > deadlineMs) {
                    throw new Error(`All providers failed (deadline): ${failures.join(' | ')}`);
                }
                const providerWake = coolUntil(keyOf(provider.name));
                const modelWake = coolUntil(keyOf(provider.name, model));
                const wake = Math.max(providerWake, modelWake);
                if (wake) { soonestWake = Math.min(soonestWake, wake); continue; }

                tried += 1;
                try {
                    const text = await callModel(provider, model, messages, { maxTokens, temperature, timeout: attemptTimeout || provider.timeout || 25000 });
                    if (validate && !validate(text)) {
                        failures.push(`${provider.name}/${model}: unusable reply`);
                        setCooldown(keyOf(provider.name, model), 10000);
                        continue;
                    }
                    console.log(`[textProviders] OK ${provider.name}/${model}`);
                    return { text, provider: provider.name, model };
                } catch (error) {
                    const status = error?.response?.status;
                    const detail = status || error.code || error.message;
                    failures.push(`${provider.name}/${model}: ${detail}`);
                    console.error(`[textProviders] ${provider.name}/${model} -> ${detail}, on passe au suivant`);

                    if (status === 429) {
                        setCooldown(keyOf(provider.name, model), retryAfterMs(error, 45000));
                    } else if (status === 401 || status === 403) {
                        setCooldown(keyOf(provider.name), 10 * 60 * 1000);   // clé invalide : on laisse tranquille ce fournisseur
                        break;
                    } else if (status === 404 || status === 410) {
                        setCooldown(keyOf(provider.name, model), 6 * 60 * 60 * 1000); // modèle retiré : inutile de réessayer avant des heures
                        discoveryCache.delete(provider.name);                         // on relit la liste des modèles disponibles
                    } else if (!status && /timeout|ECONNABORTED|ETIMEDOUT/i.test(`${error.code} ${error.message}`)) {
                        setCooldown(keyOf(provider.name, model), 5000);      // lenteur ponctuelle : courte pause seulement
                    } else {
                        setCooldown(keyOf(provider.name, model), 20000);     // 5xx, réseau
                    }
                }
            }
        }

        // Rien d'essayé car tout est en pause : si ça se libère bientôt, on attend un peu.
        if (tried === 0 && Number.isFinite(soonestWake)) {
            const wait = soonestWake - Date.now();
            if (wait > 0 && wait <= 10000 && Date.now() - startedAt + wait < deadlineMs) {
                await new Promise((resolve) => setTimeout(resolve, wait + 100));
                continue;
            }
        }
        break;
    }

    throw new Error(`All providers failed: ${failures.join(' | ') || 'all in cooldown'}`);
}

module.exports = { chatWithFailover, isCoolingDown, markLimited, buildProviders };
