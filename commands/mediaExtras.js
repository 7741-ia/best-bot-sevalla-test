/**
 * Commandes média supplémentaires (API publiques gratuites, sans clé, sans dépendance en plus) :
 *   .img <mots>        recherche d'images (Pinterest)
 *   .apk <application> infos + fichier APK (Aptoide)
 *   .tempmail          adresse e-mail jetable (mail.tm) : .tempmail inbox | read <n> | delete
 */
const axios = require('axios');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const textOf = (message) => message.message?.conversation || message.message?.extendedTextMessage?.text || '';
const argsOf = (message) => textOf(message).trim().split(/\s+/).slice(1);

// ------------------------------------------------------------------ .img
async function imgCommand(sock, chatId, message) {
    const query = argsOf(message).join(' ');
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });
    if (!query) return reply('🖼️ Indique ce que tu cherches.\nExemple : .img coucher de soleil');

    try {
        const { data } = await axios.get('https://christus-api.vercel.app/image/Pinterest', {
            params: { query, limit: 10 },
            timeout: 15000,
        });
        const images = (Array.isArray(data?.results) ? data.results : [])
            .filter((item) => item?.imageUrl && /\.(jpe?g|png|webp)$/i.test(item.imageUrl))
            .slice(0, 5);
        if (!data?.status || !images.length) return reply(`💔 Aucune image trouvée pour « ${query} ». Essaie d’autres mots-clés.`);

        for (const [index, image] of images.entries()) {
            try {
                await sock.sendMessage(chatId, { image: { url: image.imageUrl }, caption: index === 0 ? `🖼️ Résultats pour « ${query} »` : '' }, { quoted: index === 0 ? message : undefined });
            } catch (error) {
                console.error('[img] envoi échoué :', error.message);
            }
            await sleep(800);
        }
    } catch (error) {
        console.error('[img] error:', error.message);
        await reply('❌ Impossible de chercher des images pour le moment. Réessaie plus tard.');
    }
}

// ------------------------------------------------------------------ .apk
const MAX_APK_MB = Number(process.env.APK_MAX_MB) || 60; // évite de saturer la RAM d'un petit serveur

async function apkCommand(sock, chatId, message) {
    const query = argsOf(message).join(' ');
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });
    if (!query) return reply('📦 Indique le nom d’une application.\nExemple : .apk whatsapp');

    try {
        const { data } = await axios.get(`http://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`, {
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        const app = data?.datalist?.list?.[0];
        if (!app) return reply(`💔 Aucune application trouvée pour « ${query} ».`);

        const sizeMb = (Number(app.size) || 0) / 1048576;
        const link = app.file?.path || app.file?.path_alt;
        const caption = [
            `📦 *${(app.name || 'Inconnu').toUpperCase()}*`,
            `📏 Taille : ${sizeMb.toFixed(2)} Mo`,
            `🧩 Paquet : ${app.package || 'Inconnu'}`,
            `🏷️ Version : ${app.file?.vername || 'Inconnue'}`,
        ].join('\n');

        if (app.icon) await sock.sendMessage(chatId, { image: { url: app.icon }, caption }, { quoted: message });
        else await reply(caption);

        if (!link) return reply('❌ Aucun lien de téléchargement disponible.');
        if (sizeMb > MAX_APK_MB) return reply(`⚠️ Fichier trop lourd pour être envoyé par le bot (${sizeMb.toFixed(0)} Mo, max ${MAX_APK_MB} Mo).\nLien direct : ${link}`);

        await sock.sendMessage(chatId, {
            document: { url: link },
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${app.name || 'app'}.apk`,
        }, { quoted: message });
    } catch (error) {
        console.error('[apk] error:', error.message);
        await reply('❌ Le téléchargement de l’APK a échoué. Réessaie plus tard.');
    }
}

// ------------------------------------------------------------------ .tempmail (mail.tm)
const MAIL_API = 'https://api.mail.tm';
const mailboxes = new Map(); // expéditeur -> { address, password, token }

async function createMailbox() {
    const domains = await axios.get(`${MAIL_API}/domains`, { timeout: 15000 });
    const domain = domains.data?.['hydra:member']?.[0]?.domain;
    if (!domain) throw new Error('aucun domaine disponible');
    const name = `bb${Math.random().toString(36).slice(2, 10)}`;
    const address = `${name}@${domain}`;
    const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    await axios.post(`${MAIL_API}/accounts`, { address, password }, { timeout: 15000 });
    const token = (await axios.post(`${MAIL_API}/token`, { address, password }, { timeout: 15000 })).data?.token;
    if (!token) throw new Error('jeton manquant');
    return { address, password, token };
}

async function tempmailCommand(sock, chatId, message) {
    const sender = require('../lib/jidUtils').getSender(message);
    const [action = '', arg = ''] = argsOf(message).map((w) => w.toLowerCase());
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

    try {
        let box = mailboxes.get(sender);

        if (action === 'delete' || action === 'del') {
            if (!box) return reply('ℹ️ Tu n’as pas d’adresse temporaire active.');
            mailboxes.delete(sender);
            return reply('🗑️ Adresse temporaire supprimée.');
        }

        if (!box || action === 'new') {
            box = await createMailbox();
            mailboxes.set(sender, box);
            if (mailboxes.size > 50) mailboxes.delete(mailboxes.keys().next().value);
            return reply(`📧 *Ton adresse temporaire :*\n${box.address}\n\nVoir les messages : *.tempmail inbox*\nLire un message : *.tempmail read 1*\nSupprimer : *.tempmail delete*`);
        }

        const headers = { Authorization: `Bearer ${box.token}` };
        const list = (await axios.get(`${MAIL_API}/messages`, { headers, timeout: 15000 })).data?.['hydra:member'] || [];

        if (action === 'read' || action === 'lire') {
            const item = list[Number(arg) - 1];
            if (!item) return reply('❌ Message introuvable. Utilise *.tempmail inbox* pour voir les numéros.');
            const full = (await axios.get(`${MAIL_API}/messages/${item.id}`, { headers, timeout: 15000 })).data;
            const body = String(full?.text || full?.intro || '(message vide)').trim().slice(0, 3000);
            return reply(`📩 *${full?.subject || '(sans objet)'}*\nDe : ${full?.from?.address || 'inconnu'}\n\n${body}`);
        }

        if (!list.length) return reply(`📭 Boîte vide pour *${box.address}*.\nRéessaie dans un instant avec *.tempmail inbox*.`);
        const lines = list.slice(0, 10).map((m, i) => `${i + 1}. *${m.subject || '(sans objet)'}*\n   De : ${m.from?.address || 'inconnu'}`);
        return reply(`📬 *${box.address}*\n\n${lines.join('\n')}\n\nLire : *.tempmail read <numéro>*`);
    } catch (error) {
        console.error('[tempmail] error:', error?.response?.status || error.message);
        mailboxes.delete(sender);
        await reply('❌ Service e-mail temporaire indisponible. Réessaie avec *.tempmail new*.');
    }
}

module.exports = { imgCommand, apkCommand, tempmailCommand };
