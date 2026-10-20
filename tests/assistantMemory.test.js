'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const memory = require('../lib/assistantMemory');

function withTempMemory(t) {
    const previous = process.env.BESTBOT_MEMORY_DIR;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-memory-test-'));
    process.env.BESTBOT_MEMORY_DIR = dir;
    t.after(() => {
        if (previous === undefined) delete process.env.BESTBOT_MEMORY_DIR;
        else process.env.BESTBOT_MEMORY_DIR = previous;
        fs.rmSync(dir, { recursive: true, force: true });
    });
    return dir;
}

test('canonicalizes supported WhatsApp user JIDs and rejects group/invalid identifiers', () => {
    assert.equal(memory.canonicalUserId('243123456789:17@s.whatsapp.net'), '243123456789@s.whatsapp.net');
    assert.equal(memory.canonicalUserId('12345@lid'), '12345@lid');
    assert.equal(memory.canonicalUserId('group@g.us'), null);
    assert.equal(memory.canonicalUserId('not-a-jid'), null);
});

test('stores explicit memories per user with atomic private files and prompt retrieval', (t) => {
    const dir = withTempMemory(t);
    const item = memory.addMemory('243111111111@s.whatsapp.net', 'Je prépare un projet de site web.');
    assert.ok(item.id);
    assert.match(memory.getPromptContext('243111111111@s.whatsapp.net'), /projet de site web/);
    assert.equal(memory.getPromptContext('243222222222@s.whatsapp.net'), '');
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.ok(!files[0].includes('243111111111'));
    assert.equal(fs.statSync(path.join(dir, files[0])).mode & 0o077, 0);
});

test('does not observe style before consent and stores only aggregates after consent', (t) => {
    const dir = withTempMemory(t);
    const jid = '243111111111@s.whatsapp.net';
    const raw = 'message privé qui ne doit pas rester dans le fichier';
    assert.equal(memory.observeStyle(jid, raw), false);
    memory.setLearningConsent(jid, true);
    for (let i = 0; i < 10; i += 1) memory.observeStyle(jid, `Question ${i} ? 🙂`);
    const prompt = memory.getPromptContext(jid);
    assert.match(prompt, /Tendances stylistiques observées/);
    assert.doesNotMatch(prompt, /Question 0/);
    const contents = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8');
    assert.doesNotMatch(contents, /message privé qui ne doit pas rester/);
    assert.doesNotMatch(contents, /Question 0/);
    memory.setLearningConsent(jid, false);
    assert.equal(memory.getUserSummary(jid).styleObservations.messages, 0);
    assert.equal(memory.getUserSummary(jid).consent.learning, false);
});

test('forget removes matching memories and style preferences without affecting unrelated records', (t) => {
    withTempMemory(t);
    const jid = '243111111111@s.whatsapp.net';
    memory.addMemory(jid, 'Mon projet utilise Node.js');
    memory.addMemory(jid, 'Je préfère des exemples courts');
    memory.addStylePreference(jid, 'Réponses structurées en étapes');
    assert.equal(memory.forget(jid, 'node.js').removed, 1);
    assert.equal(memory.forget(jid, 'étapes').removed, 1);
    assert.equal(memory.getUserSummary(jid).memories.length, 1);
    assert.match(memory.getUserSummary(jid).memories[0].content, /exemples courts/);
});

test('stores named project notes and retrieves matching notes selectively', (t) => {
    withTempMemory(t);
    const jid = '243111111111@s.whatsapp.net';
    memory.addProjectNote(jid, 'Bot WhatsApp', 'La base de données utilise SQLite.');
    memory.addProjectNote(jid, 'Site portfolio', 'Le frontend est construit avec React.');
    assert.match(memory.getPromptContext(jid, 'Quelle base de données pour mon Bot WhatsApp ?'), /SQLite/);
    assert.doesNotMatch(memory.getPromptContext(jid, 'Quelle base de données pour mon Bot WhatsApp ?'), /React/);
    assert.equal(memory.getUserSummary(jid).projects.length, 2);
});

test('reset removes only the requester record', (t) => {
    withTempMemory(t);
    const a = '243111111111@s.whatsapp.net';
    const b = '243222222222@s.whatsapp.net';
    memory.addMemory(a, 'souvenir A');
    memory.addMemory(b, 'souvenir B');
    assert.equal(memory.resetUser(a), true);
    assert.equal(memory.getUserSummary(a).memories.length, 0);
    assert.equal(memory.getUserSummary(b).memories.length, 1);
});

test('seeds Daniel profile only from the provided brief and accepts HTTPS photo references', (t) => {
    const dir = withTempMemory(t);
    const profile = memory.getDanielProfile();
    assert.equal(profile.fullName, 'Daniel Amisi');
    assert.equal(profile.ageDeclared, 23);
    assert.equal(profile.city, 'Beni, République démocratique du Congo');
    assert.equal(profile.profilePhotoUrl, null);
    assert.throws(() => memory.setDanielPhotoUrl('http://example.com/photo.jpg'), /HTTPS/);
    assert.throws(() => memory.setDanielPhotoUrl('https://user:pass@example.com/photo.jpg'), /HTTPS/);
    assert.equal(memory.setDanielPhotoUrl('https://example.com/photo.jpg').profilePhotoUrl, 'https://example.com/photo.jpg');
    assert.equal(memory.setDanielPhotoUrl(null).profilePhotoUrl, null);
    const updated = memory.updateDanielProfileList('technologies', 'Node.js');
    assert.deepEqual(updated.optional.technologies, ['Node.js']);
    const removed = memory.updateDanielProfileList('technologies', 'node.js', 'remove');
    assert.deepEqual(removed.optional.technologies, []);
    assert.throws(() => memory.updateDanielProfileList('unknown', 'valeur'), /Champ de profil/);
    assert.equal(memory.updateDanielProfileField('ageDeclared', '24').ageDeclared, 24);
    assert.throws(() => memory.updateDanielProfileField('ageDeclared', '999'), /âge/);
    const webp = Buffer.alloc(16);
    webp.write('RIFF', 0, 'ascii');
    webp.writeUInt32LE(8, 4);
    webp.write('WEBP', 8, 'ascii');
    const withPhoto = memory.saveDanielPhotoBuffer(webp, 'image/webp');
    assert.equal(withPhoto.profilePhotoPath, 'daniel-profile-photo.webp');
    const photoPath = path.join(dir, withPhoto.profilePhotoPath);
    assert.equal(fs.statSync(photoPath).mode & 0o077, 0);
    assert.throws(() => memory.saveDanielPhotoBuffer(Buffer.from('not an image'), 'image/jpeg'), /JPEG, PNG ou WebP/);
    memory.removeDanielPhoto();
    assert.equal(fs.existsSync(photoPath), false);
});
