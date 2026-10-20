'use strict';

const crypto = require('crypto');
const { askAssistantReply } = require('../lib/chatAiRouter');
const { BOT_NAME, BOT_CREATOR } = require('../lib/humanizer');

const MAX_PROMPT_CHARS = 4000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 20;

function safeEqualToken(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) return false;
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function readPrompt(req) {
    let body = req.body;
    if (typeof body === 'string') {
        if (Buffer.byteLength(body, 'utf8') > 16 * 1024) return { tooLarge: true };
        try { body = JSON.parse(body); } catch { return { invalid: true }; }
    }
    const value = req.method === 'POST'
        ? (body?.prompt || body?.message || body?.q || '')
        : (req.query?.prompt || req.query?.message || req.query?.q || '');
    const prompt = typeof value === 'string' ? value.trim() : '';
    if (prompt.length > MAX_PROMPT_CHARS) return { tooLarge: true };
    return { prompt };
}

function createChatHandler({ ask = askAssistantReply, token = () => process.env.CHAT_API_TOKEN || '', now = Date.now } = {}) {
    const requestsByAddress = new Map();

    return async function chatHandler(req, res) {
        const method = String(req.method || '').toUpperCase();
        if (!['GET', 'POST'].includes(method)) {
            return res.status(405).json({ status: false, error: 'Method Not Allowed' });
        }

        let expectedToken = '';
        try { expectedToken = String(token() || '').trim(); } catch {}
        if (expectedToken.length < 24) {
            return res.status(503).json({ status: false, error: 'Chat API is not configured' });
        }
        const authorization = String(req.headers?.authorization || '');
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        const suppliedToken = match?.[1]?.trim() || '';
        if (suppliedToken.length > 512 || !safeEqualToken(suppliedToken, expectedToken)) {
            return res.status(401).json({ status: false, error: 'Unauthorized' });
        }

        const parsed = readPrompt(req);
        if (parsed.tooLarge) return res.status(413).json({ status: false, error: 'Prompt too large' });
        if (parsed.invalid) return res.status(400).json({ status: false, error: 'Invalid JSON body' });
        if (!parsed.prompt) return res.status(400).json({ status: false, error: 'Prompt is required' });

        const address = String(req.socket?.remoteAddress || 'unknown').slice(0, 100);
        const timestamp = now();
        const recent = (requestsByAddress.get(address) || []).filter((time) => timestamp - time < RATE_WINDOW_MS);
        if (recent.length >= RATE_LIMIT) {
            requestsByAddress.set(address, recent);
            return res.status(429).json({ status: false, error: 'Rate limit exceeded' });
        }
        recent.push(timestamp);
        requestsByAddress.set(address, recent);
        for (const [key, times] of requestsByAddress) {
            if (!times.length || timestamp - times[times.length - 1] >= RATE_WINDOW_MS) requestsByAddress.delete(key);
        }
        while (requestsByAddress.size > 1000) requestsByAddress.delete(requestsByAddress.keys().next().value);

        try {
            const data = await ask(parsed.prompt);
            if (!data) return res.status(503).json({ status: false, error: 'Aucun provider IA disponible pour le moment' });
            return res.status(200).json({ status: true, bot: BOT_NAME, creator: BOT_CREATOR, data });
        } catch {
            console.error('API /chat provider request failed');
            return res.status(500).json({ status: false, error: 'Internal Server Error' });
        }
    };
}

const handler = createChatHandler();
module.exports = handler;
module.exports.createChatHandler = createChatHandler;
