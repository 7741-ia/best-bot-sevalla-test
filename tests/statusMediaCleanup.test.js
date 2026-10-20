const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { cleanupStatusMedia } = require('../lib/statusMediaCleanup');

function makeFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-status-cleanup-'));
    const tempDir = path.join(root, 'tmp');
    const archivePath = path.join(root, 'data', 'statusArchive.json');
    fs.mkdirSync(tempDir, { recursive: true });
    return { root, tempDir, archivePath };
}

function makeFile(filePath, size, ageSeconds = 0) {
    fs.writeFileSync(filePath, Buffer.alloc(size, 1));
    const date = new Date(Date.now() - ageSeconds * 1000);
    fs.utimesSync(filePath, date, date);
}

test('prunes unreferenced files and oldest status entries before deleting their media', (t) => {
    const { root, tempDir, archivePath } = makeFixture();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const oldMedia = path.join(tempDir, 'old.jpg');
    const recentMedia = path.join(tempDir, 'recent.jpg');
    const orphanMedia = path.join(tempDir, 'orphan.tmp');
    makeFile(oldMedia, 60, 30);
    makeFile(recentMedia, 50, 10);
    makeFile(orphanMedia, 40, 20);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, JSON.stringify({ entries: [
        { messageId: 'recent', savedAt: 200, mediaPath: recentMedia },
        { messageId: 'old', savedAt: 100, mediaPath: oldMedia }
    ] }));

    const result = cleanupStatusMedia(tempDir, archivePath, { highWaterBytes: 100, targetBytes: 50 });

    assert.equal(result.triggered, true);
    assert.equal(result.bytesBefore, 150);
    assert.equal(result.bytesAfter, 50);
    assert.equal(result.droppedEntries, 1);
    assert.equal(fs.existsSync(orphanMedia), false);
    assert.equal(fs.existsSync(oldMedia), false);
    assert.equal(fs.existsSync(recentMedia), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(archivePath, 'utf8')).entries.map((item) => item.messageId), ['recent']);
});

test('does not delete files when the archive index cannot be read safely', (t) => {
    const { root, tempDir, archivePath } = makeFixture();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const media = path.join(tempDir, 'kept.jpg');
    makeFile(media, 120);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, '{broken json');

    const result = cleanupStatusMedia(tempDir, archivePath, { highWaterBytes: 100, targetBytes: 50 });

    assert.equal(result.skipped, true);
    assert.equal(fs.existsSync(media), true);
});

test('does nothing below the configured high-water mark', (t) => {
    const { root, tempDir, archivePath } = makeFixture();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const media = path.join(tempDir, 'kept.jpg');
    makeFile(media, 20);

    const result = cleanupStatusMedia(tempDir, archivePath, { highWaterBytes: 100, targetBytes: 50 });

    assert.equal(result.triggered, false);
    assert.equal(result.bytesAfter, 20);
    assert.equal(fs.existsSync(media), true);
});
