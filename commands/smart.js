// commands/smart.js
// Commande moderne légère : .smart <question>
// Force un niveau d'intelligence élevé pour la réponse.
// Utilise le même cerveau IA, aucune dépendance supplémentaire.

const { handleChatbotResponse } = require('./chatbot');

const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const DATA_PATH = path.join(__dirname, '../data/userGroupData.json');

function readData() {
    try {
        if (!fs.existsSync(DATA_PATH)) return {};
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function isGroupAuthorized(chatId) {
    const data = readData();
    const conf = data.chatbot?.[chatId];
    if (conf === true) return true;
    if (conf && typeof conf === 'object') return Boolean(conf.enabled);
    return false;
}

async function smartCommand(sock, chatId, message, argsText) {
    const text = String(argsText || '').trim();
    if (!text) {
        return sock.sendMessage(chatId, {
            text: '🧠 *.smart <question>*\nRéponse ultra-précise et approfondie.\nExemple : .smart Comment fonctionne un réseau neuronal ?'
        }, { quoted: message });
    }

    const isGroup = chatId.endsWith('@g.us');
    const senderId = require('../lib/jidUtils').getSender(message);

    if (isGroup) {
        const authorized = isGroupAuthorized(chatId);
        const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
        if (!authorized && !isOwner) {
            return sock.sendMessage(chatId, {
                text: '🔇 Chatbot silencieux dans ce groupe.\nActive-le avec *.chatbot on* (propriétaire).'
            }, { quoted: message });
        }
    }

    // On passe par le chatbot en forçant intelligence élevée via le style temporaire
    // (le cerveau IA lit conversationSettings.intelligence)
    // Pour rester léger on réutilise handleChatbotResponse et on laisse le style global,
    // mais on ajoute un préfixe instruction pour forcer la profondeur.
    const enriched = `[Mode expert / réponse approfondie et structurée]\n${text}`;

    return handleChatbotResponse(sock, chatId, message, enriched, senderId, {
        explicitCommand: true,
        forceOwner: message.key.fromMe
    });
}

module.exports = smartCommand;
