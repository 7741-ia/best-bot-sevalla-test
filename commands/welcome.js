const { handleWelcome } = require('../lib/welcome');
const { isWelcomeOn, getWelcome } = require('../lib/index');
const { channelInfo } = require('../lib/messageConfig');
const fetch = require('node-fetch');
const { formatRdcDate } = require('../lib/time');

async function commandeBienvenue(sock, chatId, message, match) {
    // Vérifie si c'est un groupe
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Cette commande ne peut être utilisée que dans les groupes.' });
        return;
    }

    // Récupère le texte après la commande
    const text = message.message?.conversation || 
                 message.message?.extendedTextMessage?.text || '';
    const matchText = text.split(' ').slice(1).join(' ');

    await handleWelcome(sock, chatId, message, matchText);
}

async function gererNouvelArrivant(sock, id, participants) {
    // Vérifie si le welcome est activé pour ce groupe
    const isWelcomeEnabled = await isWelcomeOn(id);
    if (!isWelcomeEnabled) return;

    // Récupère le message de bienvenue personnalisé
    const messagePerso = await getWelcome(id);

    // Récupère les infos du groupe
    const groupMetadata = await sock.groupMetadata(id);
    const nomGroupe = groupMetadata.subject;
    const descriptionGroupe = groupMetadata.desc || 'Aucune description disponible';

    // Envoie le message de bienvenue à chaque nouveau participant
    for (const participant of participants) {
        try {
            const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
            const user = participantString.split('@')[0];

            // Récupère le nom affiché de l'utilisateur
            let displayName = user;
            try {
                const contact = await sock.getBusinessProfile(participantString);
                if (contact && contact.name) {
                    displayName = contact.name;
                } else {
                    const userParticipant = groupMetadata.participants.find(p => p.id === participantString);
                    if (userParticipant && userParticipant.name) displayName = userParticipant.name;
                }
            } catch {
                console.log('Impossible de récupérer le nom affiché, utilisation du numéro.');
            }

            // Prépare le message final avec les variables
            let messageFinal;
            if (messagePerso) {
                messageFinal = messagePerso
                    .replace(/{user}/g, `@${displayName}`)
                    .replace(/{group}/g, nomGroupe)
                    .replace(/{description}/g, descriptionGroupe);
            } else {
                const timeString = formatRdcDate();

                messageFinal = `╭╼━≪•𝗡𝗢𝗨𝗩𝗘𝗔𝗨 𝗠𝗘𝗠𝗕𝗥𝗘•≫━╾╮
┃𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗨 : @${displayName} 👋
┃Nombre de membres : #${groupMetadata.participants.length}
┃𝗛𝗘𝗨𝗥𝗘 : ${timeString}⏰
╰━━━━━━━━━━━━━━━╯

*@${displayName}* bienvenue dans *${nomGroupe}*! 🎉
*Description du groupe :*
${descriptionGroupe}

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ best Bot*`;
            }

            // Essaye d’envoyer l’image de bienvenue
            try {
                let profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png'; // avatar par défaut
                try {
                    const profilePic = await sock.profilePictureUrl(participantString, 'image');
                    if (profilePic) profilePicUrl = profilePic;
                } catch {
                    console.log('Impossible de récupérer la photo de profil, utilisation de l’avatar par défaut.');
                }

                const apiUrl = `https://api.some-random-api.com/welcome/img/2/gaming3?type=join&textcolor=green&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(nomGroupe)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
                const response = await fetch(apiUrl);

                if (response.ok) {
                    const imageBuffer = await response.buffer();
                    await sock.sendMessage(id, {
                        image: imageBuffer,
                        caption: messageFinal,
                        mentions: [participantString],
                        ...channelInfo
                    });
                    continue; // passe au participant suivant
                }
            } catch {
                console.log('La génération de l’image a échoué, envoi du texte à la place.');
            }

            // Envoie du message texte si image non disponible
            await sock.sendMessage(id, {
                text: messageFinal,
                mentions: [participantString],
                ...channelInfo
            });

        } catch (error) {
            console.error('Erreur lors de l’envoi du message de bienvenue :', error);
            const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
            const user = participantString.split('@')[0];
            const fallbackMessage = messagePerso 
                ? messagePerso.replace(/{user}/g, `@${user}`).replace(/{group}/g, nomGroupe).replace(/{description}/g, descriptionGroupe)
                : `Bienvenue @${user} dans ${nomGroupe} ! 🎉`;

            await sock.sendMessage(id, {
                text: fallbackMessage,
                mentions: [participantString],
                ...channelInfo
            });
        }
    }
}

module.exports = {
    commandeBienvenue,
    welcomeCommand: commandeBienvenue,
    gererNouvelArrivant,
    handleJoinEvent: gererNouvelArrivant
};
