// commands/ask.js
// Commande légère et moderne : .ask <question>
// - En DM : fonctionne si le chatbot DM est activé
// - En groupe : fonctionne uniquement si le propriétaire a fait .chatbot on
//   (aucune réponse passive, uniquement sur commande explicite)
// N'ajoute aucune dépendance et reste très léger.

const { handleChatbotResponse } = require('./chatbot');
const isOwnerOrSudo = require('../lib/isOwner');
const fs = require('fs');
const path = require('path');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');

function loadData() {
    try {
        if (!fs.existsSync(USER_GROUP_DATA)) return { chatbot: {}, chatbotDm: { enabled: false } };
        return JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
    } catch {
        return { chatbot: {}, chatbotDm: { enabled: false } };
    }
}

function isGroupAuthorized(chatId) {
    const data = loadData();
    const conf = data.chatbot?.[chatId];
    if (conf === true) return true;
    if (conf && typeof conf === 'object') return Boolean(conf.enabled);
    return false;
}

async function askCommand(sock, chatId, message, argsText) {
    const text = String(argsText || '').trim();
    if (!text) {
        return sock.sendMessage(chatId, {
            text: 'Utilise : *.ask <ta question>*\nExemple : .ask Explique-moi la photosynthèse simplement'
        }, { quoted: message });
    }

    const isGroup = chatId.endsWith('@g.us');
    const senderId = require('../lib/jidUtils').getSender(message);

    if (isGroup) {
        const authorized = isGroupAuthorized(chatId);
        const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
        if (!authorized && !isOwner) {
            return sock.sendMessage(chatId, {
                text: '🔇 Le chatbot est silencieux dans ce groupe.\nSeul le propriétaire peut l’autoriser avec *.chatbot on*'
            }, { quoted: message });
        }
    }

    // Réponse uniquement parce que la commande a été tapée
    return handleChatbotResponse(sock, chatId, message, text, senderId, {
        explicitCommand: true,
        forceOwner: message.key.fromMe
    });
}

module.exports = askCommand;
