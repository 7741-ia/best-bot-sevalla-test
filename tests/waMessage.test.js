const assert = require('node:assert/strict');
const test = require('node:test');
const { unwrapMessageContent } = require('../lib/waMessage');

test('unwraps nested ephemeral and view-once wrappers around a voice note', () => {
    const audio = { audioMessage: { ptt: true, mimetype: 'audio/ogg; codecs=opus' } };
    const wrapped = {
        ephemeralMessage: {
            message: {
                viewOnceMessageV2Extension: { message: audio }
            }
        }
    };
    assert.equal(unwrapMessageContent(wrapped), audio);
});

test('returns direct messages unchanged and safely stops on cyclic wrappers', () => {
    const direct = { imageMessage: { caption: 'photo' } };
    assert.equal(unwrapMessageContent(direct), direct);
    const cyclic = {};
    cyclic.ephemeralMessage = { message: cyclic };
    assert.equal(unwrapMessageContent(cyclic), cyclic);
});
