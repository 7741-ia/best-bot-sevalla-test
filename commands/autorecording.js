/**
 * Best King - A WhatsApp Bot
 * Autorecording Command - Affiche "enregistre un audio..." comme si tu enregistrais une note vocale
 */

const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const configPath = path.join(__dirname, '..', 'data', 'autorecording.json');

function initConfig() {
    if (!fs.existsSync(configPath)) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
    }
    return JSON.parse(fs.readFileSync(configPath));
}

function isAutorecordingEnabled() {
    try {
        return Boolean(initConfig().enabled);
    } catch (error) {
        console.error('Error checking autorecording status:', error);
        return false;
    }
}

async function autorecordingCommand(sock, chatId, message) {
    try {
        const senderId = require('../lib/jidUtils').getSender(message);
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { text: '❌ Cette commande est réservée au propriétaire !' }, { quoted: message });
            return;
        }

        const args = (message.message?.conversation || message.message?.extendedTextMessage?.text || '')
            .trim().split(/\s+/).slice(1);
        const config = initConfig();

        if (args.length > 0) {
            const action = args[0].toLowerCase();
            if (['on', 'enable'].includes(action)) {
                config.enabled = true;
            } else if (['off', 'disable'].includes(action)) {
                config.enabled = false;
            } else {
                await sock.sendMessage(chatId, { text: '❌ Option invalide ! Utilise : .autorecording on/off' }, { quoted: message });
                return;
            }
        } else {
            config.enabled = !config.enabled;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Un seul des deux indicateurs à la fois : l'enregistrement remplace l'écriture
        let note = '';
        if (config.enabled) {
            try {
                const typingPath = path.join(__dirname, '..', 'data', 'autotyping.json');
                if (fs.existsSync(typingPath)) {
                    const typing = JSON.parse(fs.readFileSync(typingPath));
                    if (typing.enabled) {
                        typing.enabled = false;
                        fs.writeFileSync(typingPath, JSON.stringify(typing, null, 2));
                        note = '\n(L\'écriture automatique a été désactivée pour éviter les doublons.)';
                    }
                }
            } catch (e) { /* ignoré */ }
        }

        await sock.sendMessage(chatId, {
            text: `🎙️ L'enregistrement automatique a été ${config.enabled ? 'activé' : 'désactivé'} !${note}`
        }, { quoted: message });
    } catch (error) {
        console.error('Error in autorecording command:', error);
        await sock.sendMessage(chatId, { text: '❌ Erreur pendant le traitement de la commande !' });
    }
}

// Affiche "enregistre un audio..." avant de traiter un message
async function handleAutorecordingForMessage(sock, chatId, userMessage = '') {
    if (!isAutorecordingEnabled()) return false;
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('available', chatId);
        await new Promise((resolve) => setTimeout(resolve, 400));
        await sock.sendPresenceUpdate('recording', chatId);

        const delay = Math.max(2500, Math.min(6000, String(userMessage).length * 120));
        await new Promise((resolve) => setTimeout(resolve, delay));

        await sock.sendPresenceUpdate('recording', chatId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await sock.sendPresenceUpdate('paused', chatId);
        return true;
    } catch (error) {
        console.error('❌ Error sending recording indicator:', error);
        return false;
    }
}

// Bref indicateur après l'exécution d'une commande
async function showRecordingAfterCommand(sock, chatId) {
    if (!isAutorecordingEnabled()) return false;
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('recording', chatId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await sock.sendPresenceUpdate('paused', chatId);
        return true;
    } catch (error) {
        console.error('❌ Error sending post-command recording indicator:', error);
        return false;
    }
}

module.exports = {
    autorecordingCommand,
    isAutorecordingEnabled,
    handleAutorecordingForMessage,
    showRecordingAfterCommand
};
