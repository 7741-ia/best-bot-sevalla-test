const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// Vérifie si le chat est un groupe et si le bot + l'expéditeur sont admins
async function ensureGroupAndAdmin(sock, chatId, senderId) {
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: 'Cette commande ne peut être utilisée que dans les groupes.' });
        return { ok: false };
    }

    // Vérifier le statut d'admin de l'expéditeur et du bot
    const isAdmin = require('../lib/isAdmin');
    const adminStatus = await isAdmin(sock, chatId, senderId);
    if (!adminStatus.isBotAdmin) {
        await sock.sendMessage(chatId, { text: 'Veuillez rendre le bot administrateur d\'abord.' });
        return { ok: false };
    }
    if (!adminStatus.isSenderAdmin) {
        await sock.sendMessage(chatId, { text: 'Seuls les admins du groupe peuvent utiliser cette commande.' });
        return { ok: false };
    }
    return { ok: true };
}

// Modifier la description du groupe
async function setGroupDescription(sock, chatId, senderId, text, message) {
    const check = await ensureGroupAndAdmin(sock, chatId, senderId);
    if (!check.ok) return;

    const desc = (text || '').trim();
    if (!desc) {
        await sock.sendMessage(chatId, { text: 'Usage : .setgdesc <nouvelle description>' }, { quoted: message });
        return;
    }
    try {
        await sock.groupUpdateDescription(chatId, desc);
        await sock.sendMessage(chatId, { text: '✅ La description du groupe a été mise à jour.' }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Impossible de mettre à jour la description du groupe.' }, { quoted: message });
    }
}

// Modifier le nom du groupe
async function setGroupName(sock, chatId, senderId, text, message) {
    const check = await ensureGroupAndAdmin(sock, chatId, senderId);
    if (!check.ok) return;

    const name = (text || '').trim();
    if (!name) {
        await sock.sendMessage(chatId, { text: 'Usage : .setgname <nouveau nom>' }, { quoted: message });
        return;
    }
    try {
        await sock.groupUpdateSubject(chatId, name);
        await sock.sendMessage(chatId, { text: '✅ Le nom du groupe a été mis à jour.' }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Impossible de mettre à jour le nom du groupe.' }, { quoted: message });
    }
}

// Modifier la photo du profil du groupe
async function setGroupPhoto(sock, chatId, senderId, message) {
    const check = await ensureGroupAndAdmin(sock, chatId, senderId);
    if (!check.ok) return;

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = quoted?.imageMessage || quoted?.stickerMessage;
    if (!imageMessage) {
        await sock.sendMessage(chatId, { text: 'Répondez à une image/sticker avec .setgpp pour changer la photo du groupe.' }, { quoted: message });
        return;
    }

    try {
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const imgPath = path.join(tmpDir, `gpp_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, buffer);

        await sock.updateProfilePicture(chatId, { url: imgPath });
        try { fs.unlinkSync(imgPath); } catch (_) {}
        await sock.sendMessage(chatId, { text: '✅ La photo du groupe a été mise à jour.' }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Impossible de mettre à jour la photo du groupe.' }, { quoted: message });
    }
}

module.exports = {
    setGroupDescription,
    setGroupName,
    setGroupPhoto
};
