const { handleGoodbye } = require('../lib/welcome');
const { isGoodByeOn, getGoodbye } = require('../lib/index');
const fetch = require('node-fetch');

// Commande pour définir le message d'au revoir
async function goodbyeCommand(sock, chatId, message, match) {
    // Vérifier si c'est un groupe
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Cette commande ne peut être utilisée que dans les groupes.' });
        return;
    }

    // Extraire le texte après la commande
    const text = message.message?.conversation || 
                message.message?.extendedTextMessage?.text || '';
    const matchText = text.split(' ').slice(1).join(' ');

    await handleGoodbye(sock, chatId, message, matchText);
}

// Gérer l'événement lorsqu'un participant quitte le groupe
async function handleLeaveEvent(sock, id, participants) {
    // Vérifier si les messages d'au revoir sont activés pour ce groupe
    const isGoodbyeEnabled = await isGoodByeOn(id);
    if (!isGoodbyeEnabled) return;

    // Récupérer le message d'au revoir personnalisé
    const customMessage = await getGoodbye(id);

    // Obtenir les infos du groupe
    const groupMetadata = await sock.groupMetadata(id);
    const groupName = groupMetadata.subject;

    // Envoyer le message d'au revoir pour chaque participant qui quitte
    for (const participant of participants) {
        try {
            // Gérer le cas où le participant pourrait ne pas être une chaîne de caractères
            const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
            const user = participantString.split('@')[0];
            
            // Obtenir le nom affiché de l'utilisateur
            let displayName = user; // Par défaut, utiliser le numéro
            try {
                const contact = await sock.getBusinessProfile(participantString);
                if (contact && contact.name) {
                    displayName = contact.name;
                } else {
                    // Essayer depuis la liste des participants du groupe
                    const groupParticipants = groupMetadata.participants;
                    const userParticipant = groupParticipants.find(p => p.id === participantString);
                    if (userParticipant && userParticipant.name) {
                        displayName = userParticipant.name;
                    }
                }
            } catch (nameError) {
                console.log('Impossible de récupérer le nom affiché, utilisation du numéro');
            }
            
            // Traiter le message personnalisé avec les variables
            let finalMessage;
            if (customMessage) {
                finalMessage = customMessage
                    .replace(/{user}/g, `@${displayName}`)
                    .replace(/{group}/g, groupName);
            } else {
                // Message par défaut si aucun message personnalisé n'est défini
                finalMessage = ` *@${displayName}*, tu vas nous manquer ! `;
            }
            
            // Essayer d'envoyer une image d'abord (toujours tenter avec une image)
            try {
                // Obtenir la photo de profil de l'utilisateur
                let profilePicUrl = `https://img.pyrocdn.com/dbKUgahg.png`; // Avatar par défaut
                try {
                    const profilePic = await sock.profilePictureUrl(participantString, 'image');
                    if (profilePic) {
                        profilePicUrl = profilePic;
                    }
                } catch (profileError) {
                    console.log('Impossible de récupérer la photo de profil, utilisation de l\'avatar par défaut');
                }
                
                // Construire l'URL pour l'image d'au revoir
                const apiUrl = `https://api.some-random-api.com/welcome/img/2/gaming1?type=leave&textcolor=red&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
                
                // Récupérer l'image d'au revoir
                const response = await fetch(apiUrl);
                if (response.ok) {
                    const imageBuffer = await response.buffer();
                    
                    // Envoyer l'image avec le message (personnalisé ou par défaut)
                    await sock.sendMessage(id, {
                        image: imageBuffer,
                        caption: finalMessage,
                        mentions: [participantString]
                    });
                    continue; // Passer au participant suivant
                }
            } catch (imageError) {
                console.log('Échec de la génération de l\'image, envoi du message texte à la place');
            }
            
            // Envoyer un message texte (personnalisé ou fallback)
            await sock.sendMessage(id, {
                text: finalMessage,
                mentions: [participantString]
            });
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message d\'au revoir :', error);
            // Message fallback en cas d'erreur
            const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
            const user = participantString.split('@')[0];
            
            // Utiliser le message personnalisé si disponible, sinon un message simple
            let fallbackMessage;
            if (customMessage) {
                fallbackMessage = customMessage
                    .replace(/{user}/g, `@${user}`)
                    .replace(/{group}/g, groupName);
            } else {
                fallbackMessage = `Au revoir @${user} ! 👋`;
            }
            
            await sock.sendMessage(id, {
                text: fallbackMessage,
                mentions: [participantString]
            });
        }
    }
}

module.exports = { goodbyeCommand, handleLeaveEvent };
