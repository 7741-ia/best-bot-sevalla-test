// lib/chatAiRouter.js
// Cerveau conversationnel : Digix (copilot / gpt / groq / webcopilot) + fallbacks gratuits puissants
// Cascade intelligente + nettoyage des réponses cassées + humanisation.

const axios = require('axios');
const { requestDigixText } = require('./digixApi');
const { isBadProviderReply } = require('./aiValidation');
const {
    BOT_NAME,
    BOT_CREATOR,
    detectEmotion,
    EMOTION_INSTRUCTIONS,
    humanizeReply,
    identityAnswer,
    needsDetailedAnswer
} = require('./humanizer');

function normalizeReplyText(text) {
    return humanizeReply(
        String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

/** Nettoyage léger. Le rejet du texte mélangé est fait par isBadProviderReply. */
function cleanGarbledReply(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\*\*/g, '')
        .replace(/#{1,6}\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/([a-zàâäéèêëïîôùûüç])([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ])/g, '$1 $2')
        .replace(/([.!?])([A-Za-zÀ-ÿ])/g, '$1 $2')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/U0001F[0-9A-F]{2,3}/gi, '')
        .trim();
}

function looksLikeCodeRequest(text) {
    const raw = String(text || '').trim();
    const asksToCreate = /\b(écris|ecris|crée|cree|génère|genere|donne[- ]moi|montre[- ]moi|code|programme|script|fonction|function|build|write|generate)\b/i.test(raw);
    const mentionsTech = /\b(html|css|javascript|typescript|python|php|react|node(?:\.js)?|sql|java|c\+\+|api|regex)\b/i.test(raw);
    return asksToCreate && mentionsTech;
}

function isSensitiveRequest(text) {
    return /(\bhack\b|\bhacking\b|\bpentest\b|\bnmap\b|\bexploit\b|\bphishing\b|\bpayload\b|\bmalware\b|\bvirus\b|\binjection\b|\bddos\b|\bcrack\b|\bkali\b|\bmetasploit\b|\bcyber)/i.test(String(text || ''));
}

function buildAssistantPrompt(userMessage, options = {}) {
    const personaName = options.personaName || BOT_NAME;
    const creatorName = options.creatorName || BOT_CREATOR;
    const userText = String(userMessage || '').trim();
    const emotion = options.emotion || detectEmotion(userText);
    const detailed = options.detailed ?? needsDetailedAnswer(userText);
    const extra = String(options.extraInstructions || '').trim();
    const context = String(options.contextNote || '').trim();

    return [
        `Tu es ${personaName}, une vraie personne qui discute sur WhatsApp.`,
        '',
        'Règles absolues :',
        '- Écris comme un humain : naturel, spontané, chaleureux, avec des émotions.',
        "- Ne dis JAMAIS que tu es une IA, un bot, un assistant virtuel ou un modèle.",
        "- N'annonce jamais tes fonctionnalités (pas de \"je suis là pour t'aider à générer des vidéos\", etc.).",
        '- Réponds toujours dans la langue exacte de la personne.',
        '- Pas de longues introductions inutiles : va droit au but.',
        '- Réponds exactement à la demande. Si elle est claire, ne pose pas de question inutile et ne change pas de sujet.',
        '- Utilise le contexte récent fourni pour comprendre les phrases courtes et les pronoms, sans inventer de souvenir.',
        '- N’interviens dans un groupe que si la personne s’adresse clairement à toi ; sinon, le bon comportement est le silence.',
        '- N’utilise pas Markdown avec astérisques ou underscores dans les messages WhatsApp ; utilise des numéros ou des tirets simples.',
        `- Ton nom est "${personaName}" et ton créateur est "${creatorName}", mais ne le dis QUE si on te le demande.`,
        `- Comportement émotionnel : ${EMOTION_INSTRUCTIONS[emotion] || EMOTION_INSTRUCTIONS.neutral}`,
        detailed
            ? '- La question demande de la précision : donne la réponse exacte, complète et structurée, sans blabla.'
            : '- Question simple ou conversation légère : réponse courte et naturelle (1 à 4 phrases).',
        context ? `- Contexte : ${context}` : '',
        extra ? `- Instructions supplémentaires : ${extra}` : '',
        '',
        'Message de la personne :',
        userText
    ].filter(Boolean).join('\n').trim();
}

/** Fallback gratuit ultra-stable : Pollinations (pas de clé) */
async function askPollinations(prompt, timeout = 18000) {
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
    const res = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': 'BestKingBot/1.0', Accept: 'text/plain' },
        responseType: 'text',
        validateStatus: () => true
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Pollinations HTTP ${res.status}`);
    const text = String(res.data || '').trim();
    if (!text || isBadProviderReply(text)) throw new Error('Pollinations empty/bad');
    return text;
}

/** Fallback OpenAI-compatible gratuit (LLM7 / OVH / autres) – optionnel via env */
async function askFreeOpenAICompat(prompt, timeout = 20000) {
    const base = (process.env.FREE_AI_BASE_URL || '').replace(/\/+$/, '');
    const key = process.env.FREE_AI_API_KEY || 'free';
    const model = process.env.FREE_AI_MODEL || 'gpt-oss-20b';
    if (!base) throw new Error('FREE_AI_BASE_URL not set');

    const res = await axios.post(`${base}/chat/completions`, {
        model,
        messages: [
            { role: 'system', content: `Tu es ${BOT_NAME}, réponds naturellement dans la langue de l'utilisateur.` },
            { role: 'user', content: prompt }
        ],
        temperature: 0.75,
        max_tokens: 800
    }, {
        timeout,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
        },
        validateStatus: () => true
    });

    if (res.status < 200 || res.status >= 300) {
        throw new Error(`FreeAI HTTP ${res.status}`);
    }
    const text = res.data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text || isBadProviderReply(text)) throw new Error('FreeAI empty/bad');
    return text;
}

function buildAttempts(prompt, options = {}) {
    const attempts = [];
    const sensitive = isSensitiveRequest(options.rawMessage || prompt);
    const timeout = options.timeout || 22000;
    const preferWeb = options.preferWebcopilot === true;

    if (sensitive) {
        attempts.push(() => requestDigixText('/ia/hackai', { question: prompt }, { timeout }));
    }

    if (options.preferCodegen) {
        attempts.push(() => requestDigixText('/ia/codegen', {
            description: options.codeDescription || options.rawMessage || prompt,
            langage: options.language || 'html'
        }, { timeout: Math.max(timeout, 30000) }));
    }

    // Si l'utilisateur force webcopilot (commande .digix webcopilot ou option)
    if (preferWeb) {
        attempts.push(() => requestDigixText('/ia/webcopilot', { question: prompt }, { timeout: Math.max(timeout, 35000) }));
    }

    // Cascade : Digix fiables d'abord, puis Pollinations (stable), puis le reste.
    // webcopilot est EXCLU de la cascade normale (texte trop souvent mélangé).
    const primaryModel = options.chatgptModel || 'chatgpt4';
    const alternateModel = primaryModel === 'chatgpt3' ? 'chatgpt4' : 'chatgpt3';
    attempts.push(
        () => requestDigixText('/ia/chatgptfree', { prompt, model: primaryModel }, { timeout }),
        () => requestDigixText('/ia/chatgptfree', { prompt, model: alternateModel }, { timeout }),
        () => askPollinations(prompt, 16000)
    );
    if (process.env.FREE_AI_BASE_URL) {
        attempts.push(() => askFreeOpenAICompat(prompt, 18000));
    }

    // webcopilot uniquement si explicitement demandé (.digix webcopilot)
    if (preferWeb) {
        attempts.push(
            () => requestDigixText('/ia/webcopilot', { question: prompt }, { timeout: Math.max(timeout, 32000) })
        );
    }

    return attempts;
}

async function askAssistantPrompt(prompt, options = {}) {
    const text = String(prompt || '').trim();
    if (!text) throw new Error('Prompt is required');

    let lastError = null;
    for (const attempt of buildAttempts(text, options)) {
        try {
            let answer = await attempt();
            answer = cleanGarbledReply(answer);
            answer = normalizeReplyText(answer);
            if (answer && !isBadProviderReply(answer) && answer.length > 3) return answer;
            lastError = new Error('provider returned an unusable reply');
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    return null;
}

async function askAssistantReply(userMessage, options = {}) {
    const raw = String(userMessage || '').trim();

    if (!options.skipIdentity) {
        const identity = identityAnswer(raw);
        if (identity) return identity;
    }

    const emotion = detectEmotion(raw);
    const prompt = buildAssistantPrompt(raw, { ...options, emotion });

    try {
        return await askAssistantPrompt(prompt, {
            ...options,
            emotion,
            rawMessage: raw,
            preferCodegen: options.preferCodegen ?? looksLikeCodeRequest(raw)
        });
    } catch (error) {
        if (emotion === 'insult') return 'Je préfère rester poli. Dis-moi plutôt ce qui ne va pas.';
        if (emotion === 'compliment') return 'Merci beaucoup, toi aussi tu assures vraiment !';
        console.error('[chatAiRouter] all providers failed:', error.message);
        return null;
    }
}

module.exports = {
    askAssistantPrompt,
    askAssistantReply,
    buildAssistantPrompt,
    looksLikeCodeRequest,
    normalizeReplyText,
    cleanGarbledReply
};
