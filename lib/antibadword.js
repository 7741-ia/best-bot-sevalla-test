const { setAntiBadword, getAntiBadword, removeAntiBadword, incrementWarningCount, resetWarningCount } = require('../lib/index');
const fs = require('fs');
const path = require('path');

// Charger la configuration antibadword
function loadAntibadwordConfig(groupId) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(configPath)) {
            return {};
        }
        const data = JSON.parse(fs.readFileSync(configPath));
        return data.antibadword?.[groupId] || {};
    } catch (error) {
        console.error('❌ Erreur lors du chargement de la configuration antibadword :', error.message);
        return {};
    }
}

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*CONFIGURATION ANTIBADWORD*

*.antibadword on*
Activer l’antibadword

*.antibadword set <action>*
Définir l’action : delete / kick / warn

*.antibadword off*
Désactiver l’antibadword dans ce groupe`
        }, { quoted: message });
    }

    if (match === 'on') {
        const existingConfig = await getAntiBadword(chatId, 'on');
        if (existingConfig?.enabled) {
            return sock.sendMessage(chatId, {
                text: '*L’AntiBadword est déjà activé dans ce groupe*'
            });
        }
        await setAntiBadword(chatId, 'on', 'delete');
        return sock.sendMessage(chatId, {
            text: '*AntiBadword activé. Utilisez .antibadword set <action> pour personnaliser l’action*'
        }, { quoted: message });
    }

    if (match === 'off') {
        const config = await getAntiBadword(chatId, 'on');
        if (!config?.enabled) {
            return sock.sendMessage(chatId, {
                text: '*L’AntiBadword est déjà désactivé dans ce groupe*'
            }, { quoted: message });
        }
        await removeAntiBadword(chatId);
        return sock.sendMessage(chatId, {
            text: '*AntiBadword désactivé dans ce groupe*'
        }, { quoted: message });
    }

    if (match.startsWith('set')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, {
                text: '*Action invalide. Choisissez : delete, kick ou warn*'
            }, { quoted: message });
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, {
            text: `*Action AntiBadword définie sur : ${action}*`
        }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
        text: '*Commande invalide. Utilisez .antibadword pour voir l’aide*'
    }, { quoted: message });
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    const config = loadAntibadwordConfig(chatId);
    if (!config.enabled) return;

    // Ignorer si ce n’est pas un groupe
    if (!chatId.endsWith('@g.us')) return;

    // Ignorer les messages du bot
    if (message.key.fromMe) return;

    // Récupérer la configuration antibadword
    const antiBadwordConfig = await getAntiBadword(chatId, 'on');
    if (!antiBadwordConfig?.enabled) {
        return;
    }

    // Nettoyer et mettre le message en minuscules
    const cleanMessage = userMessage.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Liste des mots interdits
    const badWords = [
    // Insultes générales
    'idiot', 'imbécile', 'débile', 'crétin', 'abruti', 'con', 'connard',
    'connasse', 'salaud', 'ordure', 'enfoiré', 'sale type',

    // Insultes sexuelles / vulgaires
    'putain', 'pute', 'salope', 'bordel', 'merde', 'enculé',
    'nique', 'niquer', 'baise', 'baiser', 'branleur',
    'bite', 'queue', 'couilles', 'chatte', 'conne',
    'nichons', 'seins',

    // Insultes familiales (très graves)
    'ta mère', 'ta maman', 'fils de pute', 'fille de pute',
    'bâtard', 'batard',

    // Insultes discriminatoires (à modérer strictement)
    'nègre', 'negro', 'pédé', 'pd', 'tapette',
    'gouine', 'travelo',

    // Insultes anglaises encore très utilisées
    'fuck', 'fucker', 'motherfucker', 'bitch', 'asshole',
    'dick', 'pussy', 'cock', 'cunt',

    // Contenu sexuel explicite
    'porno', 'porn', 'xxx', 'sexe',

    // Variantes écrites pour contourner le filtre
    'fuck', 'f@ck', 'b!tch', 'd!ck', 'p*te', 's@lope'
];


    const messageWords = cleanMessage.split(' ');
    let containsBadWord = false;

    for (const word of messageWords) {
        if (word.length < 2) continue;

        if (badWords.includes(word)) {
            containsBadWord = true;
            break;
        }

        for (const badWord of badWords) {
            if (badWord.includes(' ') && cleanMessage.includes(badWord)) {
                containsBadWord = true;
                break;
            }
        }
        if (containsBadWord) break;
    }

    if (!containsBadWord) return;

    // Vérifier si le bot est admin
    const groupMetadata = await sock.groupMetadata(chatId);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const bot = groupMetadata.participants.find(p => p.id === botId);
    if (!bot?.admin) return;

    // Ignorer les admins
    const participant = groupMetadata.participants.find(p => p.id === senderId);
    if (participant?.admin) return;

    // Supprimer le message
    try {
        await sock.sendMessage(chatId, { delete: message.key });
    } catch (err) {
        console.error('Erreur lors de la suppression du message :', err);
        return;
    }

    // Appliquer l’action définie
    switch (antiBadwordConfig.action) {
        case 'delete':
            await sock.sendMessage(chatId, {
                text: `*@${senderId.split('@')[0]} les mots grossiers sont interdits ici*`,
                mentions: [senderId]
            });
            break;

        case 'kick':
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `*@${senderId.split('@')[0]} a été expulsé pour langage inapproprié*`,
                    mentions: [senderId]
                });
            } catch (error) {
                console.error('Erreur lors de l’expulsion :', error);
            }
            break;

        case 'warn':
            const warningCount = await incrementWarningCount(chatId, senderId, 'antibadword');
            if (warningCount >= 3) {
                try {
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    await resetWarningCount(chatId, senderId, 'antibadword');
                    await sock.sendMessage(chatId, {
                        text: `*@${senderId.split('@')[0]} a été expulsé après 3 avertissements*`,
                        mentions: [senderId]
                    });
                } catch (error) {
                    console.error('Erreur après avertissements :', error);
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: `*@${senderId.split('@')[0]} avertissement ${warningCount}/3 pour langage inapproprié*`,
                    mentions: [senderId]
                });
            }
            break;
    }
}

module.exports = {
    handleAntiBadwordCommand,
    handleBadwordDetection
};
