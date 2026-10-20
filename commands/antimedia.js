const {
    setAntimedia,
    getAntimedia,
    removeAntimedia,
    incrementWarningCount,
    resetWarningCount,
    isSudo
} = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const { hasPhotoOrVideoMessage, safeDeleteMessage } = require('../lib/moderationUtils');

function stripCommandPrefix(text) {
    return String(text || '').trim().replace(/^\.\S+\s*/i, '');
}

async function handleAntimediaCommand(sock, chatId, rawText, senderId, isSenderAdmin, message) {
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
                '```CONFIGURATION ANTIMEDIA',
                '',
                '.antimedia on   (supprime uniquement photos et videos)',
                '.antimedia set delete | kick | warn',
                '.antimedia off',
                '.antimedia get',
                '```'
            ].join('\n');
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        if (action === 'on') {
            const existing = await getAntimedia(chatId, 'on');
            if (existing?.enabled) {
                await sock.sendMessage(chatId, { text: '*_Antimedia deja active_*' }, { quoted: message });
                return;
            }

            const result = await setAntimedia(chatId, 'on', existing?.action || 'delete');
            await sock.sendMessage(chatId, {
                text: result ? '*_Antimedia active_*' : '*_Echec de l activation de Antimedia_*'
            }, { quoted: message });
            return;
        }

        if (action === 'off') {
            await removeAntimedia(chatId, 'on');
            await sock.sendMessage(chatId, { text: '*_Antimedia desactive_*' }, { quoted: message });
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

            const result = await setAntimedia(chatId, 'on', setAction);
            await sock.sendMessage(chatId, {
                text: result ? `Action Antimedia definie sur ${setAction}` : 'Echec de la configuration Antimedia.'
            }, { quoted: message });
            return;
        }

        if (action === 'get' || action === 'status' || action === 'show') {
            const configData = await getAntimedia(chatId, 'on');
            await sock.sendMessage(chatId, {
                text: [
                    '*Antimedia*',
                    `Status: ${configData?.enabled ? 'ON' : 'OFF'}`,
                    `Action: ${configData?.action || 'delete'}`
                ].join('\n')
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: 'Utilise .antimedia pour voir la configuration.' }, { quoted: message });
    } catch (error) {
        console.error('Erreur dans la commande antimedia :', error);
        await sock.sendMessage(chatId, { text: 'Erreur lors du traitement de la commande Antimedia.' }, { quoted: message });
    }
}

async function handleMediaDetection(sock, chatId, message, senderId) {
    try {
        if (!chatId.endsWith('@g.us')) return false;
        if (!message?.message || message.key?.fromMe) return false;

        const configData = await getAntimedia(chatId, 'on');
        if (!configData?.enabled) return false;
        if (!hasPhotoOrVideoMessage(message)) return false;

        const sender = senderId || require('../lib/jidUtils').getSender(message);
        if (!sender) return false;

        try {
            const adminStatus = await isAdmin(sock, chatId, sender);
            if (adminStatus.isSenderAdmin) return false;
        } catch (_) {}

        if (await isSudo(sender)) return false;

        await safeDeleteMessage(sock, chatId, message, sender);

        const action = (configData.action || 'delete').toLowerCase();
        try {
            if (action === 'warn') {
                const warningCount = await incrementWarningCount(chatId, sender, 'antimedia');
                await sock.sendMessage(chatId, {
                    text: `⚠️ @${sender.split('@')[0]} image/video non autorisee.\nWarning: ${warningCount}/3`,
                    mentions: [sender]
                }, { quoted: message });

                if (warningCount >= 3) {
                    await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                    await resetWarningCount(chatId, sender, 'antimedia');
                    await sock.sendMessage(chatId, {
                        text: `🚫 @${sender.split('@')[0]} a ete retire apres 3 warnings Antimedia.`,
                        mentions: [sender]
                    }, { quoted: message });
                }
                return true;
            }

            if (action === 'kick') {
                await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🚫 @${sender.split('@')[0]} a ete retire pour envoi de photo/video.`,
                    mentions: [sender]
                }, { quoted: message });
                return true;
            }

            await sock.sendMessage(chatId, {
                text: `⚠️ @${sender.split('@')[0]}, les photos et videos ne sont pas autorisees ici.`,
                mentions: [sender]
            }, { quoted: message });
        } catch (noticeError) {
            console.error('Erreur pendant le traitement Antimedia:', noticeError.message);
        }
        return true;
    } catch (error) {
        console.error('Erreur dans la detection Antimedia :', error.message);
        return false;
    }
}

module.exports = {
    handleAntimediaCommand,
    handleMediaDetection
};
