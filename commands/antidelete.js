const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const isOwnerOrSudo = require('../lib/isOwner');
const { formatRdcDate } = require('../lib/time');
const { jidVariants } = require('./viewonce');
const { cleanupStatusMedia } = require('../lib/statusMediaCleanup');
const { unwrapMessageContent } = require('../lib/waMessage');
const { migrateStatusArchive } = require('../lib/statusArchiveMigration');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const DEFAULT_STATUS_DATA_DIR = path.join(__dirname, '../data');
const STATUS_DATA_DIR = process.env.BESTBOT_STATUS_DATA_DIR
    ? path.resolve(process.env.BESTBOT_STATUS_DATA_DIR)
    : DEFAULT_STATUS_DATA_DIR;
const STATUS_ARCHIVE_PATH = path.join(STATUS_DATA_DIR, 'statusArchive.json');
const TEMP_MEDIA_DIR = path.join(STATUS_DATA_DIR, 'status-media');
const LEGACY_STATUS_ARCHIVE_PATH = path.join(DEFAULT_STATUS_DATA_DIR, 'statusArchive.json');
const LEGACY_MEDIA_DIRS = [path.join(__dirname, '../tmp'), path.join(DEFAULT_STATUS_DATA_DIR, 'status-media')];
const MAX_ARCHIVE_MEDIA_BYTES = {
    image: 12 * 1024 * 1024,
    video: 64 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
    sticker: 2 * 1024 * 1024,
    document: 32 * 1024 * 1024
};

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

const statusArchiveMigration = migrateStatusArchive({
    sourceArchivePath: LEGACY_STATUS_ARCHIVE_PATH,
    targetArchivePath: STATUS_ARCHIVE_PATH,
    legacyMediaDirs: LEGACY_MEDIA_DIRS,
    targetMediaDir: TEMP_MEDIA_DIR
});
if (statusArchiveMigration.migrated) {
    console.log(`[antidelete] Archive des statuts migrée vers le stockage persistant (${statusArchiveMigration.copiedFiles} média(s) copié(s)).`);
}

function ensureJsonFile(filePath, fallback) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
        }
    } catch (error) {
        console.error(`Failed to ensure ${filePath}:`, error.message);
    }
}

ensureJsonFile(CONFIG_PATH, { enabled: false });
ensureJsonFile(STATUS_ARCHIVE_PATH, { entries: [] });

function cleanTempFolderIfLarge() {
    const result = cleanupStatusMedia(TEMP_MEDIA_DIR, STATUS_ARCHIVE_PATH);
    if (result.skipped) {
        console.warn('[antidelete] Nettoyage temp ignoré pour préserver les médias archivés.');
    } else if (result.deletedFiles) {
        console.log(`[antidelete] ${result.deletedFiles} fichier(s) temporaire(s) supprimé(s), ${result.droppedEntries} ancien(s) statut(s) écarté(s).`);
    }
}

setInterval(cleanTempFolderIfLarge, 60 * 1000);

function loadAntideleteConfig() {
    try {
        ensureJsonFile(CONFIG_PATH, { enabled: false });
        const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        return { enabled: Boolean(parsed.enabled) };
    } catch {
        return { enabled: false };
    }
}

function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Config save error:', error.message);
    }
}

function loadStatusArchive() {
    try {
        ensureJsonFile(STATUS_ARCHIVE_PATH, { entries: [] });
        const parsed = JSON.parse(fs.readFileSync(STATUS_ARCHIVE_PATH, 'utf8'));
        return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
        return [];
    }
}

function saveStatusArchive(entries) {
    try {
        fs.writeFileSync(STATUS_ARCHIVE_PATH, JSON.stringify({ entries }, null, 2));
    } catch (error) {
        console.error('Status archive save error:', error.message);
    }
}

function appendStatusArchive(entry) {
    const entries = loadStatusArchive();
    const filtered = entries.filter((item) => item.messageId !== entry.messageId);
    filtered.unshift(entry);
    saveStatusArchive(filtered.slice(0, 200));
}

function matchesArchivedStatus(sender, target) {
    if (!target) return true;

    const senderSet = new Set(jidVariants(sender));
    senderSet.add(String(sender || ''));

    const targetSet = new Set(jidVariants(target));
    targetSet.add(String(target || ''));

    for (const candidate of targetSet) {
        if (senderSet.has(candidate)) {
            return true;
        }
    }

    return false;
}

function getArchivedStatuses(target) {
    const entries = loadStatusArchive().filter((entry) => {
        if (!target) return true;
        return matchesArchivedStatus(entry.sender, target);
    });

    return entries.filter((entry) => !entry.mediaPath || fs.existsSync(entry.mediaPath));
}

function streamToBuffer(stream, maxBytes = Infinity) {
    return new Promise(async (resolve, reject) => {
        try {
            const chunks = [];
            let totalBytes = 0;
            for await (const chunk of stream) {
                totalBytes += chunk.length;
                if (totalBytes > maxBytes) throw new Error('media exceeds archive size limit');
                chunks.push(chunk);
            }
            resolve(Buffer.concat(chunks));
        } catch (error) {
            reject(error);
        }
    });
}

function sanitizeFileName(name = 'file') {
    return String(name).replace(/[\\/:*?"<>|]/g, '_');
}

function extensionFromMime(mimetype = '') {
    const mime = String(mimetype).toLowerCase();
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('zip')) return 'zip';
    if (mime.includes('rar')) return 'rar';
    if (mime.includes('7z')) return '7z';
    if (mime.includes('word')) return 'docx';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return 'xlsx';
    if (mime.includes('powerpoint') || mime.includes('presentation')) return 'pptx';
    if (mime.includes('json')) return 'json';
    if (mime.includes('plain')) return 'txt';
    if (mime.includes('jpeg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('ogg')) return 'ogg';
    return 'bin';
}

function getMessageLabel(mediaType) {
    switch (mediaType) {
        case 'image':
            return 'Image';
        case 'video':
            return 'Video';
        case 'audio':
            return 'Audio';
        case 'sticker':
            return 'Sticker';
        case 'document':
            return 'Document';
        case 'contact':
            return 'Contact';
        case 'location':
            return 'Location';
        default:
            return 'Message';
    }
}

function normalizeMessageTimestamp(message) {
    const rawTimestamp =
        message?.messageTimestampMs ||
        message?.messageTimestamp ||
        message?.timestamp ||
        Date.now();

    if (typeof rawTimestamp === 'number') {
        return rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp;
    }

    const parsed = Number(rawTimestamp);
    if (!Number.isNaN(parsed)) {
        return parsed < 1e12 ? parsed * 1000 : parsed;
    }

    const asDate = new Date(rawTimestamp);
    if (!Number.isNaN(asDate.getTime())) {
        return asDate.getTime();
    }

    return Date.now();
}

async function saveMediaToTemp(messageId, mediaNode, kind, preferredName) {
    const maxBytes = MAX_ARCHIVE_MEDIA_BYTES[kind] || 32 * 1024 * 1024;
    const declaredSize = Number(mediaNode?.fileLength?.toString?.() || mediaNode?.fileLength);
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        throw new Error(`media exceeds ${Math.floor(maxBytes / (1024 * 1024))} MB archive limit`);
    }
    const stream = await downloadContentFromMessage(mediaNode, kind);
    const buffer = await streamToBuffer(stream, maxBytes);
    if (!buffer.length) throw new Error('empty media download');
    const ext = preferredName?.includes('.') ? preferredName.split('.').pop() : extensionFromMime(mediaNode?.mimetype);
    const fileName = preferredName ? sanitizeFileName(preferredName) : `${messageId}.${ext}`;
    const mediaPath = path.join(TEMP_MEDIA_DIR, fileName);
    fs.writeFileSync(mediaPath, buffer);
    return mediaPath;
}

function extractTextContent(messageBody) {
    return (
        messageBody?.conversation ||
        messageBody?.extendedTextMessage?.text ||
        messageBody?.imageMessage?.caption ||
        messageBody?.videoMessage?.caption ||
        messageBody?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        ''
    );
}

async function extractMessageRecord(message) {
    if (!message?.message || !message.key?.id) return null;

    const sender = message.key.participant || message.participant || message.key.remoteJid;
    const remoteJid = message.key.remoteJid;
    const isStatus = remoteJid === 'status@broadcast';
    const source = unwrapMessageContent(message.message);

    const record = {
        messageId: message.key.id,
        sender,
        remoteJid,
        group: remoteJid?.endsWith('@g.us') ? remoteJid : null,
        isStatus,
        content: extractTextContent(source),
        mediaType: '',
        mediaPath: '',
        fileName: '',
        mimetype: '',
        timestamp: normalizeMessageTimestamp(message),
        savedAt: Date.now()
    };

    if (source?.imageMessage) {
        record.mediaType = 'image';
        record.content = source.imageMessage.caption || record.content;
        record.mimetype = source.imageMessage.mimetype || 'image/jpeg';
        record.mediaPath = await saveMediaToTemp(record.messageId, source.imageMessage, 'image', `${record.messageId}.${extensionFromMime(record.mimetype)}`);
        return record;
    }

    if (source?.videoMessage) {
        record.mediaType = 'video';
        record.content = source.videoMessage.caption || record.content;
        record.mimetype = source.videoMessage.mimetype || 'video/mp4';
        record.mediaPath = await saveMediaToTemp(record.messageId, source.videoMessage, 'video', `${record.messageId}.${extensionFromMime(record.mimetype)}`);
        return record;
    }

    if (source?.audioMessage) {
        record.mediaType = 'audio';
        record.mimetype = source.audioMessage.mimetype || 'audio/mpeg';
        record.mediaPath = await saveMediaToTemp(record.messageId, source.audioMessage, 'audio', `${record.messageId}.${extensionFromMime(record.mimetype)}`);
        return record;
    }

    if (source?.stickerMessage) {
        record.mediaType = 'sticker';
        record.mimetype = source.stickerMessage.mimetype || 'image/webp';
        record.mediaPath = await saveMediaToTemp(record.messageId, source.stickerMessage, 'sticker', `${record.messageId}.webp`);
        return record;
    }

    const documentMessage = source?.documentMessage || source?.documentWithCaptionMessage?.message?.documentMessage;
    if (documentMessage) {
        record.mediaType = 'document';
        record.fileName = documentMessage.fileName || `${record.messageId}.${extensionFromMime(documentMessage.mimetype)}`;
        record.mimetype = documentMessage.mimetype || 'application/octet-stream';
        record.content = documentMessage.caption || record.content;
        record.mediaPath = await saveMediaToTemp(record.messageId, documentMessage, 'document', `${record.messageId}_${sanitizeFileName(record.fileName)}`);
        return record;
    }

    if (source?.contactMessage) {
        record.mediaType = 'contact';
        record.content = source.contactMessage.displayName || source.contactMessage.vcard || 'Contact';
        return record;
    }

    if (source?.locationMessage) {
        record.mediaType = 'location';
        record.content = `Latitude: ${source.locationMessage.degreesLatitude}, Longitude: ${source.locationMessage.degreesLongitude}`;
        return record;
    }

    return record.content || record.mediaType ? record : null;
}

async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = require('../lib/jidUtils').getSender(message);
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!message.key.fromMe && !isOwner) {
        return sock.sendMessage(chatId, { text: '*Seul le propriétaire du bot peut utiliser cette commande.*' }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${config.enabled ? 'Enabled' : 'Disabled'}\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable\n*.statusdl* or *.statusview* - Voir les statuts archives`
        }, { quoted: message });
    }

    if (match === 'on') {
        config.enabled = true;
    } else if (match === 'off') {
        config.enabled = false;
    } else {
        return sock.sendMessage(chatId, { text: '*Commande invalide. Utilise .antidelete pour voir l’utilisation.*' }, { quoted: message });
    }

    saveAntideleteConfig(config);
    return sock.sendMessage(chatId, { text: `*Antidelete ${config.enabled ? 'enabled' : 'disabled'}*` }, { quoted: message });
}

async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const record = await extractMessageRecord(message);
        if (!record?.messageId) return;

        messageStore.set(record.messageId, record);

        if (record.isStatus) {
            appendStatusArchive(record);
        }
    } catch (error) {
        console.error('storeMessage error:', error.message);
    }
}

async function sendStoredMedia(sock, jid, original) {
    if (!original.mediaType || !original.mediaPath || !fs.existsSync(original.mediaPath)) return;

    const senderName = (original.sender || '').split('@')[0];
    const mediaOptions = {
        caption: `*Deleted ${getMessageLabel(original.mediaType)}*\nFrom: @${senderName}${original.fileName ? `\nFile: ${original.fileName}` : ''}`,
        mentions: original.sender ? [original.sender] : []
    };

    switch (original.mediaType) {
        case 'image':
            await sock.sendMessage(jid, { image: { url: original.mediaPath }, ...mediaOptions });
            break;
        case 'sticker':
            await sock.sendMessage(jid, { sticker: { url: original.mediaPath } });
            break;
        case 'video':
            await sock.sendMessage(jid, { video: { url: original.mediaPath }, ...mediaOptions });
            break;
        case 'audio':
            await sock.sendMessage(jid, {
                audio: { url: original.mediaPath },
                mimetype: original.mimetype || 'audio/mpeg',
                ptt: false
            });
            break;
        case 'document':
            await sock.sendMessage(jid, {
                document: { url: original.mediaPath },
                mimetype: original.mimetype || 'application/octet-stream',
                fileName: original.fileName || path.basename(original.mediaPath),
                caption: mediaOptions.caption,
                mentions: mediaOptions.mentions
            });
            break;
        default:
            break;
    }
}

async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const revokedKey = revocationMessage.message?.protocolMessage?.key;
        const messageId = revokedKey?.id;
        if (!messageId) return;

        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const deletedBy = revocationMessage.key?.participant || revocationMessage.participant || revocationMessage.key?.remoteJid;
        if (!deletedBy) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender || deletedBy;
        const senderName = sender.split('@')[0];
        const deletedByName = deletedBy.split('@')[0];
        const isStatus = original.isStatus || original.remoteJid === 'status@broadcast';

        let groupName = '';
        if (original.group) {
            try {
                groupName = (await sock.groupMetadata(original.group)).subject;
            } catch {
                groupName = original.group;
            }
        }

        const time = formatRdcDate();

        const lines = [
            '*ANTIDELETE REPORT*',
            '',
            `*Deleted By:* @${deletedByName}`,
            `*Sender:* @${senderName}`,
            `*Type:* ${isStatus ? 'Status' : getMessageLabel(original.mediaType)}`,
            `*Time:* ${time}`
        ];

        if (groupName) lines.push(`*Group:* ${groupName}`);
        if (original.fileName) lines.push(`*File:* ${original.fileName}`);
        if (original.content) lines.push('', `*Content:* ${original.content}`);

        await sock.sendMessage(ownerNumber, {
            text: lines.join('\n'),
            mentions: [deletedBy, sender]
        });

        await sendStoredMedia(sock, ownerNumber, original);

        if (!isStatus && original.mediaPath && fs.existsSync(original.mediaPath)) {
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (error) {
                console.error('Media cleanup error:', error.message);
            }
        }

        if (!isStatus) {
            messageStore.delete(messageId);
        }
    } catch (error) {
        console.error('handleMessageRevocation error:', error.message);
    }
}

function resolveStatusTargetFromMessage(message, rawText) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];

    const parts = String(rawText || '').trim().split(/\s+/).slice(1);
    const candidate = parts[0];
    if (!candidate || candidate.toLowerCase() === 'latest') return '';

    if (candidate.startsWith('@')) {
        const digits = candidate.slice(1).replace(/\D/g, '');
        return digits ? `${digits}@s.whatsapp.net` : '';
    }

    if (candidate.includes('@')) return candidate;

    const digits = candidate.replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : '';
}

async function statusDownloadCommand(sock, chatId, message, rawText) {
    try {
        const senderId = require('../lib/jidUtils').getSender(message);
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        const config = loadAntideleteConfig();

        if (!message.key.fromMe && !isOwner) {
            return sock.sendMessage(chatId, { text: 'Cette commande est reservee au proprietaire.' }, { quoted: message });
        }

        const target = resolveStatusTargetFromMessage(message, rawText);
        const entries = getArchivedStatuses(target);

        if (entries.length === 0) {
            return sock.sendMessage(chatId, {
                text: target
                    ? `Aucun status archive pour ce contact.${config.enabled ? '' : ' Active .antidelete on pour commencer a archiver les statuts.'}`
                    : config.enabled
                        ? 'Aucun status archive disponible.'
                        : 'Aucun status archive disponible. Active .antidelete on pour commencer a archiver les statuts.'
            }, { quoted: message });
        }

        const status = entries[0];
        const captionLines = [
            '*STATUS DOWNLOAD*',
            `*From:* @${status.sender.split('@')[0]}`,
            `*Saved:* ${formatRdcDate(status.timestamp || status.savedAt)}`
        ];

        if (status.content) captionLines.push(`*Caption:* ${status.content}`);

        if (!status.mediaType || !status.mediaPath || !fs.existsSync(status.mediaPath)) {
            return sock.sendMessage(chatId, {
                text: `${captionLines.join('\n')}\n\n${status.content || 'Status texte uniquement.'}`,
                mentions: [status.sender]
            }, { quoted: message });
        }

        switch (status.mediaType) {
            case 'image':
                await sock.sendMessage(chatId, {
                    image: { url: status.mediaPath },
                    caption: captionLines.join('\n'),
                    mentions: [status.sender]
                }, { quoted: message });
                break;
            case 'video':
                await sock.sendMessage(chatId, {
                    video: { url: status.mediaPath },
                    caption: captionLines.join('\n'),
                    mentions: [status.sender]
                }, { quoted: message });
                break;
            case 'audio':
                await sock.sendMessage(chatId, {
                    audio: { url: status.mediaPath },
                    mimetype: status.mimetype || 'audio/mpeg',
                    ptt: false
                }, { quoted: message });
                await sock.sendMessage(chatId, {
                    text: captionLines.join('\n'),
                    mentions: [status.sender]
                }, { quoted: message });
                break;
            case 'sticker':
                await sock.sendMessage(chatId, { sticker: { url: status.mediaPath } }, { quoted: message });
                await sock.sendMessage(chatId, {
                    text: captionLines.join('\n'),
                    mentions: [status.sender]
                }, { quoted: message });
                break;
            case 'document':
                await sock.sendMessage(chatId, {
                    document: { url: status.mediaPath },
                    mimetype: status.mimetype || 'application/octet-stream',
                    fileName: status.fileName || path.basename(status.mediaPath),
                    caption: captionLines.join('\n'),
                    mentions: [status.sender]
                }, { quoted: message });
                break;
            default:
                await sock.sendMessage(chatId, {
                    text: captionLines.join('\n'),
                    mentions: [status.sender]
                }, { quoted: message });
                break;
        }
    } catch (error) {
        console.error('statusDownloadCommand error:', error.message);
        await sock.sendMessage(chatId, { text: `Erreur statusdl: ${error.message}` }, { quoted: message });
    }
}

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage,
    statusDownloadCommand,
    getArchivedStatuses
};
