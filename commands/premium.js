const axios = require('axios');
const sharp = require('../lib/lazy')('sharp');
const settings = require('../settings');
const isOwnerOrSudo = require('../lib/isOwner');
const { addPremium, removePremium, getPremiumList, isPremium } = require('../lib/index');
const { formatRdcDate } = require('../lib/time');

function getRawText(message) {
    return String(
        message?.message?.conversation ||
        message?.message?.extendedTextMessage?.text ||
        ''
    ).trim();
}

function getContextInfo(message) {
    return message?.message?.extendedTextMessage?.contextInfo || {};
}

function normalizeKey(userId) {
    const normalized = String(userId || '').trim().split(':')[0];
    if (!normalized) return '';
    return normalized.split('@')[0];
}

function extractTargetJid(message, fallbackJid = null) {
    const context = getContextInfo(message);

    if (Array.isArray(context.mentionedJid) && context.mentionedJid.length > 0) {
        return context.mentionedJid[0];
    }

    if (context.participant) {
        return context.participant;
    }

    const rawText = getRawText(message);
    const numberMatch = rawText.match(/\b(\d{7,15})\b/);
    if (numberMatch) {
        return `${numberMatch[1]}@s.whatsapp.net`;
    }

    return fallbackJid;
}

function escapeXml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function truncateText(text, maxLength = 42) {
    const value = String(text || '').trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function wrapText(text, maxChars = 42, maxLines = 3) {
    const clean = String(text || '').trim();
    if (!clean) return [];

    const words = clean.split(/\s+/);
    const lines = [];
    let current = '';

    const pushCurrent = () => {
        if (current.trim()) {
            lines.push(current.trim());
            current = '';
        }
    };

    for (const word of words) {
        if (!word) continue;

        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }

        pushCurrent();

        if (word.length > maxChars) {
            lines.push(`${word.slice(0, Math.max(0, maxChars - 3))}...`);
        } else {
            current = word;
        }

        if (lines.length >= maxLines) {
            break;
        }
    }

    if (lines.length < maxLines) {
        pushCurrent();
    }

    if (lines.length > maxLines) {
        return lines.slice(0, maxLines);
    }

    return lines;
}

function getInitials(name) {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 0) return 'BK';

    const initials = parts
        .slice(0, 2)
        .map((part) => part[0] || '')
        .join('')
        .toUpperCase();

    return initials || 'BK';
}

function createFallbackAvatar(name) {
    const initials = escapeXml(getInitials(name));
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#111827"/>
                    <stop offset="100%" stop-color="#f5d06f"/>
                </linearGradient>
            </defs>
            <rect width="500" height="500" rx="250" fill="url(#g)"/>
            <circle cx="250" cy="250" r="180" fill="#0b1220" fill-opacity="0.55"/>
            <text x="250" y="285" text-anchor="middle" font-family="Arial, sans-serif" font-size="160" font-weight="800" fill="#ffffff">${initials}</text>
        </svg>
    `;

    return Buffer.from(svg);
}

async function fetchAvatarBuffer(sock, jid, displayName) {
    let avatarUrl = null;

    try {
        avatarUrl = await sock.profilePictureUrl(jid, 'image');
    } catch (_) {
        avatarUrl = null;
    }

    if (avatarUrl) {
        try {
            const response = await axios.get(avatarUrl, {
                responseType: 'arraybuffer',
                timeout: 15000
            });
            return Buffer.from(response.data);
        } catch (_) {
            // Fall through to fallback avatar
        }
    }

    return createFallbackAvatar(displayName);
}

async function makeRoundAvatar(buffer) {
    const mask = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">
            <circle cx="130" cy="130" r="130" fill="#ffffff"/>
        </svg>
    `);

    return sharp(buffer)
        .resize(260, 260, { fit: 'cover' })
        .png()
        .composite([{ input: mask, blend: 'dest-in' }])
        .toBuffer();
}

function buildCardSvg({
    targetName,
    targetHandle,
    statusLabel,
    noteLines,
    metaLines,
    requesterName
}) {
    const noteBlock = (noteLines.length > 0 ? noteLines : ['Premium access active'])
        .map((line, index) => {
            const dy = index === 0 ? 0 : 36;
            return `<tspan x="430" dy="${dy}">${escapeXml(line)}</tspan>`;
        })
        .join('');

    const metaBlock = metaLines
        .filter(Boolean)
        .map((line, index) => {
            const y = 620 + (index * 34);
            return `<text x="430" y="${y}" font-family="Arial, sans-serif" font-size="22" fill="#94a3b8">${escapeXml(line)}</text>`;
        })
        .join('');

    const requesterLine = requesterName
        ? `<text x="430" y="700" font-family="Arial, sans-serif" font-size="20" fill="#64748b">Requested by: ${escapeXml(requesterName)}</text>`
        : '';

    return Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="800" viewBox="0 0 1400 800">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#030712"/>
                    <stop offset="48%" stop-color="#0b1220"/>
                    <stop offset="100%" stop-color="#1a1430"/>
                </linearGradient>
                <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#f5d06f"/>
                    <stop offset="100%" stop-color="#b8871a"/>
                </linearGradient>
            </defs>
            <rect width="1400" height="800" rx="44" fill="url(#bg)"/>
            <circle cx="1180" cy="120" r="230" fill="#f5d06f" fill-opacity="0.08"/>
            <circle cx="230" cy="650" r="280" fill="#38bdf8" fill-opacity="0.06"/>
            <path d="M980,90 L1320,90 L1240,270 L900,270 Z" fill="#f5d06f" fill-opacity="0.06"/>
            <rect x="66" y="66" width="1268" height="668" rx="38" fill="#08101d" fill-opacity="0.78" stroke="#f5d06f" stroke-opacity="0.18" stroke-width="2"/>
            <rect x="106" y="110" width="300" height="580" rx="32" fill="#0d1628" stroke="#f5d06f" stroke-opacity="0.18"/>
            <circle cx="256" cy="360" r="154" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>
            <circle cx="256" cy="360" r="138" fill="none" stroke="url(#gold)" stroke-width="10" stroke-opacity="0.75"/>
            <rect x="430" y="126" width="220" height="46" rx="23" fill="#f5d06f" fill-opacity="0.15" stroke="#f5d06f" stroke-opacity="0.65"/>
            <text x="540" y="157" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="3" fill="#f5d06f">PREMIUM ACCESS</text>
            <text x="430" y="250" font-family="Arial, sans-serif" font-size="62" font-weight="800" fill="#ffffff">${escapeXml(truncateText(targetName, 32))}</text>
            <text x="430" y="304" font-family="Arial, sans-serif" font-size="28" fill="#cbd5e1">@${escapeXml(truncateText(targetHandle, 28))}</text>
            <rect x="430" y="344" width="250" height="52" rx="18" fill="#0f172a" stroke="url(#gold)" stroke-opacity="0.55"/>
            <text x="555" y="379" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#f5d06f">${escapeXml(statusLabel)}</text>
            <text x="430" y="448" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#e2e8f0">Note</text>
            <text x="430" y="494" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="#ffffff">${noteBlock}</text>
            ${metaBlock}
            ${requesterLine}
            <text x="430" y="736" font-family="Arial, sans-serif" font-size="18" fill="#64748b">${escapeXml(settings.botName || 'BestBot')} premium tools</text>
        </svg>
    `);
}

async function buildPremiumCard(sock, targetJid, requesterName, note, chatId) {
    const displayName = await sock.getName(targetJid).catch(() => '');
    const targetName = String(displayName || targetJid.split('@')[0] || 'Premium user').trim();
    const targetHandle = targetJid.split('@')[0] || 'user';
    const premiumList = await getPremiumList();
    const premiumInfo = premiumList.find((entry) => normalizeKey(entry.key || entry.jid) === normalizeKey(targetJid)) || null;
    const ownerAccess = await isOwnerOrSudo(targetJid, sock, chatId || null);

    const statusLabel = premiumInfo ? 'PREMIUM ACTIVE' : (ownerAccess ? 'OWNER ACCESS' : 'VIP CARD');
    const noteLines = wrapText(note || 'Premium access granted', 42, 3);
    const metaLines = [];

    if (premiumInfo?.addedAt) {
        metaLines.push(`Added: ${formatRdcDate(premiumInfo.addedAt)}`);
    }

    if (premiumInfo?.addedBy) {
        const addedByLabel = premiumInfo.addedBy.includes('@')
            ? `@${premiumInfo.addedBy.split('@')[0]}`
            : premiumInfo.addedBy;
        metaLines.push(`Granted by: ${addedByLabel}`);
    } else if (ownerAccess) {
        metaLines.push('Role: owner / sudo');
    }

    const requesterLine = requesterName ? truncateText(requesterName, 36) : '';
    const avatarBuffer = await fetchAvatarBuffer(sock, targetJid, targetName);
    const roundedAvatar = await makeRoundAvatar(avatarBuffer);
    const cardSvg = buildCardSvg({
        targetName,
        targetHandle,
        statusLabel,
        noteLines,
        metaLines,
        requesterName: requesterLine
    });

    return sharp(cardSvg)
        .composite([{ input: roundedAvatar, left: 126, top: 230 }])
        .png()
        .toBuffer();
}

async function premiumCommand(sock, chatId, message) {
    const rawText = getRawText(message);
    const args = rawText.split(/\s+/).slice(1);
    const sub = (args[0] || '').toLowerCase();
    const senderId = require('../lib/jidUtils').getSender(message);
    const senderIsOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!sub || !['add', 'del', 'remove', 'list'].includes(sub)) {
        await sock.sendMessage(chatId, {
            text: 'Utilisation :\n.premium add @user\n.premium del @user\n.premium list\n\nCarte premium :\n.vipcard [note]'
        }, { quoted: message });
        return;
    }

    if (!senderIsOwner) {
        await sock.sendMessage(chatId, {
            text: 'Cette commande est réservée au propriétaire ou aux sudo.'
        }, { quoted: message });
        return;
    }

    if (sub === 'list') {
        const list = await getPremiumList();
        if (list.length === 0) {
            await sock.sendMessage(chatId, {
                text: 'No premium users yet.'
            }, { quoted: message });
            return;
        }

        const mentions = [];
        const lines = list.map((entry, index) => {
            const jid = entry.jid || entry.key;
            const mention = jid ? `@${String(jid).split('@')[0]}` : '@unknown';
            if (jid) mentions.push(jid);

            const addedAt = entry.addedAt ? formatRdcDate(entry.addedAt) : 'unknown';
            return `${index + 1}. ${mention}\n   Added: ${addedAt}`;
        });

        await sock.sendMessage(chatId, {
            text: `*PREMIUM USERS* (${list.length})\n\n${lines.join('\n')}`,
            mentions
        }, { quoted: message });
        return;
    }

    const targetJid = extractTargetJid(message, null);
    if (!targetJid) {
        await sock.sendMessage(chatId, {
            text: 'Mentionne un utilisateur, réponds à un message ou saisis un numéro.'
        }, { quoted: message });
        return;
    }

    if (sub === 'add') {
        const exists = await isPremium(targetJid);
        if (exists) {
            await sock.sendMessage(chatId, {
                text: `@${targetJid.split('@')[0]} is already premium.`,
                mentions: [targetJid]
            }, { quoted: message });
            return;
        }

        const ok = await addPremium(targetJid, {
            addedAt: Date.now(),
            addedBy: senderId
        });

        await sock.sendMessage(chatId, {
            text: ok
                ? `@${targetJid.split('@')[0]} is now premium.`
                : 'Impossible d’ajouter l’utilisateur premium.',
            mentions: [targetJid]
        }, { quoted: message });
        return;
    }

    if (sub === 'del' || sub === 'remove') {
        const ok = await removePremium(targetJid);
        await sock.sendMessage(chatId, {
            text: ok
                ? `@${targetJid.split('@')[0]} removed from premium.`
                : 'Impossible de retirer l’utilisateur premium.',
            mentions: [targetJid]
        }, { quoted: message });
    }
}

async function vipCardCommand(sock, chatId, message) {
    const rawText = getRawText(message);
    const note = rawText.split(/\s+/).slice(1).join(' ').trim();
    const senderId = require('../lib/jidUtils').getSender(message);
    const senderIsOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!(await isPremium(senderId)) && !senderIsOwner) {
        await sock.sendMessage(chatId, {
            text: 'Cette commande est premium. Demande au propriétaire de t’ajouter avec .premium add @user.'
        }, { quoted: message });
        return;
    }

    const targetJid = extractTargetJid(message, senderId);
    if (!targetJid) {
        await sock.sendMessage(chatId, {
            text: 'Mentionne un utilisateur, réponds à un message ou saisis un numéro.'
        }, { quoted: message });
        return;
    }

    try {
        const requesterName = await sock.getName(senderId).catch(() => senderId.split('@')[0]);
        const card = await buildPremiumCard(sock, targetJid, requesterName, note, chatId);

        await sock.sendMessage(chatId, {
            image: card,
            caption: `Premium card for @${targetJid.split('@')[0]}`,
            mentions: [targetJid]
        }, { quoted: message });
    } catch (error) {
        console.error('vipcard error:', error);
        await sock.sendMessage(chatId, {
            text: 'Impossible de créer la carte premium.'
        }, { quoted: message });
    }
}

module.exports = {
    premiumCommand,
    vipCardCommand
};
