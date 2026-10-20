const {
    setAntistatus,
    getAntistatus,
    incrementWarningCount,
    resetWarningCount,
    removeAntistatus
} = require('../lib/index');
const fs = require('fs');
const path = require('path');
const { jidVariants } = require('./viewonce');

const debugLogPath = path.join(__dirname, '../temp/antistatus-debug.log');
const userGroupDataPath = path.join(__dirname, '../data/userGroupData.json');

function logAntistatusDebug(label, payload) {
    try {
        const line = `[${new Date().toISOString()}] ${label}: ${JSON.stringify(payload)}\n`;
        fs.appendFileSync(debugLogPath, line);
    } catch (_) {}
}

function getEnabledAntistatusGroupIds() {
    try {
        const raw = JSON.parse(fs.readFileSync(userGroupDataPath, 'utf8'));
        return Object.entries(raw.antistatus || {})
            .filter(([, cfg]) => cfg && cfg.enabled)
            .map(([groupId]) => groupId);
    } catch (_) {
        return [];
    }
}

function getPrimaryJid(jid) {
    return jidVariants(jid)[0] || jid || '';
}

function getMentionHandle(jid) {
    const primary = getPrimaryJid(jid);
    return primary.split('@')[0];
}

async function removeParticipantWithFallback(sock, groupId, senderId) {
    const variants = jidVariants(senderId);
    let lastError = null;

    for (const participantId of variants) {
        try {
            await sock.groupParticipantsUpdate(groupId, [participantId], 'remove');
            return participantId;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    throw new Error('No participant JID available for removal.');
}

async function handleAntistatusCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```Commande reservee aux admins du groupe !```' }, { quoted: message });
            return;
        }

        const prefix = '.';
        const args = userMessage.slice(11).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage = `\`\`\`CONFIGURATION ANTISTATUS\n\n${prefix}antistatus on\n${prefix}antistatus set delete | kick | warn\n${prefix}antistatus off\n${prefix}antistatus get\n\`\`\`\nSupprime automatiquement le status si quelqu'un mentionne ce groupe dans son status.`;
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        switch (action) {
            case 'on': {
                const existingConfig = await getAntistatus(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: '*_Antistatus est deja active_*' }, { quoted: message });
                    return;
                }

                const result = await setAntistatus(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, {
                    text: result ? '*_Antistatus a ete active_*' : '*_Echec de l activation de Antistatus_*'
                }, { quoted: message });
                break;
            }

            case 'off':
                await removeAntistatus(chatId, 'on');
                await sock.sendMessage(chatId, { text: '*_Antistatus a ete desactive_*' }, { quoted: message });
                break;

            case 'set': {
                if (args.length < 2) {
                    await sock.sendMessage(chatId, {
                        text: `*_Veuillez specifier une action : ${prefix}antistatus set delete | kick | warn_*`
                    }, { quoted: message });
                    return;
                }

                const setAction = args[1];
                if (!['delete', 'kick', 'warn'].includes(setAction)) {
                    await sock.sendMessage(chatId, {
                        text: '*_Action invalide. Choisissez delete, kick ou warn._*'
                    }, { quoted: message });
                    return;
                }

                const setResult = await setAntistatus(chatId, 'on', setAction);
                await sock.sendMessage(chatId, {
                    text: setResult ? `*_Action Antistatus definie sur ${setAction}_*` : '*_Echec de la configuration de Antistatus_*'
                }, { quoted: message });
                break;
            }

            case 'get': {
                const config = await getAntistatus(chatId, 'on');
                await sock.sendMessage(chatId, {
                    text: `*_Configuration Antistatus:_*\nStatut : ${config?.enabled ? 'ACTIVE' : 'DESACTIVE'}\nAction : ${config?.action || 'Non defini'}`
                }, { quoted: message });
                break;
            }

            default:
                await sock.sendMessage(chatId, { text: `*_Utilisez ${prefix}antistatus pour voir la configuration._*` }, { quoted: message });
        }
    } catch (error) {
        console.error('Erreur dans la commande antistatus :', error);
        await sock.sendMessage(chatId, { text: '*_Erreur lors du traitement de la commande Antistatus_*' }, { quoted: message });
    }
}

function collectGroupIds(value, found = new Set()) {
    if (!value) return found;

    if (typeof value === 'string') {
        const matches = value.match(/\d{10,}@g\.us/g) || [];
        matches.forEach((match) => found.add(match));
        return found;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectGroupIds(item, found));
        return found;
    }

    if (typeof value === 'object') {
        const directCandidates = [
            value.groupJid,
            value.groupId,
            value.mentionedGroupJid,
            value.remoteJid,
            value.jid,
            value.id,
            value.group,
            value.subjectJid,
            value.parentGroupJid
        ];

        directCandidates.forEach((candidate) => {
            if (typeof candidate === 'string' && candidate.endsWith('@g.us')) {
                found.add(candidate);
            }
        });

        if (Array.isArray(value.groupMentions)) {
            value.groupMentions.forEach((item) => collectGroupIds(item, found));
        }

        if (Array.isArray(value.groupMentionsInfo)) {
            value.groupMentionsInfo.forEach((item) => collectGroupIds(item, found));
        }

        if (Array.isArray(value.mentionedGroups)) {
            value.mentionedGroups.forEach((item) => collectGroupIds(item, found));
        }

        if (Array.isArray(value.statusMentions)) {
            value.statusMentions.forEach((item) => collectGroupIds(item, found));
        }

        if (Array.isArray(value.statusMentionSources)) {
            value.statusMentionSources.forEach((item) => collectGroupIds(item, found));
        }

        if (value.statusMentionMessageInfo) {
            collectGroupIds(value.statusMentionMessageInfo, found);
        }

        Object.values(value).forEach((item) => collectGroupIds(item, found));
    }

    return found;
}

function collectConfiguredGroupMatches(value, configuredGroupIds, found = new Set()) {
    if (!value || !configuredGroupIds.length) return found;

    if (typeof value === 'string') {
        configuredGroupIds.forEach((groupId) => {
            const digits = groupId.replace('@g.us', '');
            if (value.includes(groupId) || value.includes(digits)) {
                found.add(groupId);
            }
        });
        return found;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectConfiguredGroupMatches(item, configuredGroupIds, found));
        return found;
    }

    if (typeof value === 'object') {
        Object.values(value).forEach((item) => collectConfiguredGroupMatches(item, configuredGroupIds, found));
    }

    return found;
}

async function deleteTaggedStatus(sock, message, senderId) {
    const participants = [...new Set(jidVariants(
        senderId ||
        message?.key?.participant ||
        message?.participant ||
        message?.key?.participantAlt ||
        message?.key?.remoteJidAlt
    ))];

    const baseDeleteKey = {
        remoteJid: 'status@broadcast',
        id: message?.key?.id,
        fromMe: false
    };

    const deleteKeys = [
        message?.key,
        ...participants.map((participant) => ({
            ...baseDeleteKey,
            participant
        }))
    ].filter((key) => key?.id);

    let lastError = null;
    for (const participant of participants) {
        for (const deleteKey of deleteKeys) {
            const attempts = [
                async () => sock.sendMessage('status@broadcast', { delete: deleteKey }, { statusJidList: [participant] }),
                async () => sock.relayMessage(
                    'status@broadcast',
                    {
                        protocolMessage: {
                            key: deleteKey,
                            type: 0
                        }
                    },
                    {
                        statusJidList: [participant]
                    }
                )
            ];

            for (const attempt of attempts) {
                try {
                    await attempt();
                    return true;
                } catch (error) {
                    lastError = error;
                }
            }
        }
    }

    if (lastError) {
        console.error('Failed to delete tagged status:', lastError.message);
        logAntistatusDebug('delete_failed', {
            error: lastError.message,
            participants,
            deleteKeys
        });
    }

    return false;
}

async function applyAntistatusAction(sock, groupId, senderId, message, action, deleted = false) {
    const reasonText = "a mentionne le groupe dans son status.";
    const mentionId = getPrimaryJid(senderId);
    const mentionHandle = getMentionHandle(senderId);

    if (action === 'warn') {
        const warningCount = await incrementWarningCount(groupId, mentionId, 'antistatus');
        await sock.sendMessage(groupId, {
            text: `⚠️ *Antistatus Warning*\n\n@${mentionHandle} ${reasonText}\nWarning: ${warningCount}/3`,
            mentions: mentionId ? [mentionId] : []
        }, { quoted: message });

        if (warningCount >= 3) {
            const removedParticipant = await removeParticipantWithFallback(sock, groupId, senderId);
            await resetWarningCount(groupId, mentionId, 'antistatus');
            await sock.sendMessage(groupId, {
                text: `🚫 @${mentionHandle} a ete retire du groupe apres 3 avertissement Antistatus.`,
                mentions: removedParticipant ? [removedParticipant] : (mentionId ? [mentionId] : [])
            }, { quoted: message });
        }
        return;
    }

    if (action === 'kick') {
        const removedParticipant = await removeParticipantWithFallback(sock, groupId, senderId);
        await sock.sendMessage(groupId, {
            text: `🚫 @${mentionHandle} a ete retire du groupe pour Antistatus.`,
            mentions: removedParticipant ? [removedParticipant] : (mentionId ? [mentionId] : [])
        }, { quoted: message });
        return;
    }

    if (action === 'delete' && !deleted) {
        await sock.sendMessage(groupId, {
            text: `⚠️ Antistatus: mention detectee de @${mentionHandle}, mais WhatsApp a refuse la suppression automatique du status.`,
            mentions: mentionId ? [mentionId] : []
        });
        return;
    }

    await sock.sendMessage(groupId, {
        text: `⚠️ Antistatus: @${mentionHandle} ${reasonText}`,
        mentions: mentionId ? [mentionId] : []
    }, { quoted: message });
}

async function handleAntistatusDetection(sock, message, senderId) {
    try {
        const normalizedSenderId = getPrimaryJid(
            senderId ||
            message?.key?.participant ||
            message?.participant ||
            message?.key?.participantAlt ||
            message?.key?.remoteJidAlt
        );
        const enabledGroupIds = getEnabledAntistatusGroupIds();

        logAntistatusDebug('status_received', {
            key: message?.key,
            messageKeys: message?.message ? Object.keys(message.message) : [],
            senderId: normalizedSenderId,
            enabledGroupIds
        });

        const rawMentionedGroups = [...new Set([
            ...collectGroupIds(message),
            ...collectGroupIds(message.message),
            ...collectGroupIds(message.statusMentionMessageInfo)
        ])];
        const configuredMatches = [...new Set([
            ...collectConfiguredGroupMatches(message, enabledGroupIds),
            ...collectConfiguredGroupMatches(message.message, enabledGroupIds),
            ...collectConfiguredGroupMatches(message.statusMentionMessageInfo, enabledGroupIds)
        ])];

        let mentionedGroups = rawMentionedGroups.filter((groupId) => enabledGroupIds.includes(groupId));
        if (!mentionedGroups.length && configuredMatches.length) {
            mentionedGroups = configuredMatches;
        }

        logAntistatusDebug('groups_extracted', { rawMentionedGroups, configuredMatches, mentionedGroups });
        if (!mentionedGroups.length) return;

        for (const groupId of mentionedGroups) {
            const antistatusSetting = await getAntistatus(groupId, 'on');
            logAntistatusDebug('group_checked', { groupId, antistatusSetting });
            if (!antistatusSetting?.enabled) continue;

            const deleted = await deleteTaggedStatus(sock, message, normalizedSenderId);
            logAntistatusDebug('delete_attempted', { groupId, statusId: message?.key?.id, senderId: normalizedSenderId, deleted });
            await applyAntistatusAction(
                sock,
                groupId,
                normalizedSenderId,
                message,
                antistatusSetting.action || 'delete',
                deleted
            );
        }
    } catch (error) {
        console.error('Erreur dans la detection Antistatus :', error.message);
    }
}

module.exports = {
    handleAntistatusCommand,
    handleAntistatusDetection
};
