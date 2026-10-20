const { getAntiViewOnce, removeAntiViewOnce, setAntiViewOnce } = require('../lib/index');
const { revealViewOnceToChat, getDirectSourceMessage, unwrapMessageContent } = require('./viewonce');

function hasDirectViewOnce(message) {
    const body = message?.message;
    const ephemeralBody = body?.ephemeralMessage?.message;
    const isWrapped = Boolean(
        body?.viewOnceMessageV2 ||
        body?.viewOnceMessageV2Extension ||
        body?.viewOnceMessage ||
        ephemeralBody?.viewOnceMessageV2 ||
        ephemeralBody?.viewOnceMessageV2Extension ||
        ephemeralBody?.viewOnceMessage
    );
    if (!isWrapped) return false;

    const source = unwrapMessageContent(body) || getDirectSourceMessage(message);
    return Boolean(source?.imageMessage || source?.videoMessage || source?.audioMessage);
}

async function handleAntiViewOnceCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```Commande reservee aux admins du groupe !```' }, { quoted: message });
            return;
        }

        const prefix = '.';
        const args = userMessage.slice(13).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            await sock.sendMessage(chatId, {
                text: `\`\`\`CONFIGURATION ANTIVIEWONCE\n\n${prefix}antiviewonce on\n${prefix}antiviewonce off\n${prefix}antiviewonce get\n\`\`\``
            }, { quoted: message });
            return;
        }

        if (action === 'on') {
            const result = await setAntiViewOnce(chatId, 'on');
            await sock.sendMessage(chatId, { text: result ? '*_Antiviewonce a ete active_*' : '*_Echec de l activation de Antiviewonce_*' }, { quoted: message });
            return;
        }

        if (action === 'off') {
            await removeAntiViewOnce(chatId, 'on');
            await sock.sendMessage(chatId, { text: '*_Antiviewonce a ete desactive_*' }, { quoted: message });
            return;
        }

        if (action === 'get') {
            const config = await getAntiViewOnce(chatId, 'on');
            await sock.sendMessage(chatId, {
                text: `*_Configuration Antiviewonce:_*\nStatut : ${config?.enabled ? 'ACTIVE' : 'DESACTIVE'}`
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: `*_Utilisez ${prefix}antiviewonce pour voir la configuration._*` }, { quoted: message });
    } catch (error) {
        console.error('Erreur dans la commande antiviewonce :', error);
        await sock.sendMessage(chatId, { text: '*_Erreur lors du traitement de la commande Antiviewonce_*' }, { quoted: message });
    }
}

async function deleteGroupMessageWithFallback(sock, chatId, message) {
    const participant = message?.key?.participant || message?.participant || message?.key?.remoteJid;
    const fallbackKey = {
        remoteJid: chatId,
        fromMe: false,
        id: message?.key?.id,
        participant
    };

    const attempts = [
        async () => sock.sendMessage(chatId, { delete: message.key }),
        async () => sock.sendMessage(chatId, { delete: fallbackKey }),
        async () => sock.relayMessage(
            chatId,
            {
                protocolMessage: {
                    key: fallbackKey,
                    type: 0
                }
            },
            {}
        )
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            await attempt();
            return true;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Erreur suppression message vue unique original :', lastError.message);
    }

    return false;
}

async function handleAntiViewOnceDetection(sock, chatId, message) {
    try {
        const config = await getAntiViewOnce(chatId, 'on');
        if (!config?.enabled) return false;
        if (!hasDirectViewOnce(message)) return false;

        await revealViewOnceToChat(sock, chatId, message, message, { direct: true, caption: 'Antiviewonce' });
        try {
            await deleteGroupMessageWithFallback(sock, chatId, message);
        } catch (deleteError) {
            console.error('Erreur suppression message vue unique original :', deleteError.message);
        }
        return true;
    } catch (error) {
        console.error('Erreur dans la detection Antiviewonce :', error.message);
        return false;
    }
}

module.exports = {
    handleAntiViewOnceCommand,
    handleAntiViewOnceDetection
};
