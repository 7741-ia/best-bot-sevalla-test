const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const { DEFAULT_TIMEZONE, formatRdcDate } = require('../lib/time');

const DATA_PATH = path.join(__dirname, '../data/userGroupData.json');
const DEFAULT_WARNING_MINUTES = 5;
const DEFAULT_WARNING_MESSAGE = 'On se voit encore';
const DEFAULT_CLOSE_MESSAGE = 'Le groupe est ferme.';
const DEFAULT_OPEN_MESSAGE = 'Le groupe est ouvert a nouveau.';
const SCHEDULE_TICK_MS = 20_000;

let activeSock = null;
let scheduleTimer = null;

function readData() {
    try {
        if (!fs.existsSync(DATA_PATH)) return {};
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (error) {
        console.error('Failed to read group hours data:', error.message);
        return {};
    }
}

function saveData(data) {
    try {
        fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save group hours data:', error.message);
        return false;
    }
}

function ensureBucket(data) {
    if (!data.groupHours || typeof data.groupHours !== 'object' || Array.isArray(data.groupHours)) {
        data.groupHours = {};
    }
    return data.groupHours;
}

function stripCommandPrefix(text) {
    return String(text || '').trim().replace(/^\.\S+\s*/i, '');
}

function normalizeTimeText(value) {
    const text = String(value || '').trim();
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) return null;
    return text;
}

function parseWarningMinutes(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1440) return DEFAULT_WARNING_MINUTES;
    return parsed;
}

function buildMomentForTime(referenceMoment, timeText) {
    const normalized = normalizeTimeText(timeText);
    if (!normalized) return null;

    const [hour, minute] = normalized.split(':').map((part) => Number.parseInt(part, 10));
    return referenceMoment
        .clone()
        .startOf('day')
        .hour(hour)
        .minute(minute)
        .second(0)
        .millisecond(0);
}

function getNextOccurrence(timeText, timezone, reference = moment()) {
    const zone = timezone || DEFAULT_TIMEZONE;
    const now = moment(reference).tz(zone);
    let target = buildMomentForTime(now, timeText);
    if (!target) return null;
    if (target.isBefore(now)) {
        target = target.add(1, 'day');
    }
    return target;
}

function getNextWarningOccurrence(configData, reference = moment()) {
    const zone = configData.timezone || DEFAULT_TIMEZONE;
    const now = moment(reference).tz(zone);
    const closeMoment = buildMomentForTime(now, configData.closeTime);
    if (!closeMoment) return null;

    const warningMinutes = parseWarningMinutes(configData.warningMinutes);
    let warningMoment = closeMoment.clone().subtract(warningMinutes, 'minutes');

    if (warningMoment.isBefore(now)) {
        warningMoment = closeMoment.clone().add(1, 'day').subtract(warningMinutes, 'minutes');
    }

    return warningMoment;
}

function getConfig(groupId) {
    const data = readData();
    return data.groupHours?.[groupId] || null;
}

function updateConfig(groupId, patch, enableIfMissing = true) {
    const data = readData();
    const bucket = ensureBucket(data);
    const current = bucket[groupId] || {
        enabled: false,
        closeTime: '',
        openTime: '',
        warningMinutes: DEFAULT_WARNING_MINUTES,
        warningMessage: DEFAULT_WARNING_MESSAGE,
        closeMessage: DEFAULT_CLOSE_MESSAGE,
        openMessage: DEFAULT_OPEN_MESSAGE,
        timezone: DEFAULT_TIMEZONE,
        lastTriggered: {}
    };

    const next = {
        ...current,
        ...patch,
        lastTriggered: patch.lastTriggered
            ? { ...(patch.lastTriggered || {}) }
            : { ...(current.lastTriggered || {}) },
        lastUpdated: Date.now()
    };

    if (!bucket[groupId]) {
        next.enabled = enableIfMissing ? true : false;
    }

    bucket[groupId] = next;
    saveData(data);
    return next;
}

function removeConfig(groupId) {
    const data = readData();
    const bucket = ensureBucket(data);
    if (bucket[groupId]) {
        delete bucket[groupId];
        saveData(data);
    }
}

function formatScheduleStatus(configData, reference = moment()) {
    if (!configData?.enabled) {
        return '*Group hours*\nStatus: OFF';
    }

    const zone = configData.timezone || DEFAULT_TIMEZONE;
    const nextClose = getNextOccurrence(configData.closeTime, zone, reference);
    const nextOpen = getNextOccurrence(configData.openTime, zone, reference);
    const nextWarning = getNextWarningOccurrence(configData, reference);

    return [
        '*Group hours*',
        'Status: ON',
        `Timezone: ${zone} (Beni, Nord-Kivu, RDC)`,
        `Close time: ${configData.closeTime || '--:--'}`,
        `Open time: ${configData.openTime || '--:--'}`,
        `Warning: ${configData.warningMinutes ?? DEFAULT_WARNING_MINUTES} min before close`,
        `Warning message: ${configData.warningMessage || DEFAULT_WARNING_MESSAGE}`,
        `Next warning: ${nextWarning ? formatRdcDate(nextWarning.toDate()) : 'not set'}`,
        `Next close: ${nextClose ? formatRdcDate(nextClose.toDate()) : 'not set'}`,
        `Next open: ${nextOpen ? formatRdcDate(nextOpen.toDate()) : 'not set'}`
    ].join('\n');
}

function parseScheduleInput(rawText) {
    const body = stripCommandPrefix(rawText);
    if (!body) return { mode: 'help' };

    const segments = body.split('|').map((part) => part.trim());
    const main = segments[0] || '';
    const tokens = main.split(/\s+/).filter(Boolean);
    const first = (tokens[0] || '').toLowerCase();

    if (!first) return { mode: 'help' };
    if (['help', 'usage'].includes(first)) return { mode: 'help' };
    if (['status', 'show', 'get'].includes(first)) return { mode: 'status' };
    if (['off', 'disable', 'stop'].includes(first)) return { mode: 'off' };

    let offset = 0;
    if (['set', 'on', 'enable'].includes(first)) {
        offset = 1;
    }

    const closeTime = normalizeTimeText(tokens[offset]);
    const openTime = normalizeTimeText(tokens[offset + 1]);
    const warningMinutes = tokens[offset + 2] ? parseWarningMinutes(tokens[offset + 2]) : DEFAULT_WARNING_MINUTES;
    const warningMessage = segments[1] || '';

    if (!closeTime || !openTime) {
        return { mode: 'invalid' };
    }

    return {
        mode: 'set',
        closeTime,
        openTime,
        warningMinutes,
        warningMessage
    };
}

function buildSetSummary(groupId, configData) {
    const nextClose = getNextOccurrence(configData.closeTime, configData.timezone || DEFAULT_TIMEZONE);
    const nextOpen = getNextOccurrence(configData.openTime, configData.timezone || DEFAULT_TIMEZONE);
    const nextWarning = getNextWarningOccurrence(configData);

    return [
        '*Horaire groupe enregistre*',
        `Close: ${configData.closeTime}`,
        `Open: ${configData.openTime}`,
        `Warning: ${configData.warningMinutes ?? DEFAULT_WARNING_MINUTES} min before close`,
        `Message: ${configData.warningMessage || DEFAULT_WARNING_MESSAGE}`,
        `Timezone: ${configData.timezone || DEFAULT_TIMEZONE} (Beni, Nord-Kivu, RDC)`,
        `Next warning: ${nextWarning ? formatRdcDate(nextWarning.toDate()) : 'not set'}`,
        `Next close: ${nextClose ? formatRdcDate(nextClose.toDate()) : 'not set'}`,
        `Next open: ${nextOpen ? formatRdcDate(nextOpen.toDate()) : 'not set'}`
    ].join('\n');
}

async function handleGroupHoursCommand(sock, chatId, rawText, senderId, isSenderAdmin, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement etre utilisee dans un groupe.' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```Commande reservee aux admins du groupe !```' }, { quoted: message });
            return;
        }

        const parsed = parseScheduleInput(rawText);

        if (parsed.mode === 'help') {
            const usage = [
                '```GROUP HOURS',
                '',
                '.heuresgroupe 21:00 07:00 5 | On se voit encore',
                '.heuresgroupe set 21:00 07:00 5 | On se voit encore',
                '.heuresgroupe status',
                '.heuresgroupe off',
                '```',
                'Aliases: .grouphours, .groupopenclose',
                'Le bot fermera le groupe a l heure choisie, enverra un avertissement avant la fermeture, puis le rouvrira a la prochaine heure en heure de Beni (Africa/Lubumbashi).'
            ].join('\n');
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        if (parsed.mode === 'status') {
            const current = getConfig(chatId);
            await sock.sendMessage(chatId, { text: formatScheduleStatus(current) }, { quoted: message });
            return;
        }

        if (parsed.mode === 'off') {
            removeConfig(chatId);
            await sock.sendMessage(chatId, { text: 'Horaire groupe desactive.' }, { quoted: message });
            return;
        }

        if (parsed.mode === 'invalid') {
            await sock.sendMessage(chatId, {
                text: 'Format invalide. Exemple: .heuresgroupe 21:00 07:00 5 | On se voit encore'
            }, { quoted: message });
            return;
        }

        const closeMoment = buildMomentForTime(moment().tz(DEFAULT_TIMEZONE), parsed.closeTime);
        const openMoment = buildMomentForTime(moment().tz(DEFAULT_TIMEZONE), parsed.openTime);
        if (!closeMoment || !openMoment) {
            await sock.sendMessage(chatId, { text: 'Heure invalide. Utilise le format HH:MM.' }, { quoted: message });
            return;
        }

        if (parsed.closeTime === parsed.openTime) {
            await sock.sendMessage(chatId, { text: 'La fermeture et l ouverture ne peuvent pas avoir la meme heure.' }, { quoted: message });
            return;
        }

        const updated = updateConfig(chatId, {
            enabled: true,
            closeTime: parsed.closeTime,
            openTime: parsed.openTime,
            warningMinutes: parsed.warningMinutes,
            warningMessage: parsed.warningMessage || DEFAULT_WARNING_MESSAGE,
            timezone: DEFAULT_TIMEZONE,
            closeMessage: DEFAULT_CLOSE_MESSAGE,
            openMessage: DEFAULT_OPEN_MESSAGE,
            lastTriggered: {}
        });

        await sock.sendMessage(chatId, { text: buildSetSummary(chatId, updated) }, { quoted: message });
    } catch (error) {
        console.error('Error in group hours command:', error);
        await sock.sendMessage(chatId, { text: 'Impossible de configurer les horaires du groupe.' }, { quoted: message });
    }
}

async function processScheduleForGroup(groupId) {
    if (!activeSock) return;

    const configData = getConfig(groupId);
    if (!configData?.enabled) return;

    const zone = configData.timezone || DEFAULT_TIMEZONE;
    const now = moment().tz(zone);
    const closeMoment = buildMomentForTime(now, configData.closeTime);
    const openMoment = buildMomentForTime(now, configData.openTime);
    if (!closeMoment || !openMoment) return;

    const warningMinutes = parseWarningMinutes(configData.warningMinutes);
    const warningMoment = closeMoment.clone().subtract(warningMinutes, 'minutes');
    const currentStamp = now.format('YYYY-MM-DD HH:mm');
    const warningStamp = warningMoment.format('YYYY-MM-DD HH:mm');
    const closeStamp = closeMoment.format('YYYY-MM-DD HH:mm');
    const openStamp = openMoment.format('YYYY-MM-DD HH:mm');
    const lastTriggered = configData.lastTriggered || {};

    if (currentStamp === warningStamp && lastTriggered.warn !== warningStamp) {
        const nextOpenMoment = getNextOccurrence(configData.openTime, zone, now);
        const warningText = [
            (configData.warningMessage || DEFAULT_WARNING_MESSAGE) + '.',
            `Fermeture a ${configData.closeTime}.`,
            `Prochaine ouverture: ${formatRdcDate(nextOpenMoment?.toDate() || now.toDate())}.`
        ].join('\n');

        try {
            await activeSock.sendMessage(groupId, { text: warningText });
        } catch (error) {
            console.error(`Failed to send group close warning for ${groupId}:`, error.message);
        }

        updateConfig(groupId, {
            lastTriggered: {
                ...lastTriggered,
                warn: warningStamp
            }
        }, false);
    }

    if (currentStamp === closeStamp && lastTriggered.close !== closeStamp) {
        try {
            await activeSock.groupSettingUpdate(groupId, 'announcement');
            const closeText = [
                DEFAULT_CLOSE_MESSAGE,
                `Prochaine ouverture a ${formatRdcDate(getNextOccurrence(configData.openTime, zone, now)?.toDate() || now.toDate())}.`
            ].join('\n');
            await activeSock.sendMessage(groupId, { text: closeText });
        } catch (error) {
            console.error(`Failed to close group ${groupId}:`, error.message);
        }

        updateConfig(groupId, {
            lastTriggered: {
                ...lastTriggered,
                close: closeStamp
            }
        }, false);
    }

    if (currentStamp === openStamp && lastTriggered.open !== openStamp) {
        try {
            await activeSock.groupSettingUpdate(groupId, 'not_announcement');
            const openText = [
                DEFAULT_OPEN_MESSAGE,
                `Prochaine fermeture a ${formatRdcDate(getNextOccurrence(configData.closeTime, zone, now)?.toDate() || now.toDate())}.`
            ].join('\n');
            await activeSock.sendMessage(groupId, { text: openText });
        } catch (error) {
            console.error(`Failed to open group ${groupId}:`, error.message);
        }

        updateConfig(groupId, {
            lastTriggered: {
                ...lastTriggered,
                open: openStamp
            }
        }, false);
    }
}

async function runScheduleTick() {
    const data = readData();
    const groupHours = data.groupHours || {};
    for (const [groupId, configData] of Object.entries(groupHours)) {
        if (!configData?.enabled) continue;
        await processScheduleForGroup(groupId);
    }
}

function initGroupHoursScheduler(sock) {
    activeSock = sock;
    if (scheduleTimer) return;

    scheduleTimer = setInterval(() => {
        runScheduleTick().catch((error) => {
            console.error('Group hours scheduler error:', error.message);
        });
    }, SCHEDULE_TICK_MS);

    if (typeof scheduleTimer.unref === 'function') {
        scheduleTimer.unref();
    }

    runScheduleTick().catch((error) => {
        console.error('Group hours scheduler initial run error:', error.message);
    });
}

module.exports = {
    handleGroupHoursCommand,
    initGroupHoursScheduler
};
