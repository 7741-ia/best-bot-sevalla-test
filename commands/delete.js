const isAdmin = require('../lib/isAdmin');
const store = require('../lib/lightweight_store');

const MAX_DELETE = 50; // Limite maximale de messages à supprimer par commande

/**
 * Commande pour supprimer des messages dans un groupe WhatsApp avec logs et alertes
 * @param {object} sock - Le socket Baileys
 * @param {string} chatId - ID du groupe
 * @param {object} message - Message contenant la commande
 * @param {string} senderId - ID de l'expéditeur
 */
async function deleteCommand(sock, chatId, message, senderId) {
    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        // Vérifie si le bot est admin
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '⚠️ Je dois être admin pour supprimer des messages.' }, { quoted: message });
            console.log(`[ALERTE] ${senderId} a tenté de supprimer des messages, mais le bot n'est pas admin.`);
            return;
        }

        // Vérifie si l'utilisateur est admin
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '❌ Seuls les admins peuvent utiliser la commande `.delete`.' }, { quoted: message });
            console.log(`[ALERTE] ${senderId} a tenté d’utiliser .delete sans être admin.`);
            return;
        }

        // Récupère le texte de la commande
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const parts = text.trim().split(/\s+/);
        let countArg = null;
        
        // Vérifie si un nombre est fourni
        if (parts.length > 1) {
            const maybeNum = parseInt(parts[1], 10);
            if (!isNaN(maybeNum) && maybeNum > 0) {
                countArg = Math.min(maybeNum, MAX_DELETE); // applique la limite max
                if (maybeNum > MAX_DELETE) {
                    await sock.sendMessage(chatId, { text: `⚠️ La limite de suppression est de ${MAX_DELETE} messages à la fois.` }, { quoted: message });
                    console.log(`[INFO] ${senderId} a essayé de supprimer ${maybeNum} messages, limité à ${MAX_DELETE}.`);
                }
            }
        }

        // Récupère l'utilisateur mentionné ou celui à qui on répond
        const ctxInfo = message.message?.extendedTextMessage?.contextInfo || {};
        const repliedParticipant = ctxInfo.participant || null;
        const mentioned = Array.isArray(ctxInfo.mentionedJid) && ctxInfo.mentionedJid.length > 0 ? ctxInfo.mentionedJid[0] : null;

        // Défaut à 1 si reply ou mention
        if (countArg === null && repliedParticipant) countArg = 1;
        else if (countArg === null && mentioned) countArg = 1;
        else if (countArg === null && !repliedParticipant && !mentioned) {
            await sock.sendMessage(chatId, { 
                text: '❌ Veuillez spécifier le nombre de messages à supprimer.\n\nUtilisation:\n• `.del 5` - Supprime les 5 derniers messages du groupe\n• `.del 3 @user` - Supprime les 3 derniers messages de @user\n• `.del 2` (répondre à un message) - Supprime les 2 derniers messages de l’utilisateur répondu' 
            }, { quoted: message });
            return;
        }

        // Détermine l'utilisateur cible
        let targetUser = null;
        let repliedMsgId = null;
        let deleteGroupMessages = false;
        
        if (repliedParticipant && ctxInfo.stanzaId) {
            targetUser = repliedParticipant;
            repliedMsgId = ctxInfo.stanzaId;
        } else if (mentioned) {
            targetUser = mentioned;
        } else {
            deleteGroupMessages = true; // supprime les derniers messages du groupe
        }

        // Récupère les messages stockés
        const chatMessages = Array.isArray(store.messages[chatId]) ? store.messages[chatId] : [];
        const toDelete = [];
        const seenIds = new Set();

        if (deleteGroupMessages) {
            // Supprime les derniers messages du groupe (tous utilisateurs)
            for (let i = chatMessages.length - 1; i >= 0 && toDelete.length < countArg; i--) {
                const m = chatMessages[i];
                if (!seenIds.has(m.key.id) && !m.message?.protocolMessage && !m.key.fromMe && m.key.id !== message.key.id) {
                    toDelete.push(m);
                    seenIds.add(m.key.id);
                }
            }
        } else {
            // Supprime les messages spécifiques d’un utilisateur
            if (repliedMsgId) {
                const repliedInStore = chatMessages.find(m => m.key.id === repliedMsgId && (m.key.participant || m.key.remoteJid) === targetUser);
                if (repliedInStore) {
                    toDelete.push(repliedInStore);
                    seenIds.add(repliedInStore.key.id);
                } else {
                    try {
                        await sock.sendMessage(chatId, {
                            delete: {
                                remoteJid: chatId,
                                fromMe: false,
                                id: repliedMsgId,
                                participant: repliedParticipant
                            }
                        });
                        countArg = Math.max(0, countArg - 1);
                    } catch {}
                }
            }
            for (let i = chatMessages.length - 1; i >= 0 && toDelete.length < countArg; i--) {
                const m = chatMessages[i];
                const participant = m.key.participant || m.key.remoteJid;
                if (participant === targetUser && !seenIds.has(m.key.id) && !m.message?.protocolMessage) {
                    toDelete.push(m);
                    seenIds.add(m.key.id);
                }
            }
        }

        if (toDelete.length === 0) {
            const errorMsg = deleteGroupMessages ? 'Aucun message récent trouvé dans le groupe à supprimer.' : 'Aucun message récent trouvé pour l’utilisateur cible.';
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
            console.log(`[INFO] ${senderId} n'avait aucun message à supprimer.`);
            return;
        }

        // Supprime les messages un par un avec un petit délai
        for (const m of toDelete) {
            try {
                const msgParticipant = deleteGroupMessages ? (m.key.participant || m.key.remoteJid) : (m.key.participant || targetUser);
                await sock.sendMessage(chatId, {
                    delete: {
                        remoteJid: chatId,
                        fromMe: false,
                        id: m.key.id,
                        participant: msgParticipant
                    }
                });
                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.log(`[ERREUR] Impossible de supprimer le message ${m.key.id}`);
            }
        }

        console.log(`[SUCCESS] ${senderId} a supprimé ${toDelete.length} message(s) dans ${chatId}.`);
        await sock.sendMessage(chatId, { text: `✅ ${toDelete.length} message(s) supprimé(s) avec succès.` });

    } catch (err) {
        await sock.sendMessage(chatId, { text: '❌ Échec de la suppression des messages.' }, { quoted: message });
        console.error('[ERREUR] deleteCommand:', err);
    }
}

module.exports = deleteCommand;
