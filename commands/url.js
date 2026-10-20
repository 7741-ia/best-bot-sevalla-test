const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { UploadFileUgu, TelegraPh } = require('../lib/uploader');
const { uploadMedia } = require('../lib/uploadHosts');

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

async function collectMediaStream(stream, mediaMessage) {
    const declaredSize = Number(mediaMessage?.fileLength);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES) {
        const error = new Error('MEDIA_TOO_LARGE');
        error.code = 'MEDIA_TOO_LARGE';
        throw error;
    }
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > MAX_MEDIA_BYTES) {
            const error = new Error('MEDIA_TOO_LARGE');
            error.code = 'MEDIA_TOO_LARGE';
            throw error;
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks, totalBytes);
}

async function getMediaBufferAndExt(message) {
    const m = message.message || {};
    if (m.imageMessage) {
        const stream = await downloadContentFromMessage(m.imageMessage, 'image');
        return { buffer: await collectMediaStream(stream, m.imageMessage), ext: '.jpg' };
    }
    if (m.videoMessage) {
        const stream = await downloadContentFromMessage(m.videoMessage, 'video');
        return { buffer: await collectMediaStream(stream, m.videoMessage), ext: '.mp4' };
    }
    if (m.audioMessage) {
        const stream = await downloadContentFromMessage(m.audioMessage, 'audio');
        const buffer = await collectMediaStream(stream, m.audioMessage);
        // default mp3 for voice/ptt may be opus; still use .mp3 generically
        return { buffer, ext: '.mp3' };
    }
    if (m.documentMessage) {
        const stream = await downloadContentFromMessage(m.documentMessage, 'document');
        const buffer = await collectMediaStream(stream, m.documentMessage);
        const fileName = m.documentMessage.fileName || 'file.bin';
        const extension = path.extname(fileName);
        const ext = /^\.[a-z0-9]{1,10}$/i.test(extension) ? extension : '.bin';
        return { buffer, ext };
    }
    if (m.stickerMessage) {
        const stream = await downloadContentFromMessage(m.stickerMessage, 'sticker');
        return { buffer: await collectMediaStream(stream, m.stickerMessage), ext: '.webp' };
    }
    return null;
}

async function getQuotedMediaBufferAndExt(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
    if (!quoted) return null;
    return getMediaBufferAndExt({ message: quoted });
}

async function urlCommand(sock, chatId, message) {
    try {
        // Prefer current message media, else quoted media
        let media = await getMediaBufferAndExt(message);
        if (!media) media = await getQuotedMediaBufferAndExt(message);

        if (!media) {
            await sock.sendMessage(chatId, { text: 'Envoie ou réponds à un média (image, vidéo, audio, sticker, document) pour obtenir une URL.' }, { quoted: message });
            return;
        }

        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = path.join(tempDir, `${crypto.randomUUID()}${media.ext}`);
        fs.writeFileSync(tempPath, media.buffer);

        let url = '';
        try {
            if (media.ext === '.jpg' || media.ext === '.png' || media.ext === '.webp') {
                // Try TelegraPh for images/webp first (fast, simple)
                try {
                    url = await TelegraPh(tempPath);
                } catch {
                    // Fallback to Uguu for any file type
                    const res = await UploadFileUgu(tempPath);
                    url = typeof res === 'string' ? res : (res.url || res.url_full || JSON.stringify(res));
                }
            } else {
                const res = await UploadFileUgu(tempPath);
                url = typeof res === 'string' ? res : (res.url || res.url_full || JSON.stringify(res));
            }
        } catch (primaryError) {
            console.error('[URL] hébergeurs principaux échoués, secours :', primaryError?.message || primaryError);
            url = '';
        } finally {
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        }

        if (!url) {
            try { url = await uploadMedia(media.buffer, `file${media.ext}`); } catch (e) { url = ''; }
        }

        if (!url) {
            await sock.sendMessage(chatId, { text: 'Impossible d’envoyer le média vers le service d’hébergement.' }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: `URL du média : ${url}` }, { quoted: message });
    } catch (error) {
        console.error('[URL] error:', error?.message || error);
        const text = error?.code === 'MEDIA_TOO_LARGE'
            ? 'Le média dépasse la limite de 25 Mo pour cette commande.'
            : 'Impossible de convertir ce média en URL.';
        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
}

module.exports = urlCommand;
