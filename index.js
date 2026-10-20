'use strict';

try { require('dotenv').config(); } catch {}

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const { MultiSessionStore, SESSION_ID_RE, TERMINAL_STATES } = require('./lib/multisession-store');
const PAIRING_CODE_TTL_MS = 45000;

const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const DATA_ROOT = path.resolve(process.env.MULTISESSION_DATA_DIR || path.join(APP_ROOT, 'multisession-data'));
const SESSIONS_ROOT = path.join(DATA_ROOT, 'sessions');
const PORT = Number(process.env.PORT || 8080);
const MAX_SESSIONS = clampInt(process.env.MAX_SESSIONS, 5, 1, 100);
const ADMIN_COOKIE = 'bestbot_admin';
const ADMIN_TTL_SECONDS = 8 * 60 * 60;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg',
};

function clampInt(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function cleanText(value, max = 400) {
    return String(value || '').replace(/[\u0000-\u001f\u007f\u001b]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeDiagnostic(value) {
    return cleanText(value, 240)
        .replace(/\b\d{8,15}\b/g, '[phone]')
        .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
}

function pairingLog(event, fields = {}) {
    const safe = { event: `pairing.${event}`, at: new Date().toISOString() };
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null || key === 'code' || key === 'token' || key === 'phone' || key === 'id') continue;
        if (key === 'error' || key === 'message') safe[key] = safeDiagnostic(value);
        else if (typeof value === 'string') safe[key] = cleanText(value, 120);
        else if (typeof value === 'number' || typeof value === 'boolean') safe[key] = value;
    }
    if (fields.phone) safe.phoneSuffix = String(fields.phone).replace(/\D/g, '').slice(-2);
    if (fields.id) safe.sessionRef = hashToken(fields.id).slice(0, 12);
    console.log(JSON.stringify(safe));
}

function normalizePhone(value) {
    const phone = String(value || '').trim();
    if (!/^\+?[0-9][0-9\s().-]*$/.test(phone)) return null;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function tokenMatches(storedHash, token) {
    if (!storedHash || !token) return false;
    const expected = Buffer.from(String(storedHash), 'hex');
    const actual = Buffer.from(hashToken(token), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function safeEqualText(left, right) {
    const a = crypto.createHash('sha256').update(String(left || '')).digest();
    const b = crypto.createHash('sha256').update(String(right || '')).digest();
    return crypto.timingSafeEqual(a, b);
}

function adminConfiguration() {
    const username = String(process.env.ADMIN_USERNAME || '');
    const password = String(process.env.ADMIN_PASSWORD || '');
    const secret = String(process.env.ADMIN_SESSION_SECRET || '');
    const ownerNumber = normalizePhone(process.env.OWNER_NUMBER || '');
    const missing = [];
    if (username.length < 3) missing.push('ADMIN_USERNAME');
    if (password.length < 12) missing.push('ADMIN_PASSWORD (12 caractères minimum)');
    if (secret.length < 32) missing.push('ADMIN_SESSION_SECRET (32 caractères minimum)');
    if (!ownerNumber) missing.push('OWNER_NUMBER (format international)');
    if (process.env.NODE_ENV === 'production' && !process.env.MULTISESSION_DATA_DIR) missing.push('MULTISESSION_DATA_DIR (disque persistant Sevalla)');
    return { username, password, secret, ownerNumber, ready: missing.length === 0, missing };
}

function signPayload(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function verifyPayload(value, secret) {
    if (!value || !secret) return null;
    const [body, signature, extra] = String(value).split('.');
    if (!body || !signature || extra) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest();
    let actual;
    try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
        return payload;
    } catch { return null; }
}

function parseCookies(header = '') {
    const cookies = Object.create(null);
    for (const item of String(header).split(';')) {
        const index = item.indexOf('=');
        if (index < 1) continue;
        const key = item.slice(0, index).trim();
        try { cookies[key] = decodeURIComponent(item.slice(index + 1).trim()); } catch {}
    }
    return cookies;
}

function sendJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...extraHeaders });
    res.end(body);
}

function readJson(req, limit = 8192) {
    return new Promise((resolve, reject) => {
        let body = '';
        let rejected = false;
        req.on('data', (chunk) => {
            body += chunk;
            if (Buffer.byteLength(body) > limit && !rejected) {
                rejected = true;
                reject(Object.assign(new Error('Requête trop volumineuse'), { statusCode: 413 }));
                req.resume();
            }
        });
        req.on('end', () => {
            if (rejected) return;
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(Object.assign(new Error('JSON invalide'), { statusCode: 400 })); }
        });
        req.on('error', reject);
    });
}

function clientAddress(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return (forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 100);
}

class RateLimiter {
    constructor() { this.hits = new Map(); }
    allow(key, limit, windowMs) {
        const now = Date.now();
        const current = (this.hits.get(key) || []).filter((time) => now - time < windowMs);
        if (current.length >= limit) { this.hits.set(key, current); return false; }
        current.push(now);
        this.hits.set(key, current);
        if (this.hits.size > 2000) {
            for (const [candidate, times] of this.hits) {
                if (!times.some((time) => now - time < windowMs)) this.hits.delete(candidate);
            }
        }
        return true;
    }
}

class MultiSessionManager {
    constructor(options = {}) {
        this.dataRoot = path.resolve(options.dataRoot || DATA_ROOT);
        this.sessionsRoot = path.join(this.dataRoot, 'sessions');
        this.store = options.store || new MultiSessionStore(this.dataRoot);
        this.maxSessions = options.maxSessions || MAX_SESSIONS;
        this.workers = new Map();
        this.pairingCodes = new Map();
        this.retryTimers = new Map();
        this.limiter = new RateLimiter();
        fs.mkdirSync(this.sessionsRoot, { recursive: true, mode: 0o700 });
    }

    _isActive(record) { return record && !TERMINAL_STATES.has(record.status); }

    publicSessionCount() { return this.store.active().length; }

    storageStats() {
        try {
            const stats = fs.statfsSync(this.dataRoot);
            const blockSize = Number(stats.bsize);
            const totalBytes = blockSize * Number(stats.blocks);
            const freeBytes = blockSize * Number(stats.bavail);
            if (![blockSize, totalBytes, freeBytes].every(Number.isFinite) || blockSize <= 0 || totalBytes <= 0 || freeBytes < 0) return { available: false };
            return { available: true, usedBytes: Math.max(0, totalBytes - freeBytes), totalBytes, freeBytes };
        } catch { return { available: false }; }
    }

    _runtimeFor(id) {
        if (!SESSION_ID_RE.test(id)) throw new Error('Identifiant de session invalide');
        const dataRoot = path.join(this.sessionsRoot, id);
        const runtime = path.join(os.tmpdir(), `bestbot-runtime-${process.pid}-${id}`);
        const persistentData = path.join(dataRoot, 'data');
        const authDir = path.join(dataRoot, 'auth');
        const persistentRoot = path.resolve(this.dataRoot);
        fs.mkdirSync(persistentData, { recursive: true, mode: 0o700 });
        fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
        fs.rmSync(runtime, { recursive: true, force: true });
        fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
        const excluded = new Set(['.git', '.github', 'node_modules', 'data', 'session', 'public', 'tests', 'multisession-data', 'tmp', 'temp', 'logs']);
        fs.cpSync(APP_ROOT, runtime, {
            recursive: true,
            filter: (source) => {
                const resolvedSource = path.resolve(source);
                if (resolvedSource === persistentRoot || resolvedSource.startsWith(`${persistentRoot}${path.sep}`)) return false;
                const relative = path.relative(APP_ROOT, source);
                if (!relative) return true;
                const parts = relative.split(path.sep);
                if (parts.some((part) => excluded.has(part))) return false;
                if (parts.some((part) => /^\.env(?:\.|$)/i.test(part))) return false;
                return true;
            },
        });
        fs.rmSync(path.join(runtime, 'data'), { recursive: true, force: true });
        fs.symlinkSync(persistentData, path.join(runtime, 'data'), 'dir');
        const modules = path.join(APP_ROOT, 'node_modules');
        if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(runtime, 'node_modules'), 'dir');
        return { runtime, persistentData, authDir };
    }

    startSession(id) {
        if (this.workers.has(id)) return false;
        const record = this.store.get(id);
        if (!record || record.status === 'disconnected') return false;
        const config = adminConfiguration();
        if (!config.ownerNumber) {
            this.store.update(id, { status: 'failed', lastError: 'OWNER_NUMBER non configuré.' });
            return false;
        }
        try {
            const { runtime, persistentData, authDir } = this._runtimeFor(id);
            const heap = clampInt(process.env.SESSION_NODE_HEAP_MB, 170, 96, 768);
            const workerEnv = { ...process.env };
            for (const key of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'MULTISESSION_DATA_DIR']) delete workerEnv[key];
            Object.assign(workerEnv, {
                NODE_OPTIONS: '',
                PORT: '0',
                PHONE_NUMBER: record.phone,
                OWNER_NUMBER: config.ownerNumber,
                BESTBOT_MANAGER_CHILD: '1',
                BESTBOT_SESSION_ID: id,
                BESTBOT_AUTH_DIR: authDir,
                BESTBOT_STATUS_DATA_DIR: persistentData,
                BESTBOT_USER_GROUP_DATA_PATH: path.join(persistentData, 'userGroupData.json'),
            });
            const worker = fork(path.join(runtime, 'session-worker.js'), [], {
                cwd: runtime,
                execArgv: ['--expose-gc', `--max-old-space-size=${heap}`, '--max-semi-space-size=2', '--optimize-for-size'],
                env: workerEnv,
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                windowsHide: true,
            });
            const workerState = { child: worker, intent: null, runtime };
            this.workers.set(id, workerState);
            this.store.update(id, { status: record.status === 'starting' ? 'connecting' : 'reconnecting', lastError: '' });
            worker.stdout?.on('data', (chunk) => {
                const text = String(chunk).trim();
                if (text) console.log(`[worker:${id}] ${text}`);
            });
            worker.stderr?.on('data', (chunk) => {
                const text = String(chunk).trim();
                if (text) console.error(`[worker:${id}] ${text}`);
            });
            worker.on('message', (message) => this._onWorkerMessage(id, workerState, message));
            worker.on('error', (error) => this._setError(id, `Worker: ${cleanText(error.message)}`));
            worker.once('exit', (code, signal) => this._onWorkerExit(id, workerState, code, signal));
            return true;
        } catch (error) {
            this.store.update(id, { status: 'failed', lastError: `Démarrage worker: ${cleanText(error.message)}` });
            return false;
        }
    }

    startSavedSessions() {
        const sessions = this.store.active();
        let delay = 0;
        for (const session of sessions) {
            const timer = setTimeout(() => this.startSession(session.id), delay);
            timer.unref?.();
            delay += 700;
        }
    }

    _setError(id, message) {
        const record = this.store.get(id);
        if (!record || record.status === 'disconnected') return;
        this.store.update(id, { lastError: cleanText(message) || 'Erreur inconnue.' });
    }

    _onWorkerMessage(id, workerState, message) {
        if (!message || message.sessionId !== id || this.workers.get(id) !== workerState) return;
        const record = this.store.get(id);
        if (!record) return;
        if (message.type === 'pairing-code' && typeof message.code === 'string') {
            this.pairingCodes.set(id, { code: cleanText(message.code, 30), expiresAt: Number(message.expiresAt) || Date.now() + PAIRING_CODE_TTL_MS });
            this.store.update(id, { status: 'pairing', lastError: '' });
            pairingLog('code_ready', { id, phone: record.phone, status: 'pairing' });
            return;
        }
        if (message.type === 'state') {
            const status = ['connecting', 'pairing', 'connected', 'disconnected'].includes(message.status) ? message.status : null;
            if (!status) return;
            if (status === 'connected') {
                this.pairingCodes.delete(id);
                this.store.update(id, { status, linkedNumber: normalizePhone(message.linkedNumber) || record.linkedNumber, connectedAt: Date.now(), lastError: '' });
            } else {
                if (status === 'disconnected') this.pairingCodes.delete(id);
                this.store.update(id, { status, lastError: status === 'disconnected' ? '' : record.lastError });
            }
            pairingLog('state', { id, phone: record.phone, status });
            return;
        }
        if (message.type === 'connection-close') {
            const statusCode = Number(message.statusCode);
            // WhatsApp ferme normalement le socket avec 428 après avoir
            // délivré un code. Le code reste valable pendant sa fenêtre de
            // pairing : ne pas l’effacer ni en demander un autre immédiatement.
            const pairingCodeReady = this.pairingCodes.has(id);
            const expectedPairingClose = statusCode === 428 && pairingCodeReady;
            if (!expectedPairingClose) this.pairingCodes.delete(id);
            const terminalPairingFailure = statusCode === 401;
            this.store.update(id, {
                status: terminalPairingFailure ? 'failed' : (expectedPairingClose ? 'pairing' : 'reconnecting'),
                lastError: expectedPairingClose ? '' : cleanText(`Connexion fermée (statut WhatsApp ${statusCode || 'inconnu'}): ${message.message || 'erreur de connexion'}`),
                retryCount: (record.retryCount || 0) + 1,
            });
            pairingLog('connection_closed', { id, phone: record.phone, statusCode, expectedPairingClose, error: message.message });
            return;
        }
        if (message.type === 'error') {
            this._setError(id, message.message);
            pairingLog('worker_error', { id, phone: record.phone, error: message.message });
        }
    }

    _onWorkerExit(id, workerState, code, signal) {
        if (this.workers.get(id) !== workerState) return;
        this.workers.delete(id);
        const record = this.store.get(id);
        if (!record) return;
        if (workerState.intent === 'disconnect') {
            this.pairingCodes.delete(id);
            this._removeAuth(id);
            this.store.update(id, { status: 'disconnected', lastError: '', linkedNumber: '' });
            return;
        }
        // Ne jamais exposer un code produit par le worker précédent pendant
        // que le manager attend le nouveau socket.
        this.pairingCodes.delete(id);
        if (workerState.intent === 'restart') {
            this.store.update(id, { status: 'reconnecting' });
            const timer = setTimeout(() => this.startSession(id), 700);
            timer.unref?.();
            this.retryTimers.set(id, timer);
            return;
        }
        if (TERMINAL_STATES.has(record.status)) return;
        const retryCount = (record.retryCount || 0) + 1;
        this.store.update(id, {
            status: 'reconnecting', retryCount,
            lastError: cleanText(record.lastError || `Worker terminé (code ${code ?? '—'}, signal ${signal || '—'}).`),
        });
        const delay = Math.min(30000, 1000 * (2 ** Math.min(retryCount, 5)));
        const timer = setTimeout(() => this.startSession(id), delay);
        timer.unref?.();
        this.retryTimers.set(id, timer);
    }

    _removeAuth(id) {
        if (!SESSION_ID_RE.test(id)) return;
        const authDir = path.join(this.sessionsRoot, id, 'auth');
        fs.rmSync(authDir, { recursive: true, force: true });
        fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
    }

    async createPairing(phone, tokenHash) {
        const normalized = normalizePhone(phone);
        if (!normalized) throw Object.assign(new Error('Entre un numéro international valide, avec 8 à 15 chiffres.'), { statusCode: 400 });
        const existing = this.store.list().find((session) => session.phone === normalized && !TERMINAL_STATES.has(session.status));
        if (existing) {
            pairingLog('rejected_existing', { id: existing.id, phone: normalized, status: existing.status });
            throw Object.assign(new Error('Une session est déjà active ou en cours pour ce numéro.'), { statusCode: 409 });
        }
        if (this.publicSessionCount() >= this.maxSessions) {
            pairingLog('rejected_capacity', { phone: normalized, capacity: this.maxSessions });
            throw Object.assign(new Error('La capacité de sessions configurée est atteinte. Réessaie plus tard.'), { statusCode: 429 });
        }
        const config = adminConfiguration();
        if (!config.ready) throw Object.assign(new Error('Le service n’est pas encore configuré par l’administrateur.'), { statusCode: 503 });
        const id = crypto.randomUUID();
        this.store.create({ id, phone: normalized, publicTokenHash: tokenHash, createdAt: Date.now() });
        this.startSession(id);
        pairingLog('created', { id, phone: normalized, status: 'starting' });
        return id;
    }

    getPublicStatus(id, token) {
        const record = this.store.get(id);
        if (!record || !tokenMatches(record.publicTokenHash, token)) return null;
        const pairing = this.pairingCodes.get(id);
        const codeAvailable = pairing && pairing.expiresAt > Date.now();
        return {
            id: record.id,
            phone: record.phone,
            status: record.status,
            linked: record.status === 'connected',
            pairingCode: codeAvailable ? pairing.code : null,
            codeExpiresAt: codeAvailable ? pairing.expiresAt : null,
            lastError: cleanText(record.lastError),
            updatedAt: record.updatedAt,
        };
    }

    async cancelPairing(id, token) {
        const record = this.store.get(id);
        if (!record || !tokenMatches(record.publicTokenHash, token)) return false;
        return this.disconnect(id);
    }

    listAdminSessions() {
        return this.store.list().map((record) => ({
            id: record.id, phone: record.phone, linkedNumber: record.linkedNumber,
            status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt,
            connectedAt: record.connectedAt, lastError: cleanText(record.lastError), retryCount: record.retryCount || 0,
        }));
    }

    deleteDisconnected(id) {
        if (!SESSION_ID_RE.test(String(id))) return false;
        const record = this.store.get(id);
        if (!record || record.status !== 'disconnected' || this.workers.has(id)) return false;
        const timer = this.retryTimers.get(id);
        if (timer) clearTimeout(timer);
        this.retryTimers.delete(id);
        this.pairingCodes.delete(id);
        const root = path.resolve(this.sessionsRoot);
        const directory = path.resolve(root, id);
        if (!directory.startsWith(`${root}${path.sep}`)) return false;
        fs.rmSync(directory, { recursive: true, force: true });
        return this.store.remove(id);
    }

    async restart(id) {
        const record = this.store.get(id);
        if (!record || record.status === 'disconnected') return false;
        const workerState = this.workers.get(id);
        if (!workerState) {
            this.store.update(id, { status: 'reconnecting', lastError: '' });
            return this.startSession(id);
        }
        workerState.intent = 'restart';
        this.pairingCodes.delete(id);
        this.store.update(id, { status: 'reconnecting', lastError: '' });
        try { workerState.child.send({ type: 'restart' }); } catch { workerState.child.kill('SIGTERM'); }
        return true;
    }

    async disconnect(id) {
        const record = this.store.get(id);
        if (!record) return false;
        const workerState = this.workers.get(id);
        this.pairingCodes.delete(id);
        const timer = this.retryTimers.get(id);
        if (timer) clearTimeout(timer);
        this.retryTimers.delete(id);
        if (!workerState) {
            this._removeAuth(id);
            this.store.update(id, { status: 'disconnected', lastError: '', linkedNumber: '' });
            return true;
        }
        workerState.intent = 'disconnect';
        this.store.update(id, { status: 'disconnecting', lastError: '' });
        try { workerState.child.send({ type: 'disconnect' }); } catch { workerState.child.kill('SIGTERM'); }
        const forceTimer = setTimeout(() => {
            if (this.workers.get(id) === workerState) workerState.child.kill('SIGTERM');
        }, 8000);
        forceTimer.unref?.();
        return true;
    }
}

function adminSession(req) {
    const config = adminConfiguration();
    if (!config.ready) return null;
    const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    const payload = verifyPayload(token, config.secret);
    if (!payload || payload.user !== config.username || typeof payload.csrf !== 'string') return null;
    return payload;
}

function requireCsrf(req, payload) {
    const supplied = String(req.headers['x-csrf-token'] || '');
    if (!safeEqualText(supplied, payload.csrf)) throw Object.assign(new Error('Jeton de sécurité expiré. Recharge la page admin.'), { statusCode: 403 });
    const origin = String(req.headers.origin || '');
    if (origin) {
        try {
            const originUrl = new URL(origin);
            const host = String(req.headers.host || '');
            if (originUrl.host !== host) throw new Error('Origine invalide');
        } catch { throw Object.assign(new Error('Origine de requête refusée.'), { statusCode: 403 }); }
    }
}

function setAdminCookie(req, res, value, maxAge = ADMIN_TTL_SECONDS) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = process.env.NODE_ENV === 'production' || forwardedProto === 'https';
    const secureFlag = secure ? '; Secure' : '';
    res.setHeader('set-cookie', `${ADMIN_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureFlag}`);
}

function withSecurityHeaders(res) {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('cache-control', 'no-store');
}

function serveStatic(res, fileName) {
    const fullPath = path.join(PUBLIC_ROOT, fileName);
    if (!fullPath.startsWith(`${PUBLIC_ROOT}${path.sep}`) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        sendJson(res, 404, { error: 'Ressource introuvable.' });
        return;
    }
    const body = fs.readFileSync(fullPath);
    res.writeHead(200, { 'content-type': MIME_TYPES[path.extname(fullPath)] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    res.end(body);
}

function createServer(manager = new MultiSessionManager()) {
    const limiter = new RateLimiter();
    const server = http.createServer(async (req, res) => {
        withSecurityHeaders(res);
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = decodeURIComponent(url.pathname);
        try {
            if (req.method === 'GET' && (pathname === '/health' || pathname === '/healthz')) {
                const config = adminConfiguration();
                sendJson(res, 200, { status: 'ok', configured: config.ready, sessions: manager.publicSessionCount(), capacity: manager.maxSessions });
                return;
            }
            if (req.method === 'GET' && pathname === '/') return serveStatic(res, 'index.html');
            if (req.method === 'GET' && (pathname.toLowerCase() === '/best_bot_admin' || pathname === '/admin')) return serveStatic(res, 'admin.html');
            if (req.method === 'GET' && ['/style.css', '/public.js', '/admin.js'].includes(pathname)) return serveStatic(res, pathname.slice(1));
            if (req.method === 'GET' && pathname.startsWith('/assets/')) {
                const assetName = pathname.slice('/assets/'.length);
                if (!/^[a-zA-Z0-9._-]+$/.test(assetName)) return sendJson(res, 404, { error: 'Ressource introuvable.' });
                return serveStatic(res, path.join('assets', assetName));
            }

            if (req.method === 'POST' && pathname === '/api/pairings') {
                if (!limiter.allow(`pair:${clientAddress(req)}`, 12, 15 * 60 * 1000)) {
                    pairingLog('rejected_rate', { statusCode: 429, scope: 'client' });
                    return sendJson(res, 429, { error: 'Trop de demandes depuis cette connexion. Attends quelques minutes.' }, { 'retry-after': '900' });
                }
                if (!limiter.allow('pair-global', 100, 60 * 60 * 1000)) {
                    pairingLog('rejected_rate', { statusCode: 429, scope: 'global' });
                    return sendJson(res, 429, { error: 'Trop de demandes de codes récemment. Réessaie plus tard.' }, { 'retry-after': '3600' });
                }
                const body = await readJson(req, 4096);
                const phone = normalizePhone(body.phone);
                if (!phone) {
                    pairingLog('rejected_invalid', { statusCode: 400 });
                    return sendJson(res, 400, { error: 'Entre le numéro complet au format international, avec 8 à 15 chiffres.' });
                }
                const token = crypto.randomBytes(32).toString('base64url');
                const id = await manager.createPairing(phone, hashToken(token));
                pairingLog('accepted', { id, phone, statusCode: 201 });
                sendJson(res, 201, { id, token, status: 'starting', pollAfterMs: 1500 });
                return;
            }

            const cancelMatch = pathname.match(/^\/api\/pairings\/([0-9a-f-]{36})\/cancel$/i);
            if (req.method === 'POST' && cancelMatch) {
                const authorization = String(req.headers.authorization || '');
                const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
                const ok = await manager.cancelPairing(cancelMatch[1], token);
                if (!ok) return sendJson(res, 404, { error: 'Demande introuvable ou jeton invalide.' });
                sendJson(res, 202, { ok: true, message: 'Déconnexion de cette session demandée.' });
                return;
            }

            const publicMatch = pathname.match(/^\/api\/pairings\/([0-9a-f-]{36})$/i);
            if (req.method === 'GET' && publicMatch) {
                const authorization = String(req.headers.authorization || '');
                const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
                const status = manager.getPublicStatus(publicMatch[1], token);
                if (!status) return sendJson(res, 404, { error: 'Demande introuvable ou jeton expiré.' });
                sendJson(res, 200, status);
                return;
            }

            if (req.method === 'POST' && pathname === '/api/admin/login') {
                if (!limiter.allow(`login:${clientAddress(req)}`, 8, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Trop de tentatives. Attends quelques minutes.' });
                const config = adminConfiguration();
                if (!config.ready) return sendJson(res, 503, { error: 'Configuration admin incomplète. Vérifie les variables privées sur Sevalla.' });
                const body = await readJson(req, 4096);
                if (!limiter.allow(`login-user:${cleanText(body.username, 100).toLowerCase()}`, 12, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Trop de tentatives sur ce compte. Attends quelques minutes.' });
                if (!safeEqualText(body.username, config.username) || !safeEqualText(body.password, config.password)) {
                    return sendJson(res, 401, { error: 'Identifiant ou mot de passe incorrect.' });
                }
                const payload = { user: config.username, csrf: crypto.randomBytes(24).toString('base64url'), exp: Date.now() + ADMIN_TTL_SECONDS * 1000 };
                setAdminCookie(req, res, signPayload(payload, config.secret));
                sendJson(res, 200, { ok: true, csrfToken: payload.csrf, expiresAt: payload.exp });
                return;
            }

            if (pathname.startsWith('/api/admin/')) {
                const payload = adminSession(req);
                if (!payload) return sendJson(res, 401, { error: 'Connexion admin requise.' });
                if (req.method === 'GET' && pathname === '/api/admin/me') {
                    sendJson(res, 200, { username: payload.user, csrfToken: payload.csrf, expiresAt: payload.exp });
                    return;
                }
                if (req.method === 'GET' && pathname === '/api/admin/sessions') {
                    sendJson(res, 200, { sessions: manager.listAdminSessions(), active: manager.publicSessionCount(), capacity: manager.maxSessions, storage: manager.storageStats?.() || { available: false } });
                    return;
                }
                if (req.method === 'POST' && pathname === '/api/admin/logout') {
                    requireCsrf(req, payload);
                    setAdminCookie(req, res, '', 0);
                    sendJson(res, 200, { ok: true });
                    return;
                }
                const actionMatch = pathname.match(/^\/api\/admin\/sessions\/([0-9a-f-]{36})\/(disconnect|restart|delete)$/i);
                if (req.method === 'POST' && actionMatch) {
                    requireCsrf(req, payload);
                    const id = actionMatch[1];
                    if (!SESSION_ID_RE.test(id) || !manager.store.get(id)) return sendJson(res, 404, { error: 'Session introuvable.' });
                    const action = actionMatch[2].toLowerCase();
                    const ok = action === 'disconnect' ? await manager.disconnect(id) : action === 'restart' ? await manager.restart(id) : manager.deleteDisconnected(id);
                    const message = action === 'disconnect' ? 'Déconnexion demandée.' : action === 'restart' ? 'Nouvelle tentative demandée.' : ok ? 'Compte supprimé.' : 'Seul un compte déconnecté peut être supprimé.';
                    sendJson(res, ok ? (action === 'delete' ? 200 : 202) : 409, { ok, message });
                    return;
                }
                return sendJson(res, 404, { error: 'Route admin inconnue.' });
            }

            sendJson(res, 404, { error: 'Route introuvable.' });
        } catch (error) {
            if (res.headersSent) { res.destroy(); return; }
            sendJson(res, Number(error.statusCode) || 500, { error: cleanText(error.message) || 'Erreur serveur.' });
        }
    });
    return { server, manager };
}

if (require.main === module) {
    let manager;
    try {
        manager = new MultiSessionManager();
        const { server } = createServer(manager);
        server.listen(PORT, '0.0.0.0', () => {
            const config = adminConfiguration();
            console.log(`[web] BestBot multi-session écoute sur ${PORT}; sessions actives=${manager.publicSessionCount()}; max=${manager.maxSessions}`);
            if (!config.ready) console.warn(`[config] Configuration incomplète (${config.missing.join(', ')}); les demandes publiques resteront bloquées.`);
            manager.startSavedSessions();
        });
        const shutdown = () => {
            server.close(() => process.exit(0));
            for (const { child } of manager.workers.values()) child.kill('SIGTERM');
            setTimeout(() => process.exit(0), 8000).unref();
        };
        process.once('SIGTERM', shutdown);
        process.once('SIGINT', shutdown);
    } catch (error) {
        console.error(`[fatal] ${cleanText(error.message)}`);
        process.exitCode = 1;
    }
}

module.exports = { MultiSessionManager, RateLimiter, adminConfiguration, createServer, hashToken, normalizePhone, safeEqualText, tokenMatches, verifyPayload };
