const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('../lib/lazy')('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { splitForWhatsApp } = require('../lib/humanizer');

function getMessageText(message) {
    return String(
        message?.message?.conversation ||
        message?.message?.extendedTextMessage?.text ||
        message?.message?.imageMessage?.caption ||
        message?.message?.videoMessage?.caption ||
        ''
    ).trim();
}

function commandArguments(message, command, rawText) {
    return String(rawText || getMessageText(message))
        .replace(new RegExp(`^\\/?\\.?${command}\\b`, 'i'), '')
        .trim();
}

function tokenizeExpression(expression) {
    if (!expression || expression.length > 200) throw new Error('Expression vide ou trop longue.');
    const tokens = [];
    let position = 0;
    while (position < expression.length) {
        const match = /^\s*(\*\*|[()+\-*/%^]|(?:\d+(?:\.\d*)?|\.\d+))/.exec(expression.slice(position));
        if (!match) throw new Error('Caractère non autorisé dans le calcul.');
        tokens.push(match[1]);
        position += match[0].length;
        if (tokens.length > 100) throw new Error('Expression trop complexe.');
    }
    return tokens;
}

function calculate(expression) {
    const tokens = tokenizeExpression(expression);
    let position = 0;
    let depth = 0;

    function primary() {
        if (tokens[position] === '(') {
            position += 1;
            depth += 1;
            if (depth > 30) throw new Error('Trop de parenthèses imbriquées.');
            const value = addSubtract();
            if (tokens[position] !== ')') throw new Error('Parenthèse fermante manquante.');
            position += 1;
            depth -= 1;
            return value;
        }
        const token = tokens[position++];
        if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
            throw new Error('Nombre attendu dans le calcul.');
        }
        return Number(token);
    }

    function power() {
        const base = primary();
        if (tokens[position] === '^' || tokens[position] === '**') {
            position += 1;
            return base ** unary();
        }
        return base;
    }

    function unary() {
        if (tokens[position] === '+') {
            position += 1;
            return unary();
        }
        if (tokens[position] === '-') {
            position += 1;
            return -unary();
        }
        return power();
    }

    function multiplyDivide() {
        let value = unary();
        while (['*', '/', '%'].includes(tokens[position])) {
            const operator = tokens[position++];
            const right = unary();
            if ((operator === '/' || operator === '%') && right === 0) {
                throw new Error('Division par zero impossible.');
            }
            if (operator === '*') value *= right;
            else if (operator === '/') value /= right;
            else value %= right;
        }
        return value;
    }

    function addSubtract() {
        let value = multiplyDivide();
        while (tokens[position] === '+' || tokens[position] === '-') {
            const operator = tokens[position++];
            const right = multiplyDivide();
            value = operator === '+' ? value + right : value - right;
        }
        return value;
    }

    const result = addSubtract();
    if (position !== tokens.length) throw new Error('Expression invalide.');
    if (!Number.isFinite(result)) throw new Error('Le resultat n’est pas un nombre fini.');
    return Number.isInteger(result) ? String(result) : String(Number(result.toPrecision(12)));
}

async function calcCommand(sock, chatId, message, rawText) {
    const expression = commandArguments(message, 'calc', rawText);
    try {
        if (!expression) throw new Error('Exemple: /calc 25*18+10');
        await sock.sendMessage(chatId, { text: `Resultat: ${calculate(expression)}` }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: `Calcul impossible: ${error.message}` }, { quoted: message });
    }
}

function getMediaTarget(message, chatId) {
    const context = message?.message?.extendedTextMessage?.contextInfo;
    if (!context?.quotedMessage) return message;
    return {
        key: {
            remoteJid: chatId,
            id: context.stanzaId,
            participant: context.participant
        },
        message: context.quotedMessage
    };
}

async function toimgCommand(sock, chatId, message) {
    try {
        const target = getMediaTarget(message, chatId);
        if (!target.message?.stickerMessage) {
            await sock.sendMessage(chatId, {
                text: 'Envoie un sticker avec /toimg en legende ou reponds au sticker avec /toimg.'
            }, { quoted: message });
            return;
        }
        const buffer = await downloadMediaMessage(target, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });
        const image = await sharp(buffer, { limitInputPixels: 25000000 }).png().toBuffer();
        await sock.sendMessage(chatId, { image, mimetype: 'image/png' }, { quoted: message });
    } catch (error) {
        console.error('[toimg] conversion failed:', error.message);
        await sock.sendMessage(chatId, {
            text: 'Impossible de convertir ce sticker en image. Reessaie avec un autre sticker.'
        }, { quoted: message });
    }
}

async function splitCommand(sock, chatId, message, rawText) {
    const text = commandArguments(message, 'split', rawText);
    if (!text) {
        await sock.sendMessage(chatId, { text: 'Utilisation: /split [texte long]' }, { quoted: message });
        return;
    }
    const parts = splitForWhatsApp(text, 3500);
    for (const part of parts) {
        if (part) await sock.sendMessage(chatId, { text: part }, { quoted: message });
    }
}

async function randomCommand(sock, chatId, message, rawText) {
    const choices = commandArguments(message, 'random', rawText).split(',').map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) {
        await sock.sendMessage(chatId, { text: 'Utilisation: /random choix 1, choix 2, choix 3' }, { quoted: message });
        return;
    }
    const choice = choices[crypto.randomInt(choices.length)];
    await sock.sendMessage(chatId, { text: choice }, { quoted: message });
}

async function passwordCommand(sock, chatId, message, rawText) {
    const argument = commandArguments(message, 'password', rawText);
    const length = argument ? Number(argument) : 16;
    if (!Number.isInteger(length) || length < 1 || length > 128) {
        await sock.sendMessage(chatId, { text: 'Longueur invalide. Choisis un nombre de 1 a 128 (defaut: 16).' }, { quoted: message });
        return;
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
    const password = Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
    await sock.sendMessage(chatId, { text: password }, { quoted: message });
}

function escapeVCard(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

async function vcardCommand(sock, chatId, message, rawText) {
    const args = commandArguments(message, 'vcard', rawText);
    const phoneMatch = args.match(/(?:\+?\d[\d\s().-]{5,}\d)\s*$/);
    if (!phoneMatch) {
        await sock.sendMessage(chatId, { text: 'Utilisation: /vcard Nom Prenom +243XXXXXXXXX' }, { quoted: message });
        return;
    }
    const name = args.slice(0, phoneMatch.index).trim();
    const phone = phoneMatch[0].replace(/\s+/g, '').replace(/[().-]/g, '');
    if (!name || !/^\+?\d{7,15}$/.test(phone)) {
        await sock.sendMessage(chatId, { text: 'Nom ou numero invalide. Verifie le format et reessaie.' }, { quoted: message });
        return;
    }

    const safeName = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'contact';
    const tempDir = path.join(process.cwd(), 'tmp');
    const filePath = path.join(tempDir, `${Date.now()}_${safeName}.vcf`);
    const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${escapeVCard(name)}`,
        `TEL;TYPE=CELL:${phone}`,
        'END:VCARD',
        ''
    ].join('\r\n');

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(filePath, vcard, 'utf8');
        await sock.sendMessage(chatId, {
            document: { url: filePath },
            mimetype: 'text/vcard',
            fileName: `${safeName}.vcf`
        }, { quoted: message });
    } catch (error) {
        console.error('[vcard] file send failed:', error.message);
        await sock.sendMessage(chatId, { text: 'Impossible de creer ou d’envoyer le contact vCard.' }, { quoted: message });
    } finally {
        try { fs.unlinkSync(filePath); } catch {}
    }
}

module.exports = { calcCommand, toimgCommand, splitCommand, randomCommand, passwordCommand, vcardCommand };
