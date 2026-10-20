const fs = require('fs');
const isOwnerOrSudo = require('../lib/isOwner');

const PMBLOCKER_PATH = './data/pmblocker.json';

// Lire l'état actuel
function lireEtat() {
    try {
        if (!fs.existsSync(PMBLOCKER_PATH)) return { 
            enabled: false, 
            message: '⚠️ Les messages privés sont bloqués !\nVous ne pouvez pas envoyer de messages privés à ce bot. Veuillez contacter le propriétaire uniquement dans les groupes.' 
        };
        const raw = fs.readFileSync(PMBLOCKER_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return {
            enabled: !!data.enabled,
            message: typeof data.message === 'string' && data.message.trim() 
                ? data.message 
                : '⚠️ Les messages privés sont bloqués !\nVous ne pouvez pas envoyer de messages privés à ce bot. Veuillez contacter le propriétaire uniquement dans les groupes.'
        };
    } catch {
        return { 
            enabled: false, 
            message: '⚠️ Les messages privés sont bloqués !\nVous ne pouvez pas envoyer de messages privés à ce bot. Veuillez contacter le propriétaire uniquement dans les groupes.' 
        };
    }
}

// Écrire l'état dans le fichier
function ecrireEtat(enabled, message) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        const current = lireEtat();
        const payload = {
            enabled: !!enabled,
            message: typeof message === 'string' && message.trim() ? message : current.message
        };
        fs.writeFileSync(PMBLOCKER_PATH, JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('Erreur lors de la sauvegarde de PM Blocker:', err);
    }
}

// Commande principale
async function pmblockerCommand(sock, chatId, message, args) {
    const senderId = require('../lib/jidUtils').getSender(message);
    const estProprio = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!message.key.fromMe && !estProprio) {
        await sock.sendMessage(chatId, { text: '⚠️ Seul le propriétaire du bot peut utiliser cette commande !' }, { quoted: message });
        return;
    }
    
    const argStr = (args || '').trim();
    const [sub, ...rest] = argStr.split(' ');
    const state = lireEtat();

    if (!sub || !['on', 'off', 'status', 'setmsg'].includes(sub.toLowerCase())) {
        await sock.sendMessage(chatId, { 
            text: '*PMBLOCKER (Propriétaire seulement)*\n\n' +
                  '.pmblocker on - Activer le blocage automatique des messages privés\n' +
                  '.pmblocker off - Désactiver le blocage des messages privés\n' +
                  '.pmblocker status - Afficher l’état actuel\n' +
                  '.pmblocker setmsg <texte> - Définir le message d’avertissement' 
        }, { quoted: message });
        return;
    }

    switch (sub.toLowerCase()) {
        case 'status':
            await sock.sendMessage(chatId, { text: `PM Blocker est actuellement *${state.enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}*\nMessage: ${state.message}` }, { quoted: message });
            break;
        
        case 'setmsg':
            const nouveauMsg = rest.join(' ').trim();
            if (!nouveauMsg) {
                await sock.sendMessage(chatId, { text: 'Usage : .pmblocker setmsg <message>' }, { quoted: message });
                return;
            }
            ecrireEtat(state.enabled, nouveauMsg);
            await sock.sendMessage(chatId, { text: '✅ Message de PM Blocker mis à jour.' }, { quoted: message });
            break;
        
        case 'on':
        case 'off':
            const activer = sub.toLowerCase() === 'on';
            ecrireEtat(activer);
            await sock.sendMessage(chatId, { text: `PM Blocker est maintenant *${activer ? 'ACTIVÉ' : 'DÉSACTIVÉ'}*.` }, { quoted: message });
            break;
    }
}

module.exports = { pmblockerCommand, lireEtat, readState: lireEtat };
