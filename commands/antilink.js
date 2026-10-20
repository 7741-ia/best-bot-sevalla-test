const config = require('../config');
const isAdmin = require('../lib/isAdmin');
const {
    getAntilink,
    setAntilink,
    removeAntilink,
    incrementWarningCount,
    resetWarningCount,
    isSudo
} = require('../lib/index');
const { messageContainsLink, safeDeleteMessage } = require('../lib/moderationUtils');

const WARN_LIMIT = config.WARN_COUNT || 3;

function stripCommandPrefix(text) {
    return String(text || '').trim().replace(/^\.\S+\s*/i, '');
}

async function handleAntilinkCommand(sock, chatId, rawText, senderId, isSenderAdmin, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement etre utilisee dans un groupe.' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```Commande reservee aux admins du groupe !```' }, { quoted: message });
            return;
        }

        const body = stripCommandPrefix(rawText);
        const args = body.split(/\s+/).filter(Boolean);
        const action = (args[0] || '').toLowerCase();

        if (!action) {
            const usage = [
                '```CONFIGURATION ANTILINK',
                '',
                '.antilink on',
                '.antilink set delete | kick | warn',
                '.antilink off',
                '.antilink get',
                '```'
            ].join('\n');
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        if (action === 'on') {
            const existing = await getAntilink(chatId, 'on');
            if (existing?.enabled) {
                await sock.sendMessage(chatId, { text: '*_Antilink deja active_*' }, { quoted: message });
                return;
            }

            const result = await setAntilink(chatId, 'on', existing?.action || 'delete');
            await sock.sendMessage(chatId, {
                text: result ? '*_Antilink active_*' : '*_Echec de l activation de Antilink_*'
            }, { quoted: message });
            return;
        }

        if (action === 'off') {
            await removeAntilink(chatId, 'on');
            await sock.sendMessage(chatId, { text: '*_Antilink desactive_*' }, { quoted: message });
            return;
        }

        if (action === 'set') {
            const setAction = (args[1] || '').toLowerCase();
            if (!['delete', 'kick', 'warn'].includes(setAction)) {
                await sock.sendMessage(chatId, {
                    text: 'Action invalide. Choisis delete, kick ou warn.'
                }, { quoted: message });
                return;
            }

            const result = await setAntilink(chatId, 'on', setAction);
            await sock.sendMessage(chatId, {
                text: result ? `Action Antilink definie sur ${setAction}` : 'Echec de la configuration Antilink.'
            }, { quoted: message });
            return;
        }

        if (action === 'get' || action === 'status' || action === 'show') {
            const configData = await getAntilink(chatId, 'on');
            await sock.sendMessage(chatId, {
                text: [
                    '*Antilink*',
                    `Status: ${configData?.enabled ? 'ON' : 'OFF'}`,
                    `Action: ${configData?.action || 'delete'}`
                ].join('\n')
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: 'Utilise .antilink pour voir la configuration.' }, { quoted: message });
    } catch (error) {
        console.error('Erreur dans la commande antilink :', error);
        await sock.sendMessage(chatId, { text: 'Erreur lors du traitement de la commande Antilink.' }, { quoted: message });
    }
}

async function handleLinkDetection(sock, chatId, message, rawText, senderId) {
    try {
        if (!chatId.endsWith('@g.us')) return false;
        if (!message?.message || message.key?.fromMe) return false;

        const configData = await getAntilink(chatId, 'on');
        if (!configData?.enabled) return false;

        const sender = senderId || require('../lib/jidUtils').getSender(message);
        if (!sender) return false;

        try {
            const adminStatus = await isAdmin(sock, chatId, sender);
            if (adminStatus.isSenderAdmin) return false;
        } catch (_) {}

        if (await isSudo(sender)) return false;

        const linkDetected = messageContainsLink(message) || messageContainsLink({ message: { conversation: rawText || '' } });
        if (!linkDetected) return false;

        await safeDeleteMessage(sock, chatId, message, sender);
        const action = (configData.action || 'delete').toLowerCase();
        try {
            if (action === 'kick') {
                await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🚫 @${sender.split('@')[0]} a ete retire pour envoi de lien.`,
                    mentions: [sender]
                }, { quoted: message });
            } else if (action === 'warn') {
                const warningCount = await incrementWarningCount(chatId, sender, 'antilink');
                await sock.sendMessage(chatId, {
                    text: `⚠️ @${sender.split('@')[0]} lien detecte.\nWarning: ${warningCount}/${WARN_LIMIT}`,
                    mentions: [sender]
                }, { quoted: message });

                if (warningCount >= WARN_LIMIT) {
                    await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                    await resetWarningCount(chatId, sender, 'antilink');
                    await sock.sendMessage(chatId, {
                        text: `🚫 @${sender.split('@')[0]} a ete retire apres ${WARN_LIMIT} warnings Antilink.`,
                        mentions: [sender]
                    }, { quoted: message });
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: `⚠️ @${sender.split('@')[0]} les liens ne sont pas autorises ici.`,
                    mentions: [sender]
                }, { quoted: message });
            }
        } catch (noticeError) {
            console.error('Erreur pendant le traitement Antilink:', noticeError.message);
        }

        return true;
    } catch (error) {
        console.error('Erreur dans la detection Antilink :', error.message);
        return false;
    }
}

module.exports = {
    handleAntilinkCommand,
    handleLinkDetection
};
