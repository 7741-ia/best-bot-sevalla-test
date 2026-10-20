'use strict';

const fs = require('fs/promises');
const path = require('path');

const root = path.resolve(__dirname);
const configuredAge = Number(process.env.TEMP_MAX_AGE_MIN);
const maxAgeMinutes = Number.isFinite(configuredAge) && configuredAge >= 60 && configuredAge <= 43200
    ? configuredAge
    : 1440;
const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
let removed = 0;

async function cleanDirectory(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }

    for (const entry of entries) {
        const target = path.join(directory, entry.name);
        let stat;
        try { stat = await fs.lstat(target); } catch { continue; }
        if (stat.mtimeMs >= cutoff) continue;

        try {
            if (stat.isDirectory() && !stat.isSymbolicLink()) {
                await cleanDirectory(target);
                const remaining = await fs.readdir(target);
                if (remaining.length === 0) {
                    await fs.rmdir(target);
                    removed += 1;
                }
            } else {
                await fs.unlink(target);
                removed += 1;
            }
        } catch (error) {
            if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) {
                console.warn(`[cleanup] entrée ignorée (${error.code || 'erreur'})`);
            }
        }
    }
}

(async () => {
    for (const name of ['temp', 'tmp']) {
        const directory = path.resolve(root, name);
        if (path.dirname(directory) !== root) throw new Error('Répertoire temporaire hors racine');
        await cleanDirectory(directory);
    }
    console.log(`[cleanup] ${removed} entrée(s) temporaires expirée(s) supprimée(s), seuil ${maxAgeMinutes} min.`);
})().catch((error) => {
    console.error(`[cleanup] échec (${error.code || error.name || 'erreur'})`);
    process.exitCode = 1;
});
