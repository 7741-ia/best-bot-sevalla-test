'use strict';

const fs = require('fs');
const path = require('path');

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATES = new Set(['disconnected', 'failed']);

class MultiSessionStore {
    constructor(directory) {
        this.directory = path.resolve(directory);
        this.filePath = path.join(this.directory, 'sessions.json');
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        if (!fs.existsSync(this.filePath)) this._write({ version: 1, sessions: [] });
    }

    _read() {
        let state;
        try {
            state = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (error) {
            throw new Error(`Le registre des sessions est illisible; aucune donnée n’a été écrasée (${error.message})`);
        }
        if (!state || state.version !== 1 || !Array.isArray(state.sessions)) {
            throw new Error('Format du registre des sessions non reconnu; aucune donnée n’a été écrasée');
        }
        return state;
    }

    _write(state) {
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        const tempPath = `${this.filePath}.${process.pid}.tmp`;
        const fd = fs.openSync(tempPath, 'w', 0o600);
        try {
            fs.writeFileSync(fd, JSON.stringify(state, null, 2));
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(tempPath, this.filePath);
        try { fs.chmodSync(this.filePath, 0o600); } catch {}
    }

    list() {
        return this._read().sessions;
    }

    get(id) {
        if (!SESSION_ID_RE.test(String(id))) return null;
        return this._read().sessions.find((session) => session.id === id) || null;
    }

    create(session) {
        if (!SESSION_ID_RE.test(String(session?.id || ''))) throw new Error('Identifiant de session invalide');
        const state = this._read();
        if (state.sessions.some((existing) => existing.id === session.id)) throw new Error('Cette session existe déjà');
        const record = {
            id: session.id,
            phone: String(session.phone || ''),
            linkedNumber: '',
            status: 'starting',
            createdAt: session.createdAt || Date.now(),
            updatedAt: Date.now(),
            connectedAt: null,
            lastError: '',
            retryCount: 0,
            publicTokenHash: String(session.publicTokenHash || ''),
        };
        state.sessions.push(record);
        this._write(state);
        return record;
    }

    update(id, changes) {
        if (!SESSION_ID_RE.test(String(id))) throw new Error('Identifiant de session invalide');
        const state = this._read();
        const record = state.sessions.find((session) => session.id === id);
        if (!record) return null;
        const allowed = ['phone', 'linkedNumber', 'status', 'updatedAt', 'connectedAt', 'lastError', 'retryCount', 'publicTokenHash'];
        for (const key of allowed) {
            if (Object.prototype.hasOwnProperty.call(changes, key)) record[key] = changes[key];
        }
        record.updatedAt = Date.now();
        this._write(state);
        return record;
    }

    active() {
        return this.list().filter((session) => !TERMINAL_STATES.has(session.status));
    }

    remove(id) {
        if (!SESSION_ID_RE.test(String(id))) return false;
        const state = this._read();
        const index = state.sessions.findIndex((session) => session.id === id);
        if (index < 0) return false;
        state.sessions.splice(index, 1);
        this._write(state);
        return true;
    }

    static isTerminal(status) {
        return TERMINAL_STATES.has(status);
    }
}

module.exports = { MultiSessionStore, SESSION_ID_RE, TERMINAL_STATES };
