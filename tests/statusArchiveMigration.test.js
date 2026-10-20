const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { migrateStatusArchive } = require('../lib/statusArchiveMigration');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-status-migrate-'));
    const legacyData = path.join(root, 'app', 'data');
    const legacyTmp = path.join(root, 'app', 'tmp');
    const volume = path.join(root, 'volume');
    const targetMediaDir = path.join(volume, 'status-media');
    fs.mkdirSync(legacyData, { recursive: true });
    fs.mkdirSync(legacyTmp, { recursive: true });
    fs.mkdirSync(volume, { recursive: true });
    return {
        root,
        legacyData,
        legacyTmp,
        volume,
        targetMediaDir,
        sourceArchivePath: path.join(legacyData, 'statusArchive.json'),
        targetArchivePath: path.join(volume, 'statusArchive.json')
    };
}

test('copies archived status media to the persistent volume and keeps the source intact', (t) => {
    const f = fixture();
    t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
    const sourceMedia = path.join(f.legacyTmp, 'status.jpg');
    fs.writeFileSync(sourceMedia, Buffer.from('status image bytes'));
    const original = { entries: [{ messageId: 'status-1', mediaPath: sourceMedia, savedAt: 123 }] };
    fs.writeFileSync(f.sourceArchivePath, JSON.stringify(original));

    const result = migrateStatusArchive({
        sourceArchivePath: f.sourceArchivePath,
        targetArchivePath: f.targetArchivePath,
        legacyMediaDirs: [f.legacyTmp, path.join(f.legacyData, 'status-media')],
        targetMediaDir: f.targetMediaDir
    });

    assert.equal(result.migrated, true);
    assert.equal(result.copiedFiles, 1);
    const migrated = JSON.parse(fs.readFileSync(f.targetArchivePath, 'utf8'));
    const migratedMedia = migrated.entries[0].mediaPath;
    assert.equal(migratedMedia.startsWith(f.targetMediaDir + path.sep), true);
    assert.equal(fs.readFileSync(migratedMedia, 'utf8'), 'status image bytes');
    assert.equal(fs.existsSync(sourceMedia), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.sourceArchivePath, 'utf8')), original);
});

test('does not overwrite an archive already present on the persistent volume', (t) => {
    const f = fixture();
    t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
    fs.writeFileSync(f.sourceArchivePath, JSON.stringify({ entries: [{ messageId: 'old' }] }));
    fs.writeFileSync(f.targetArchivePath, JSON.stringify({ entries: [{ messageId: 'new' }] }));

    const result = migrateStatusArchive({
        sourceArchivePath: f.sourceArchivePath,
        targetArchivePath: f.targetArchivePath,
        legacyMediaDirs: [f.legacyTmp],
        targetMediaDir: f.targetMediaDir
    });

    assert.equal(result.migrated, false);
    assert.equal(JSON.parse(fs.readFileSync(f.targetArchivePath, 'utf8')).entries[0].messageId, 'new');
});
