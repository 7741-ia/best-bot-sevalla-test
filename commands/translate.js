const { normalizeLanguage, translateText } = require('../lib/translationService');

function extractQuotedText(message) {
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMessage) return '';

    return quotedMessage.conversation ||
        quotedMessage.extendedTextMessage?.text ||
        quotedMessage.imageMessage?.caption ||
        quotedMessage.videoMessage?.caption ||
        '';
}

async function handleTranslateCommand(sock, chatId, message, match, forcedLanguage = null) {
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        const rawMatch = String(match || '').trim();
        const quotedText = extractQuotedText(message);
        let textToTranslate = quotedText;
        let language = forcedLanguage;

        if (forcedLanguage) {
            if (!textToTranslate) {
                textToTranslate = rawMatch;
            }
        } else if (quotedText) {
            language = rawMatch;
        } else {
            const args = rawMatch.split(/\s+/).filter(Boolean);
            if (args.length < 2) {
                return sock.sendMessage(chatId, {
                    text:
                        '*TRADUCTION*\n\n' +
                        'Usage:\n' +
                        '1. Reponds a un message avec `.translate <lang>` ou `.trt <lang>`\n' +
                        '2. Ou ecris `.translate <texte> <lang>`\n' +
                        '3. Raccourcis rapides: `.fr <texte>` et `.en <texte>`\n\n' +
                        'Exemples:\n' +
                        '.translate hello fr\n' +
                        '.fr hello world\n' +
                        '.en bonjour tout le monde'
                }, { quoted: message });
            }

            language = args.pop();
            textToTranslate = args.join(' ');
        }

        const normalizedLanguage = normalizeLanguage(language);
        if (!normalizedLanguage) {
            return sock.sendMessage(chatId, {
                text: 'Code langue manquant. Exemple: `.translate bonjour en`, `.fr hello`, `.en salut`.'
            }, { quoted: message });
        }

        if (!textToTranslate) {
            return sock.sendMessage(chatId, {
                text: 'Aucun texte a traduire. Envoie du texte ou reponds a un message.'
            }, { quoted: message });
        }

        const { translatedText } = await translateText(textToTranslate, normalizedLanguage);

        await sock.sendMessage(chatId, { text: translatedText }, { quoted: message });
    } catch (error) {
        console.error('Translate command error:', error);
        await sock.sendMessage(chatId, {
            text:
                'Echec de la traduction.\n\n' +
                'Utilise:\n' +
                '.translate <texte> <lang>\n' +
                '.trt <texte> <lang>\n' +
                '.fr <texte>\n' +
                '.en <texte>'
        }, { quoted: message });
    }
}

module.exports = {
    handleTranslateCommand
};
