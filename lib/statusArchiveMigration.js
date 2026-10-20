const fs = require('fs');
const path = require('path');

function isWithin(candidatePath, directory) {
    const candidate = path.resolve(candidatePath);
    const root = path.resolve(directory);
    return candidate.startsWith(`${root}${path.sep}`);
}

function writeJsonAtomically(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
        fs.renameSync(tempPath, filePath);
        return true;
    } catch {
        try { fs.unlinkSync(tempPath); } catch {}
        return false;
    }
}

/**
 * Copy an existing status archive into the persistent volume on first startup.
 * Source files are retained; only media below explicitly allowed legacy folders
 * is copied, and the new index is committed atomically after all copies finish.
 */
function migrateStatusArchive({ sourceArchivePath, targetArchivePath, legacyMediaDirs, targetMediaDir }) {
    const source = path.resolve(sourceArchivePath);
    const target = path.resolve(targetArchivePath);
    if (source === target || !fs.existsSync(source) || fs.existsSync(target)) {
        return { migrated: false, copiedFiles: 0 };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
        if (!Array.isArray(parsed.entries)) return { migrated: false, skipped: true, copiedFiles: 0 };

        fs.mkdirSync(targetMediaDir, { recursive: true });
        const copiedPaths = new Map();
        const entries = parsed.entries.map((entry, index) => {
            const mediaPath = typeof entry?.mediaPath === 'string' ? path.resolve(entry.mediaPath) : null;
            if (!mediaPath || !legacyMediaDirs.some((directory) => isWithin(mediaPath, directory))) return entry;
            let stat;
            try { stat = fs.statSync(mediaPath); } catch { return entry; }
            if (!stat.isFile()) return entry;

            let newPath = copiedPaths.get(mediaPath);
            if (!newPath) {
                const baseName = path.basename(mediaPath);
                let serial = 0;
                do {
                    const prefix = String(index).padStart(4, '0');
                    newPath = path.join(targetMediaDir, serial ? `${prefix}-${serial}-${baseName}` : `${prefix}-${baseName}`);
                    serial += 1;
                } while (fs.existsSync(newPath));
                fs.copyFileSync(mediaPath, newPath);
                copiedPaths.set(mediaPath, newPath);
            }
            return { ...entry, mediaPath: newPath };
        });

        if (!writeJsonAtomically(target, { ...parsed, entries })) {
            return { migrated: false, skipped: true, copiedFiles: copiedPaths.size };
        }
        return { migrated: true, copiedFiles: copiedPaths.size, entries: entries.length };
    } catch {
        return { migrated: false, skipped: true, copiedFiles: 0 };
    }
}

module.exports = { migrateStatusArchive, isWithin };
