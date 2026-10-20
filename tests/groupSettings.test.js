const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bestbot-group-settings-'));
process.env.BESTBOT_USER_GROUP_DATA_PATH = path.join(tempRoot, 'userGroupData.json');
const settings = require('../lib');

test('welcome and goodbye settings are persisted independently per group', async (t) => {
    t.after(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        delete process.env.BESTBOT_USER_GROUP_DATA_PATH;
    });

    assert.equal(await settings.isWelcomeOn('group-a'), false);
    assert.equal(await settings.addWelcome('group-a', true, 'Bienvenue {user}'), true);
    assert.equal(await settings.isWelcomeOn('group-a'), true);
    assert.equal(await settings.getWelcome('group-a'), 'Bienvenue {user}');
    assert.equal(await settings.isWelcomeOn('group-b'), false);
    assert.equal(await settings.delWelcome('group-a'), true);
    assert.equal(await settings.isWelcomeOn('group-a'), false);
    assert.equal(await settings.getWelcome('group-a'), null);

    assert.equal(await settings.isGoodByeOn('group-a'), false);
    assert.equal(await settings.addGoodbye('group-a', true, 'À bientôt {user}'), true);
    assert.equal(await settings.isGoodByeOn('group-a'), true);
    assert.equal(await settings.getGoodbye('group-a'), 'À bientôt {user}');
    assert.equal(await settings.delGoodBye('group-a'), true);
    assert.equal(await settings.isGoodByeOn('group-a'), false);
});
