// Host guard: keep memory low & prevent silent hangs on Katabump / small panels.
// All thresholds tunable via .env: RAM_SOFT_MB, RAM_HARD_MB, GC_INTERVAL_MS,
// TEMP_MAX_AGE_MIN, HEARTBEAT_MS.

const fs = require('fs');
const path = require('path');

// Limite mémoire du conteneur (Katabump/Pterodactyl) lue automatiquement ; sinon MEM_LIMIT_MB ; sinon valeurs historiques.
function detectLimitMB() {
    for (const file of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
        try {
            const raw = fs.readFileSync(file, 'utf8').trim();
            const mb = Number(raw) / 1048576;
            if (raw !== 'max' && mb > 64 && mb < 65536) return mb;
        } catch { /* fichier absent */ }
    }
    return null;
}
const MEM_LIMIT = Number(process.env.MEM_LIMIT_MB) || detectLimitMB();
const RAM_SOFT = Number(process.env.RAM_SOFT_MB || (MEM_LIMIT ? Math.round(MEM_LIMIT * 0.72) : 380)); // nettoyage
const RAM_HARD = Number(process.env.RAM_HARD_MB || (MEM_LIMIT ? Math.round(MEM_LIMIT * 0.86) : 520)); // nettoyage d'urgence
const GC_INTERVAL = Number(process.env.GC_INTERVAL_MS || 45_000);
const CHECK_INTERVAL = 20_000;
const TEMP_MAX_AGE_MIN = Number(process.env.TEMP_MAX_AGE_MIN || 30);
const HEARTBEAT = Number(process.env.HEARTBEAT_MS || 60_000);
// --- Maintenance mode thresholds
const CPU_SOFT = Number(process.env.CPU_SOFT_PCT || 97);   // % CPU: entrer en pause
const CPU_RESUME = Number(process.env.CPU_RESUME_PCT || 60); // % CPU: reprendre
const RAM_RESUME = Number(process.env.RAM_RESUME_MB || (MEM_LIMIT ? Math.max(RAM_SOFT - 30, 150) : Math.max(RAM_SOFT - 80, 200)));
const STABLE_CHECKS = Number(process.env.STABLE_CHECKS || 3); // ticks stables avant reprise
const MAINT_MIN_MS = Number(process.env.MAINT_MIN_MS || 30_000); // durée min de pause
// Grâce au démarrage : Baileys charge le store, la clé, dechiffre les creds -> RAM/CPU pics normaux.
// Sans ça, le bot pouvait entrer en maintenance dès la 1re vérif et bloquer TOUTES les commandes.
const STARTUP_GRACE_MS = Number(process.env.STARTUP_GRACE_MS || 120_000);
const BOOT_AT = Date.now();

// --- État maintenance partagé
const state = {
    paused: false,
    reason: null,
    since: 0,
    stableHits: 0,
    lastCpu: process.cpuUsage(),
    lastCpuAt: Date.now(),
    lastCpuPct: 0,
};

function isPaused() { return state.paused; }
function maintenanceStatus() {
    return {
        paused: state.paused,
        reason: state.reason,
        sinceMs: state.paused ? Date.now() - state.since : 0,
        cpuPct: Math.round(state.lastCpuPct),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
}
function enterMaintenance(reason) {
    if (state.paused) return;
    // Pendant la fenêtre de démarrage on ignore les seuils auto (mais un appel manuel passe).
    if (reason && !String(reason).startsWith('manuel') && Date.now() - BOOT_AT < STARTUP_GRACE_MS) return;
    state.paused = true;
    state.reason = reason;
    state.since = Date.now();
    state.stableHits = 0;
    log(`🛠️ MAINTENANCE ON — ${reason}. Le bot ignore les nouveaux messages.`);
    try { global.gc && global.gc(); } catch {}
    cleanTemp();
}
function exitMaintenance() {
    if (!state.paused) return;
    const dur = Math.round((Date.now() - state.since) / 1000);
    log(`✅ MAINTENANCE OFF — reprise après ${dur}s.`);
    state.paused = false;
    state.reason = null;
    state.since = 0;
    state.stableHits = 0;
}

function sampleCpuPct() {
    const now = Date.now();
    const diff = process.cpuUsage(state.lastCpu); // µs depuis dernier appel
    const elapsed = Math.max(now - state.lastCpuAt, 1);
    const cpuMs = (diff.user + diff.system) / 1000;
    const cores = Math.max(require('os').cpus()?.length || 1, 1);
    const pct = (cpuMs / (elapsed * cores)) * 100;
    state.lastCpu = process.cpuUsage();
    state.lastCpuAt = now;
    state.lastCpuPct = pct;
    return pct;
}

function log(msg) { try { console.log(`[hostGuard] ${msg}`); } catch {} }

// --- 1. Crash-proof handlers (Katabump kills silent processes on exceptions)
process.on('uncaughtException', (err) => {
    log(`uncaughtException: ${err?.message || err}`);
});
process.on('unhandledRejection', (reason) => {
    log(`unhandledRejection: ${reason?.message || reason}`);
});
process.on('warning', (w) => log(`warning: ${w?.message || w}`));


// --- Détection d'un arrêt brutal (ex. process tué par le panel pour manque de mémoire) -----------
// Un petit fichier est mis à jour à chaque battement ; au prochain démarrage on sait comment le bot s'est arrêté.
const ALIVE_FILE = path.join(process.cwd(), 'data', '.alive.json');
let peakRss = 0;
function markAlive(mb, clean = false) {
    try {
        peakRss = Math.max(peakRss, Number(mb) || 0);
        fs.mkdirSync(path.dirname(ALIVE_FILE), { recursive: true });
        fs.writeFileSync(ALIVE_FILE, JSON.stringify({ clean, at: Date.now(), rss: Number(mb) || 0, peak: peakRss }));
    } catch { /* ignoré */ }
}
try {
    const previous = JSON.parse(fs.readFileSync(ALIVE_FILE, 'utf8'));
    if (previous && previous.clean === false) {
        const ago = Math.round((Date.now() - previous.at) / 60000);
        console.log(`[hostGuard] ⚠️ Arrêt brutal détecté lors de la session précédente (dernier signe de vie il y a ~${ago} min, mémoire ${previous.rss} Mo, pic ${previous.peak} Mo${MEM_LIMIT ? `, limite du serveur ${Math.round(MEM_LIMIT)} Mo` : ''}).` +
            (MEM_LIMIT && previous.peak > MEM_LIMIT * 0.85 ? ' -> très probablement un manque de mémoire.' : ' -> plutôt un arrêt/renouvellement du serveur ou une erreur.'));
    }
} catch { /* premier démarrage */ }
const markClean = () => markAlive(Math.round(process.memoryUsage().rss / 1048576), true);
process.on('exit', markClean); // arrêt normal (aussi via process.exit) ; un kill brutal ne passe jamais ici
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, markClean);
markAlive(Math.round(process.memoryUsage().rss / 1048576)); // démarrage : tant que ce n'est pas "clean", un arrêt sera considéré brutal

// --- 2. Periodic GC (needs node --expose-gc; safe no-op sinon)
setInterval(() => { try { global.gc && global.gc(); } catch {} }, GC_INTERVAL).unref();

// --- 3. Aggressive temp cleanup (default 30 min, hourly panels remplissent /tmp)
function cleanTemp() {
    const dirs = [path.join(process.cwd(), 'temp'), process.env.TMPDIR].filter(Boolean);
    const maxAge = TEMP_MAX_AGE_MIN * 60 * 1000;
    for (const dir of dirs) {
        try {
            if (!fs.existsSync(dir)) continue;
            for (const f of fs.readdirSync(dir)) {
                const p = path.join(dir, f);
                try {
                    const st = fs.statSync(p);
                    if (st.isFile() && Date.now() - st.mtimeMs > maxAge) fs.unlinkSync(p);
                } catch {}
            }
        } catch {}
    }
}
setInterval(cleanTemp, 15 * 60 * 1000).unref();
setTimeout(cleanTemp, 5000).unref();

// --- 4. Memory watchdog en 2 étages : soft = GC + purge, hard = restart
let softHits = 0;
let hardHits = 0;
setInterval(() => {
    const mb = process.memoryUsage().rss / 1024 / 1024;
    const cpuPct = sampleCpuPct();
    if (mb > RAM_HARD) {
        hardHits++;
        log(`RAM ${mb.toFixed(0)}MB > ${RAM_HARD}MB — cleanup d'urgence (hit ${hardHits}).`);
        try { global.gc && global.gc(); } catch {}
        cleanTemp();
        try {
            const store = require('./lightweight_store');
            if (store && store.messages) {
                for (const jid of Object.keys(store.messages)) {
                    const arr = store.messages[jid];
                    if (Array.isArray(arr)) store.messages[jid] = arr.slice(-5);
                }
            }
        } catch {}
        // On ne tue le process qu'après 3 hits consécutifs ET hors fenêtre de démarrage.
        // Katabump relance, mais un exit trop rapide donne l'impression que le bot "coupe seul".
        // Par défaut on NE tue plus jamais le process (c'était la cause des
        // "le bot s'arrête tout seul"). Mettre RAM_HARD_EXIT=true pour réactiver.
        if (String(process.env.RAM_HARD_EXIT || 'false').toLowerCase() === 'true'
            && hardHits >= 5 && Date.now() - BOOT_AT > STARTUP_GRACE_MS) {
            log(`RAM toujours haute après cleanup — restart demandé (RAM_HARD_EXIT=true).`);
            try { process.exit(1); } catch {}
        } else if (hardHits >= 5) {
            log('RAM haute mais restart désactivé — le bot continue de tourner.');
            hardHits = 0;
        }
        return;
    } else {
        hardHits = 0;
    }
    if (mb > RAM_SOFT) {
        softHits++;
        log(`RAM ${mb.toFixed(0)}MB > ${RAM_SOFT}MB — cleanup (hit ${softHits}).`);
        try { global.gc && global.gc(); } catch {}
        cleanTemp();
        // Trim caches connus si présents
        try {
            const store = require('./lightweight_store');
            if (store && store.messages) {
                for (const jid of Object.keys(store.messages)) {
                    const arr = store.messages[jid];
                    if (Array.isArray(arr) && arr.length > 10) store.messages[jid] = arr.slice(-10);
                }
            }
        } catch {}
    } else {
        softHits = 0;
    }

    // --- Gestion maintenance (RAM soft OU CPU élevé => pause auto)
    const ramOver = mb > RAM_SOFT;
    const cpuOver = cpuPct > CPU_SOFT;
    if (!state.paused) {
        if (ramOver || cpuOver) {
            enterMaintenance(ramOver && cpuOver
                ? `RAM ${mb.toFixed(0)}MB & CPU ${cpuPct.toFixed(0)}%`
                : ramOver ? `RAM ${mb.toFixed(0)}MB` : `CPU ${cpuPct.toFixed(0)}%`);
        }
    } else {
        const ramOk = mb < RAM_RESUME;
        const cpuOk = cpuPct < CPU_RESUME;
        const enoughTime = Date.now() - state.since >= MAINT_MIN_MS;
        if (ramOk && cpuOk && enoughTime) {
            state.stableHits++;
            if (state.stableHits >= STABLE_CHECKS) exitMaintenance();
        } else {
            state.stableHits = 0;
        }
    }
}, CHECK_INTERVAL).unref();

// --- 5. Heartbeat (montre au panel que le process n'est pas figé)
setInterval(() => {
    const mb = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
    const tag = state.paused ? ` MAINT(${state.reason})` : '';
    log(`heartbeat rss=${mb}MB cpu=${state.lastCpuPct.toFixed(0)}% uptime=${Math.round(process.uptime())}s${tag}`);
    markAlive(mb);
}, HEARTBEAT).unref();

module.exports = {
    cleanTemp,
    RAM_SOFT,
    RAM_HARD,
    isPaused,
    maintenanceStatus,
    enterMaintenance,
    exitMaintenance,
};
