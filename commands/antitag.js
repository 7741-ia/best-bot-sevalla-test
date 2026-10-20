const {
    setAntitag,
    getAntitag,
    removeAntitag,
    incrementWarningCount,
    resetWarningCount
} = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

async function handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```Réservé aux admins du groupe !```' },{quoted :message});
            return;
        }

        const prefix = '.';
        const args = userMessage.slice(9).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage = `\`\`\`ANTITAG SETUP\n\n${prefix}antitag on\n${prefix}antitag set warn | delete | kick\n${prefix}antitag off\n\`\`\``;
            await sock.sendMessage(chatId, { text: usage },{quoted :message});
            return;
        }

        switch (action) {
            case 'on':
                const existingConfig = await getAntitag(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: '*_Antitag is already on_*' },{quoted :message});
                    return;
                }
                const result = await setAntitag(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, { 
                    text: result ? '*_Antitag activé_*' : '*_Impossible d’activer Antitag_*' 
                },{quoted :message});
                break;

            case 'off':
                await removeAntitag(chatId, 'on');
                await sock.sendMessage(chatId, { text: '*_Antitag désactivé_*' },{quoted :message});
                break;

            case 'set':
                if (args.length < 2) {
                    await sock.sendMessage(chatId, { 
                        text: `*_Précise une action : ${prefix}antitag set warn | delete | kick_*` 
                    },{quoted :message});
                    return;
                }
                const setAction = args[1];
                if (!['warn', 'delete', 'kick'].includes(setAction)) {
                    await sock.sendMessage(chatId, { 
                        text: '*_Invalid action. Choose warn, delete or kick._*' 
                    },{quoted :message});
                    return;
                }
                const setResult = await setAntitag(chatId, 'on', setAction);
                await sock.sendMessage(chatId, { 
                    text: setResult ? `*_Action Antitag définie sur ${setAction}_*` : '*_Impossible de définir l’action Antitag_*' 
                },{quoted :message});
                break;

            case 'get':
                const status = await getAntitag(chatId, 'on');
                const actionConfig = await getAntitag(chatId, 'on');
                await sock.sendMessage(chatId, { 
                    text: `*_Antitag Configuration:_*\nStatus: ${status ? 'ON' : 'OFF'}\nAction: ${actionConfig ? actionConfig.action : 'Not set'}` 
                },{quoted :message});
                break;

            default:
                await sock.sendMessage(chatId, { text: `*_Utilise ${prefix}antitag pour voir l’utilisation._*` },{quoted :message});
        }
    } catch (error) {
        console.error('Error in antitag command:', error);
        await sock.sendMessage(chatId, { text: '*_Error processing antitag command_*' },{quoted :message});
    }
}

async function handleTagDetection(sock, chatId, message, senderId) {
    try {
        const mentionedGroupsEverywhere = [...collectGroupIds(message)];
        if (mentionedGroupsEverywhere.length && !chatId.endsWith('@g.us')) {
            await handleExternalGroupMention(sock, chatId, message, senderId, mentionedGroupsEverywhere);
            return;
        }

        const antitagSetting = await getAntitag(chatId, 'on');
        if (!antitagSetting || !antitagSetting.enabled) return;

        // Get mentioned JIDs from contextInfo (proper mentions)
        const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        // Extract text from all possible message types
        const messageText = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption ||
            ''
        );

        // Find all @mentions in text using improved regex
        // Matches: @123456789, @⁨+91 70239 51514⁩, @~.., @217875470114951, etc.
        const textMentions = messageText.match(/@[\d+\s\-()~.]+/g) || [];
        
        // Also match numeric-only mentions (like @217875470114951)
        const numericMentions = messageText.match(/@\d{10,}/g) || [];
        
        // Combine all mentions and remove duplicates
        const allMentions = [...new Set([...mentionedJids, ...textMentions, ...numericMentions])];
        
        // Count unique numeric mentions (bot tagall patterns)
        const uniqueNumericMentions = new Set();
        numericMentions.forEach(mention => {
            const numMatch = mention.match(/@(\d+)/);
            if (numMatch) uniqueNumericMentions.add(numMatch[1]);
        });
        
        // Count mentions from mentionedJid array (proper WhatsApp mentions)
        const mentionedJidCount = mentionedJids.length;
        
        // Count unique numeric mentions found in text (bot tagall pattern)
        const numericMentionCount = uniqueNumericMentions.size;
        
        // Use the higher count (either proper mentions or text-based mentions)
        // This ensures we catch both standard mentions and bot tagall patterns
        const totalMentions = Math.max(mentionedJidCount, numericMentionCount);

        // Check if it's a group message and has multiple mentions
        if (totalMentions >= 3) {
            // Get group participants to check if it's tagging most/all members
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants || [];
            
            // If mentions are more than 50% of group members, consider it as tagall
            const mentionThreshold = Math.ceil(participants.length * 0.5);
            
            // Also check if there are many numeric mentions in the text (bot tagall pattern)
            // This catches bots that use numeric IDs instead of proper mentions
            const hasManyNumericMentions = numericMentionCount >= 10 || 
                                          (numericMentionCount >= 5 && numericMentionCount >= mentionThreshold);
            
            // Trigger if: standard mentions exceed threshold OR many numeric mentions detected
            if (totalMentions >= mentionThreshold || hasManyNumericMentions) {
                
                const action = antitagSetting.action || 'delete';
                
                if (action === 'warn') {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });

                    const warningCount = await incrementWarningCount(chatId, senderId, 'antitag');
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *Antitag Warning*\n\n@${senderId.split('@')[0]} a mentionne trop de membres.\nWarning: ${warningCount}/3`,
                        mentions: [senderId]
                    }, { quoted: message });

                    if (warningCount >= 3) {
                        await sock.groupParticipantsUpdate(chatId, [senderId], "remove");
                        await resetWarningCount(chatId, senderId, 'antitag');
                        await sock.sendMessage(chatId, {
                            text: `🚫 @${senderId.split('@')[0]} a ete retire du groupe apres 3 warnings Antitag.`,
                            mentions: [senderId]
                        }, { quoted: message });
                    }
                } else if (action === 'delete') {
                    // Delete the message
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });
                    
                    // Send warning
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *Tagall Detected!*.`
                    }, { quoted: message });
                    
                } else if (action === 'kick') {
                    // First delete the message
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });

                    // Then kick the user
                    await sock.groupParticipantsUpdate(chatId, [senderId], "remove");

                    // Send notification
                    const usernames = [`@${senderId.split('@')[0]}`];
                    await sock.sendMessage(chatId, {
                        text: `🚫 *Antitag Detected!*\n\n${usernames.join(', ')} has been kicked for tagging all members.`,
                        mentions: [senderId]
                    }, { quoted: message });
                }
            }
        }
    } catch (error) {
        console.error('Error in tag detection:', error);
    }
}

function collectGroupIds(value, found = new Set()) {
    if (!value) return found;

    if (typeof value === 'string') {
        const matches = value.match(/\d{10,}@g\.us/g) || [];
        matches.forEach(match => found.add(match));

        const rawGroupIds = value.match(/\b\d{10,}\b/g) || [];
        rawGroupIds.forEach(match => found.add(`${match}@g.us`));
        return found;
    }

    if (Array.isArray(value)) {
        value.forEach(item => collectGroupIds(item, found));
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

        directCandidates.forEach(candidate => {
            if (typeof candidate === 'string' && candidate.endsWith('@g.us')) {
                found.add(candidate);
            }
        });

        if (Array.isArray(value.groupMentions)) {
            value.groupMentions.forEach(item => collectGroupIds(item, found));
        }

        if (Array.isArray(value.groupMentionsInfo)) {
            value.groupMentionsInfo.forEach(item => collectGroupIds(item, found));
        }

        if (Array.isArray(value.mentionedGroups)) {
            value.mentionedGroups.forEach(item => collectGroupIds(item, found));
        }

        if (Array.isArray(value.statusMentions)) {
            value.statusMentions.forEach(item => collectGroupIds(item, found));
        }

        if (Array.isArray(value.statusMentionSources)) {
            value.statusMentionSources.forEach(item => collectGroupIds(item, found));
        }

        if (value.statusMentionMessageInfo) {
            collectGroupIds(value.statusMentionMessageInfo, found);
        }

        Object.values(value).forEach(item => collectGroupIds(item, found));
    }

    return found;
}

async function deleteRegularMessage(sock, chatId, message, senderId) {
    try {
        await sock.sendMessage(chatId, {
            delete: {
                remoteJid: chatId,
                fromMe: false,
                id: message.key.id,
                participant: senderId
            }
        });
        return true;
    } catch (error) {
        console.error('Failed to delete regular group-mention message:', error.message);
        return false;
    }
}

async function applyAntitagAction(sock, groupId, senderId, message, action, reasonText) {
    if (action === 'warn') {
        const warningCount = await incrementWarningCount(groupId, senderId, 'antitag');
        await sock.sendMessage(groupId, {
            text: `⚠️ *Antitag Warning*\n\n@${senderId.split('@')[0]} ${reasonText}\nWarning: ${warningCount}/3`,
            mentions: [senderId]
        }, { quoted: message });

        if (warningCount >= 3) {
            await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
            await resetWarningCount(groupId, senderId, 'antitag');
            await sock.sendMessage(groupId, {
                text: `🚫 @${senderId.split('@')[0]} a ete retire du groupe apres 3 warnings Antitag.`,
                mentions: [senderId]
            }, { quoted: message });
        }
        return;
    }

    if (action === 'kick') {
        await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
        await sock.sendMessage(groupId, {
            text: `🚫 @${senderId.split('@')[0]} a ete retire du groupe pour Antitag.`,
            mentions: [senderId]
        }, { quoted: message });
        return;
    }

    await sock.sendMessage(groupId, {
        text: `⚠️ Antitag: @${senderId.split('@')[0]} ${reasonText}`,
        mentions: [senderId]
    }, { quoted: message });
}

async function handleExternalGroupMention(sock, chatId, message, senderId, mentionedGroups) {
    for (const groupId of mentionedGroups) {
        const antitagSetting = await getAntitag(groupId, 'on');
        if (!antitagSetting || !antitagSetting.enabled) continue;

        await deleteRegularMessage(sock, chatId, message, senderId);
        await applyAntitagAction(
            sock,
            groupId,
            senderId,
            message,
            antitagSetting.action || 'delete',
            "a mentionne le groupe dans un status ou une notification externe."
        );
    }
}

module.exports = {
    handleAntitagCommand,
    handleTagDetection
};
