const isAdmin = require('../lib/isAdmin');
const { formatRdcDate } = require('../lib/time');

/**
 * Commande pour rétrograder un ou plusieurs admins d'un groupe
 * @param {object} sock - Instance Baileys
 * @param {string} chatId - ID du groupe
 * @param {array} mentionedJids - Liste des utilisateurs mentionnés
 * @param {object} message - Message de commande
 */
async function demoteCommand(sock, chatId, mentionedJids, message) {
    try {
        // Vérifie que c'est un groupe
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: '❌ Cette commande ne peut être utilisée que dans un groupe !'
            });
            return;
        }

        // Vérifie le statut admin avant toute opération
        try {
            const adminStatus = await isAdmin(sock, chatId, require('../lib/jidUtils').getSender(message));
            
            if (!adminStatus.isBotAdmin) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Erreur : Veuillez rendre le bot admin pour utiliser cette commande.'
                });
                return;
            }

            if (!adminStatus.isSenderAdmin) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Erreur : Seuls les admins du groupe peuvent utiliser la commande de rétrogradation.'
                });
                return;
            }
        } catch (adminError) {
            console.error('Erreur lors de la vérification du statut admin :', adminError);
            await sock.sendMessage(chatId, { 
                text: '❌ Erreur : Assurez-vous que le bot est admin de ce groupe.'
            });
            return;
        }

        let usersToDemote = [];
        
        // Vérifie les utilisateurs mentionnés
        if (mentionedJids && mentionedJids.length > 0) {
            usersToDemote = mentionedJids;
        }
        // Vérifie la réponse à un message
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            usersToDemote = [message.message.extendedTextMessage.contextInfo.participant];
        }
        
        // Si aucun utilisateur n’est trouvé
        if (usersToDemote.length === 0) {
            await sock.sendMessage(chatId, { 
                text: '❌ Erreur : Veuillez mentionner l’utilisateur ou répondre à son message pour le rétrograder !'
            });
            return;
        }

        // Petit délai pour éviter le rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.groupParticipantsUpdate(chatId, usersToDemote, "demote");
        
        // Récupère les pseudos pour chaque utilisateur rétrogradé
        const usernames = await Promise.all(usersToDemote.map(async jid => `@${jid.split('@')[0]}`));

        await new Promise(resolve => setTimeout(resolve, 1000));

        const demotionMessage = `*『 RÉTROGRADATION DU GROUPE 』*\n\n` +
            `👤 *Utilisateur${usersToDemote.length > 1 ? 's' : ''} rétrogradé${usersToDemote.length > 1 ? 's' : ''} :*\n` +
            `${usernames.map(name => `• ${name}`).join('\n')}\n\n` +
            `👑 *Rétrogradé par :* @${message.key.participant ? message.key.participant.split('@')[0] : message.key.remoteJid.split('@')[0]}\n\n` +
            `📅 *Date :* ${formatRdcDate()}`;
        
        await sock.sendMessage(chatId, { 
            text: demotionMessage,
            mentions: [...usersToDemote, require('../lib/jidUtils').getSender(message)]
        });

    } catch (error) {
        console.error('Erreur lors de la commande de rétrogradation :', error);
        if (error.data === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                await sock.sendMessage(chatId, { 
                    text: '❌ Limite atteinte. Veuillez réessayer dans quelques secondes.'
                });
            } catch (retryError) {
                console.error('Erreur lors de l’envoi du message de retry :', retryError);
            }
        } else {
            try {
                await sock.sendMessage(chatId, { 
                    text: '❌ Impossible de rétrograder l’utilisateur. Assurez-vous que le bot est admin et a les permissions nécessaires.'
                });
            } catch (sendError) {
                console.error('Erreur lors de l’envoi du message d’erreur :', sendError);
            }
        }
    }
}

/**
 * Gestion automatique d’événements de rétrogradation
 * @param {object} sock - Instance Baileys
 * @param {string} groupId - ID du groupe
 * @param {array} participants - Liste des participants rétrogradés
 * @param {string} author - JID de l’admin ayant rétrogradé
 */
async function handleDemotionEvent(sock, groupId, participants, author) {
    try {
        if (!Array.isArray(participants) || participants.length === 0) return;

        await new Promise(resolve => setTimeout(resolve, 1000));

        const demotedUsernames = await Promise.all(participants.map(async jid => {
            const jidString = typeof jid === 'string' ? jid : (jid.id || jid.toString());
            return `@${jidString.split('@')[0]}`;
        }));

        let demotedBy;
        let mentionList = participants.map(jid => typeof jid === 'string' ? jid : (jid.id || jid.toString()));

        if (author && author.length > 0) {
            const authorJid = typeof author === 'string' ? author : (author.id || author.toString());
            demotedBy = `@${authorJid.split('@')[0]}`;
            mentionList.push(authorJid);
        } else {
            demotedBy = 'Système';
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        const demotionMessage = `*『 RÉTROGRADATION DU GROUPE 』*\n\n` +
            `👤 *Utilisateur${participants.length > 1 ? 's' : ''} rétrogradé${participants.length > 1 ? 's' : ''} :*\n` +
            `${demotedUsernames.map(name => `• ${name}`).join('\n')}\n\n` +
            `👑 *Rétrogradé par :* ${demotedBy}\n\n` +
            `📅 *Date :* ${formatRdcDate()}`;
        
        await sock.sendMessage(groupId, {
            text: demotionMessage,
            mentions: mentionList
        });
    } catch (error) {
        console.error('Erreur lors de la gestion de l’événement de rétrogradation :', error);
        if (error.data === 429) await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

module.exports = { demoteCommand, handleDemotionEvent };
