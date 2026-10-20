const fs = require('fs');
const path = require('path');

const MB = 1024 * 1024;

function safeMediaPath(mediaPath, tempDir) {
    if (typeof mediaPath !== 'string' || !mediaPath.trim()) return null;
    const root = path.resolve(tempDir);
    const resolved = path.isAbsolute(mediaPath)
        ? path.resolve(mediaPath)
        : path.resolve(root, mediaPath);
    return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function readArchive(archivePath) {
    if (!fs.existsSync(archivePath)) return { entries: [], readable: true };
    try {
        const parsed = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
        return Array.isArray(parsed.entries)
            ? { entries: parsed.entries, readable: true }
            : { entries: [], readable: false };
    } catch {
        return { entries: [], readable: false };
    }
}

function writeArchiveAtomically(archivePath, entries) {
    const directory = path.dirname(archivePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${archivePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(temporaryPath, JSON.stringify({ entries }, null, 2));
        fs.renameSync(temporaryPath, archivePath);
        return true;
    } catch {
        try { fs.unlinkSync(temporaryPath); } catch {}
        return false;
    }
}

function listFiles(tempDir) {
    try {
        return fs.readdirSync(tempDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => {
                const filePath = path.join(tempDir, entry.name);
                try {
                    const stat = fs.statSync(filePath);
                    return { path: filePath, size: stat.size, mtimeMs: stat.mtimeMs };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => a.mtimeMs - b.mtimeMs);
    } catch {
        return [];
    }
}

function removeFile(filePath) {
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
}

function entryTime(entry) {
    const value = Number(entry?.savedAt || entry?.timestamp || 0);
    return Number.isFinite(value) ? value : 0;
}

/**
 * Keep the temp media directory below a soft cap without breaking status links.
 * Unreferenced files are removed first; if needed, the oldest archived statuses
 * are dropped from the JSON index before their media files are deleted.
 */
function cleanupStatusMedia(tempDir, archivePath, options = {}) {
    const highWaterBytes = Math.max(1, Number(options.highWaterBytes) || 200 * MB);
    const requestedTarget = Number(options.targetBytes) || 180 * MB;
    const targetBytes = Math.max(0, Math.min(requestedTarget, highWaterBytes - 1));

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        const archive = readArchive(archivePath);
        const files = listFiles(tempDir);
        const bytesBefore = files.reduce((total, file) => total + file.size, 0);
        if (bytesBefore <= highWaterBytes) {
            return { triggered: false, bytesBefore, bytesAfter: bytesBefore, deletedFiles: 0, droppedEntries: 0 };
        }
        // A corrupt index could contain references we cannot see. Prefer disk use over deleting live media.
        if (!archive.readable) {
            return { triggered: true, skipped: true, bytesBefore, bytesAfter: bytesBefore, deletedFiles: 0, droppedEntries: 0 };
        }

        let bytesAfter = bytesBefore;
        let deletedFiles = 0;
        const remainingFiles = new Map(files.map((file) => [file.path, file]));
        const referenced = new Set(archive.entries
            .map((entry) => safeMediaPath(entry?.mediaPath, tempDir))
            .filter(Boolean));

        // Clear stale/unreferenced files first, preserving every indexed status.
        for (const file of files) {
            if (bytesAfter <= targetBytes) break;
            if (referenced.has(file.path)) continue;
            if (removeFile(file.path)) {
                bytesAfter -= file.size;
                deletedFiles += 1;
                remainingFiles.delete(file.path);
            }
        }

        const dropped = new Set();
        const mediaFilesToDelete = new Set();
        if (bytesAfter > targetBytes) {
            const oldestFirst = archive.entries
                .map((entry) => ({ entry, mediaPath: safeMediaPath(entry?.mediaPath, tempDir) }))
                .filter((item) => item.mediaPath && remainingFiles.has(item.mediaPath))
                .sort((a, b) => entryTime(a.entry) - entryTime(b.entry));

            for (const item of oldestFirst) {
                if (bytesAfter <= targetBytes) break;
                dropped.add(item.entry);
                const stillReferenced = archive.entries.some((other) =>
                    !dropped.has(other) && safeMediaPath(other?.mediaPath, tempDir) === item.mediaPath
                );
                if (stillReferenced || mediaFilesToDelete.has(item.mediaPath)) continue;
                mediaFilesToDelete.add(item.mediaPath);
                bytesAfter -= remainingFiles.get(item.mediaPath).size;
            }
        }

        if (dropped.size) {
            const keptEntries = archive.entries.filter((entry) => !dropped.has(entry));
            // Persist the smaller index before deleting any referenced media.
            if (!writeArchiveAtomically(archivePath, keptEntries)) {
                return { triggered: true, skipped: true, bytesBefore, bytesAfter: bytesBefore, deletedFiles, droppedEntries: 0 };
            }
            for (const filePath of mediaFilesToDelete) {
                const file = remainingFiles.get(filePath);
                if (file && removeFile(filePath)) {
                    deletedFiles += 1;
                    remainingFiles.delete(filePath);
                }
            }
        }

        const actualBytesAfter = [...remainingFiles.values()].reduce((total, file) => total + file.size, 0);
        return {
            triggered: true,
            bytesBefore,
            bytesAfter: actualBytesAfter,
            deletedFiles,
            droppedEntries: dropped.size
        };
    } catch {
        return { triggered: true, skipped: true, bytesBefore: null, bytesAfter: null, deletedFiles: 0, droppedEntries: 0 };
    }
}

module.exports = { cleanupStatusMedia, safeMediaPath };
