'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { clearWhatsAppAuthDirectory, getWhatsAppAuthDirectory, resolveWhatsAppAuthDirectory } = require('../lib/whatsappAuthStorage');

function withTempDir(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-auth-'));
    try { fn(root); }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('uses the persistent volume for WhatsApp credentials when configured', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        const volume = path.join(root, 'volume');
        fs.mkdirSync(cwd);
        const result = getWhatsAppAuthDirectory({ cwd, env: { BESTBOT_STATUS_DATA_DIR: volume } });
        assert.equal(result, path.join(volume, 'whatsapp-session'));
        assert.equal(fs.statSync(result).isDirectory(), true);
    });
});

test('resolves the persistent path without creating or migrating anything', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        fs.mkdirSync(path.join(cwd, 'session'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'session', 'creds.json'), '{"registered":true}');
        const volume = path.join(root, 'volume');
        const result = resolveWhatsAppAuthDirectory({ cwd, env: { BESTBOT_STATUS_DATA_DIR: volume } });
        assert.equal(result, path.join(volume, 'whatsapp-session'));
        assert.equal(fs.existsSync(result), false);
        assert.equal(fs.existsSync(path.join(cwd, 'session', 'creds.json')), true);
    });
});

test('honors an explicit auth directory over the general persistent data directory', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        fs.mkdirSync(cwd);
        const result = getWhatsAppAuthDirectory({ cwd, env: {
            BESTBOT_STATUS_DATA_DIR: path.join(root, 'volume'),
            BESTBOT_AUTH_DIR: path.join(root, 'custom-auth')
        } });
        assert.equal(result, path.join(root, 'custom-auth'));
    });
});

test('migrates a legacy session to the persistent volume and keeps the source until verified', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        const legacy = path.join(cwd, 'session');
        const volume = path.join(root, 'volume');
        fs.mkdirSync(legacy, { recursive: true });
        fs.writeFileSync(path.join(legacy, 'creds.json'), '{"registered":true}');
        const result = getWhatsAppAuthDirectory({ cwd, env: { BESTBOT_STATUS_DATA_DIR: volume } });
        assert.equal(fs.readFileSync(path.join(result, 'creds.json'), 'utf8'), '{"registered":true}');
        assert.equal(fs.existsSync(path.join(legacy, 'creds.json')), true);
    });
});

test('does not overwrite an existing persistent session with legacy files', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        const legacy = path.join(cwd, 'session');
        const volume = path.join(root, 'volume');
        const persistent = path.join(volume, 'whatsapp-session');
        fs.mkdirSync(legacy, { recursive: true });
        fs.mkdirSync(persistent, { recursive: true });
        fs.writeFileSync(path.join(legacy, 'creds.json'), '{"registered":false}');
        fs.writeFileSync(path.join(persistent, 'creds.json'), '{"registered":true}');
        const result = getWhatsAppAuthDirectory({ cwd, env: { BESTBOT_STATUS_DATA_DIR: volume } });
        assert.equal(result, persistent);
        assert.equal(fs.readFileSync(path.join(result, 'creds.json'), 'utf8'), '{"registered":true}');
    });
});

test('clears the logged-out persistent and legacy sessions but preserves other volume data', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        const volume = path.join(root, 'volume');
        const persistent = path.join(volume, 'whatsapp-session');
        fs.mkdirSync(path.join(cwd, 'session'), { recursive: true });
        fs.mkdirSync(persistent, { recursive: true });
        fs.writeFileSync(path.join(cwd, 'session', 'creds.json'), 'legacy');
        fs.writeFileSync(path.join(persistent, 'creds.json'), 'logged-out');
        fs.writeFileSync(path.join(volume, 'statusArchive.json'), 'keep');

        const result = clearWhatsAppAuthDirectory({ cwd, env: { BESTBOT_STATUS_DATA_DIR: volume } });
        assert.equal(result, persistent);
        assert.equal(fs.existsSync(path.join(cwd, 'session')), false);
        assert.equal(fs.existsSync(persistent), false);
        assert.equal(fs.readFileSync(path.join(volume, 'statusArchive.json'), 'utf8'), 'keep');
    });
});

test('refuses to clear the persistent data root even when configured as auth directory', () => {
    withTempDir(root => {
        const cwd = path.join(root, 'app');
        const volume = path.join(root, 'volume');
        fs.mkdirSync(cwd, { recursive: true });
        fs.mkdirSync(volume, { recursive: true });
        fs.writeFileSync(path.join(volume, 'statusArchive.json'), 'keep');
        assert.throws(() => clearWhatsAppAuthDirectory({ cwd, env: {
            BESTBOT_STATUS_DATA_DIR: volume,
            BESTBOT_AUTH_DIR: volume
        } }), /Refusing to remove/);
        assert.equal(fs.readFileSync(path.join(volume, 'statusArchive.json'), 'utf8'), 'keep');
    });
});
