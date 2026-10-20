const { isJidGroup } = require('@whiskeysockets/baileys');
const { getAntilink, incrementWarningCount, resetWarningCount, isSudo } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const config = require('../config');

const WARN_COUNT = config.WARN_COUNT || 3;

/**
 * Vérifie si une chaîne de caractères contient un lien (URL).
 *
 * @param {string} str - La chaîne à vérifier.
 * @returns {boolean} - True si un lien est détecté, sinon false.
 */
function containsURL(str) {
	const urlRegex = /(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i;
	return urlRegex.test(str);
}

/**
 * Gère la fonctionnalité Antilink pour les groupes.
 *
 * @param {object} msg - Le message à analyser.
 * @param {object} sock - Le socket utilisé pour envoyer des messages.
 */
async function Antilink(msg, sock) {
	const jid = msg.key.remoteJid;

	// Vérifier si c’est un groupe
	if (!isJidGroup(jid)) return;

	// Récupérer le texte du message
	const SenderMessage =
		msg.message?.conversation ||
		msg.message?.extendedTextMessage?.text || '';

	if (!SenderMessage || typeof SenderMessage !== 'string') return;

	const sender = msg.key.participant;
	if (!sender) return;

	// Ignorer si l’expéditeur est admin du groupe
	try {
		const { isSenderAdmin } = await isAdmin(sock, jid, sender);
		if (isSenderAdmin) return;
	} catch (_) {}

	// Ignorer si l’expéditeur est sudo
	const senderIsSudo = await isSudo(sender);
	if (senderIsSudo) return;

	// Vérifier s’il y a un lien
	if (!containsURL(SenderMessage.trim())) return;

	// Vérifier si l’antilink est activé
	const antilinkConfig = await getAntilink(jid, 'on');
	if (!antilinkConfig) return;

	const action = antilinkConfig.action;

	try {
		// Supprimer le message contenant le lien
		await sock.sendMessage(jid, { delete: msg.key });

		switch (action) {
			case 'delete':
				await sock.sendMessage(jid, {
					text: `\`\`\`@${sender.split('@')[0]} les liens ne sont pas autorisés ici\`\`\``,
					mentions: [sender]
				});
				break;

			case 'kick':
				await sock.groupParticipantsUpdate(jid, [sender], 'remove');
				await sock.sendMessage(jid, {
					text: `\`\`\`@${sender.split('@')[0]} a été expulsé pour avoir envoyé des liens\`\`\``,
					mentions: [sender]
				});
				break;

			case 'warn':
				const warningCount = await incrementWarningCount(jid, sender, 'antilink');
				if (warningCount >= WARN_COUNT) {
					await sock.groupParticipantsUpdate(jid, [sender], 'remove');
					await resetWarningCount(jid, sender, 'antilink');
					await sock.sendMessage(jid, {
						text: `\`\`\`@${sender.split('@')[0]} a été expulsé après ${WARN_COUNT} avertissements\`\`\``,
						mentions: [sender]
					});
				} else {
					await sock.sendMessage(jid, {
						text: `\`\`\`@${sender.split('@')[0]} avertissement ${warningCount}/${WARN_COUNT} pour envoi de lien\`\`\``,
						mentions: [sender]
					});
				}
				break;
		}
	} catch (error) {
		console.error('Erreur dans Antilink :', error);
	}
}

module.exports = { Antilink };
