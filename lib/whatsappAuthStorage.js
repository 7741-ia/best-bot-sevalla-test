'use strict';

const fs = require('fs');
const path = require('path');

function securePermissions(directory) {
    const pending = [directory];
    while (pending.length) {
        const current = pending.pop();
        let entries;
        try { entries = fs.readdirSync(current, { withFileTypes: true }); }
        catch { continue; }
        for (const entry of entries) {
            const child = path.join(current, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) pending.push(child);
            try { fs.chmodSync(child, entry.isDirectory() ? 0o700 : 0o600); } catch {}
        }
        try { fs.chmodSync(current, 0o700); } catch {}
    }
}

function resolveWhatsAppAuthDirectory(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const env = options.env || process.env;
    const legacyDirectory = path.join(cwd, 'session');
    const configuredAuth = String(env.BESTBOT_AUTH_DIR || '').trim();
    const persistentRoot = String(env.BESTBOT_STATUS_DATA_DIR || '').trim();
    const authDirectory = configuredAuth
        ? path.resolve(configuredAuth)
        : persistentRoot
            ? path.join(path.resolve(persistentRoot), 'whatsapp-session')
            : legacyDirectory;
    return authDirectory;
}

function getWhatsAppAuthDirectory(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const env = options.env || process.env;
    const legacyDirectory = path.join(cwd, 'session');
    const authDirectory = resolveWhatsAppAuthDirectory({ cwd, env });

    if (authDirectory !== legacyDirectory && !fs.existsSync(authDirectory) && fs.existsSync(legacyDirectory)) {
        fs.mkdirSync(path.dirname(authDirectory), { recursive: true, mode: 0o700 });
        fs.cpSync(legacyDirectory, authDirectory, { recursive: true, force: false, errorOnExist: true });
        console.log('[auth] Session WhatsApp existante copiée vers le stockage persistant.');
    }

    fs.mkdirSync(authDirectory, { recursive: true, mode: 0o700 });
    securePermissions(authDirectory);
    return authDirectory;
}

function isSameOrParent(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function clearWhatsAppAuthDirectory(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const env = options.env || process.env;
    const legacyDirectory = path.join(cwd, 'session');
    const persistentRoot = String(env.BESTBOT_STATUS_DATA_DIR || '').trim();
    const authDirectory = resolveWhatsAppAuthDirectory({ cwd, env });
    const protectedRoots = [cwd, persistentRoot && path.resolve(persistentRoot)].filter(Boolean);

    if (authDirectory === path.parse(authDirectory).root || protectedRoots.some(root => isSameOrParent(authDirectory, root))) {
        throw new Error('Refusing to remove a broad application or persistent-data directory');
    }

    for (const directory of new Set([authDirectory, legacyDirectory])) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
    return authDirectory;
}

module.exports = { clearWhatsAppAuthDirectory, getWhatsAppAuthDirectory, resolveWhatsAppAuthDirectory };
