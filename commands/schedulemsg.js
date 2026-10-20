const fs = require('fs');
const path = require('path');

const isOwnerOrSudo = require('../lib/isOwner');
const { formatRdcDate } = require('../lib/time');

const SCHEDULE_PATH = path.join(__dirname, '../data/scheduledMessages.json');
const scheduledTimeouts = new Map();
const inFlightJobs = new Set();
const MAX_TIMEOUT_MS = 2_147_000_000;
const RETRY_DELAY_MS = 60_000;
let activeSock = null;

function ensureScheduleFile() {
    if (!fs.existsSync(SCHEDULE_PATH)) {
        fs.writeFileSync(SCHEDULE_PATH, JSON.stringify({ jobs: [] }, null, 2));
    }
}

function readJobs() {
    try {
        ensureScheduleFile();
        const parsed = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
        return Array.isArray(parsed.jobs) ? parsed.jobs : [];
    } catch {
        return [];
    }
}

function saveJobs(jobs) {
    ensureScheduleFile();
    fs.writeFileSync(SCHEDULE_PATH, JSON.stringify({ jobs }, null, 2));
}

function normalizeTarget(rawTarget, fallbackChatId, mentionedJid) {
    const value = String(rawTarget || '').trim();
    if (mentionedJid?.length) return mentionedJid[0];
    if (!value || value.toLowerCase() === 'here' || value.toLowerCase() === 'ici') return fallbackChatId;
    if (value.includes('@')) return value;

    const digits = value.replace(/\D/g, '');
    if (!digits) return fallbackChatId;

    return digits.endsWith('g.us') ? digits : `${digits}@s.whatsapp.net`;
}

function parseDateInput(dateText, timeText) {
    const normalizedDate = String(dateText || '').trim().replace(/\//g, '-');
    const normalizedTime = String(timeText || '').trim();
    const stamp = new Date(`${normalizedDate}T${normalizedTime}:00`);
    if (Number.isNaN(stamp.getTime())) return null;
    return stamp;
}

function formatJob(job) {
    return [
        `ID: ${job.id}`,
        `Cible: ${job.targetJid}`,
        `Quand: ${formatRdcDate(job.sendAt)}`,
        `Message: ${job.text}`
    ].join('\n');
}

async function dispatchJob(job) {
    if (!activeSock || inFlightJobs.has(job.id)) return;
    inFlightJobs.add(job.id);
    let delivered = false;

    try {
        await activeSock.sendMessage(job.targetJid, { text: job.text });
        delivered = true;
    } catch (error) {
        console.error(`Scheduled send failed for ${job.id}:`, error.message);
    } finally {
        inFlightJobs.delete(job.id);
        if (scheduledTimeouts.has(job.id)) {
            clearTimeout(scheduledTimeouts.get(job.id));
            scheduledTimeouts.delete(job.id);
        }
        if (delivered) {
            saveJobs(readJobs().filter((item) => item.id !== job.id));
        } else {
            scheduleJob({ ...job, sendAt: new Date(Date.now() + RETRY_DELAY_MS).toISOString() });
        }
    }
}

function scheduleJob(job) {
    if (inFlightJobs.has(job.id)) return;
    if (scheduledTimeouts.has(job.id)) {
        clearTimeout(scheduledTimeouts.get(job.id));
        scheduledTimeouts.delete(job.id);
    }

    const targetTime = new Date(job.sendAt).getTime();
    if (!Number.isFinite(targetTime)) return;
    const delayMs = targetTime - Date.now();
    if (delayMs <= 0) {
        setImmediate(() => dispatchJob(job));
        return;
    }

    const timeout = setTimeout(() => {
        scheduledTimeouts.delete(job.id);
        if (targetTime > Date.now()) scheduleJob(job);
        else dispatchJob(job);
    }, Math.min(delayMs, MAX_TIMEOUT_MS));
    scheduledTimeouts.set(job.id, timeout);
}

function initScheduler(sock) {
    activeSock = sock;
    for (const job of readJobs()) {
        scheduleJob(job);
    }
}

async function scheduleMessageCommand(sock, chatId, message, rawText) {
    try {
        const senderId = require('../lib/jidUtils').getSender(message);
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!message.key.fromMe && !isOwner) {
            return sock.sendMessage(chatId, { text: 'Cette commande est reservee au proprietaire.' }, { quoted: message });
        }

        const body = String(rawText || '').trim();
        const args = body.split(/\s+/).slice(1);

        if (!args.length) {
            return sock.sendMessage(chatId, {
                text:
                    '*SCHEDULE MESSAGE*\n\n' +
                    '.schedulemsg 2026-04-16 18:30 | here | Bonsoir le groupe\n' +
                    '.schedulemsg 2026-04-16 18:30 | 243000000000 | Salut\n' +
                    '.schedulemsg list\n' +
                    '.schedulemsg cancel <id>'
            }, { quoted: message });
        }

        const subcommand = args[0].toLowerCase();

        if (subcommand === 'list') {
            const jobs = readJobs();
            if (!jobs.length) {
                return sock.sendMessage(chatId, { text: 'Aucun message programme.' }, { quoted: message });
            }

            const text = jobs.map(formatJob).join('\n\n');
            return sock.sendMessage(chatId, { text }, { quoted: message });
        }

        if (subcommand === 'cancel') {
            const id = args[1];
            if (!id) {
                return sock.sendMessage(chatId, { text: 'Utilise .schedulemsg cancel <id>' }, { quoted: message });
            }

            const jobs = readJobs();
            const exists = jobs.some((job) => job.id === id);
            if (!exists) {
                return sock.sendMessage(chatId, { text: 'ID introuvable.' }, { quoted: message });
            }

            saveJobs(jobs.filter((job) => job.id !== id));
            if (scheduledTimeouts.has(id)) {
                clearTimeout(scheduledTimeouts.get(id));
                scheduledTimeouts.delete(id);
            }

            return sock.sendMessage(chatId, { text: `Message programme annule: ${id}` }, { quoted: message });
        }

        const parts = body.replace(/^\.schedulemsg\s+/i, '').split('|').map((part) => part.trim());
        if (parts.length < 3) {
            return sock.sendMessage(chatId, {
                text: 'Format: .schedulemsg YYYY-MM-DD HH:MM | cible | message'
            }, { quoted: message });
        }

        const [dateAndTime, rawTarget, ...messageParts] = parts;
        const targetText = messageParts.join(' | ').trim();
        const timeMatch = dateAndTime.match(/^(\d{4}[-/]\d{2}[-/]\d{2})\s+(\d{2}:\d{2})$/);
        if (!timeMatch) {
            return sock.sendMessage(chatId, {
                text: 'Date invalide. Exemple: .schedulemsg 2026-04-16 18:30 | here | Salut'
            }, { quoted: message });
        }

        const sendAt = parseDateInput(timeMatch[1], timeMatch[2]);
        if (!sendAt) {
            return sock.sendMessage(chatId, { text: 'Date ou heure invalide.' }, { quoted: message });
        }

        if (sendAt.getTime() <= Date.now()) {
            return sock.sendMessage(chatId, { text: 'Choisis une date future.' }, { quoted: message });
        }

        if (!targetText) {
            return sock.sendMessage(chatId, { text: 'Le message a envoyer est vide.' }, { quoted: message });
        }

        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const targetJid = normalizeTarget(rawTarget, chatId, mentionedJid);
        const job = {
            id: `sch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date().toISOString(),
            sendAt: sendAt.toISOString(),
            targetJid,
            text: targetText,
            createdBy: senderId
        };

        const jobs = readJobs();
        jobs.push(job);
        saveJobs(jobs);
        activeSock = sock;
        scheduleJob(job);

        return sock.sendMessage(chatId, {
            text:
                '*Message programme*\n' +
                `ID: ${job.id}\n` +
                `Cible: ${job.targetJid}\n` +
                `Envoi: ${formatRdcDate(sendAt)}\n` +
                `Texte: ${job.text}`
        }, { quoted: message });
    } catch (error) {
        console.error('scheduleMessageCommand error:', error.message);
        await sock.sendMessage(chatId, { text: `Erreur schedulemsg: ${error.message}` }, { quoted: message });
    }
}

module.exports = {
    initScheduler,
    scheduleMessageCommand
};
