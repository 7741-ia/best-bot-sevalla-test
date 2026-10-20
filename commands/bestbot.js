'use strict';

const crypto = require('crypto');
const settings = require('../settings');
const memory = require('../lib/assistantMemory');
const stickers = require('../lib/stickerLibrary');
const jidUtils = require('../lib/jidUtils');
const isOwnerOrSudo = require('../lib/isOwner');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { unwrapMessageContent } = require('../lib/waMessage');

const pendingResets = new Map();
const RESET_CONFIRM_TTL_MS = 2 * 60 * 1000;

function isOwnerAccount(senderId, message) {
    if (message?.key?.fromMe) return true;
    const wanted = String(settings.ownerNumber || '').replace(/\D/g, '');
    if (!wanted) return false;
    try { return jidUtils.phoneDigits(senderId) === wanted; }
    catch { return false; }
}

function profileText(profile) {
    const optionalLabels = {
        technologies: 'Technologies', currentProjects: 'Projets', communicationPreferences: 'Préférences de communication',
        learningGoals: 'Objectifs d’apprentissage', tools: 'Outils', workHabits: 'Habitudes de travail', answerFormats: 'Formats de réponse'
    };
    const optional = Object.entries(optionalLabels)
        .filter(([key]) => profile.optional?.[key]?.length)
        .map(([key, label]) => `${label} : ${profile.optional[key].join('; ')}`);
    const result = [
        `Profil de ${profile.fullName} (${profile.pseudonym})`,
        `Âge déclaré : ${profile.ageDeclared} ans`,
        `Ville : ${profile.city}`,
        `Établissement : ${profile.institution}`,
        `Niveau : ${profile.level}`,
        `Activités : ${profile.activities.join(', ')}`,
        `Centres d’intérêt : ${profile.interests.join(', ')}`,
        `Objectifs : ${profile.goals.join(', ')}`,
        `Photo : ${profile.profilePhotoPath ? 'fichier privé enregistré sur le volume persistant' : profile.profilePhotoUrl ? 'URL HTTPS enregistrée' : 'aucune photo enregistrée'}`,
        ...optional
    ].join('\n');
    return result.length > 3500 ? `${result.slice(0, 3480)}\n… profil tronqué; consulte les champs ciblés.` : result;
}

function memoryHelp() {
    return [
        'BestBot — commandes personnelles (à utiliser en message privé) :',
        '• .bestbot profile — profil de Daniel (propriétaire uniquement)',
        '• .bestbot profile set <nom|pseudo|âge|ville|études|niveau> <valeur> — corriger un champ du profil (propriétaire)',
        '• .bestbot memory — tes souvenirs enregistrés',
        '• .bestbot remember <information> — enregistrer explicitement un souvenir',
        '• .bestbot project <nom> | <note> — enregistrer une note de projet privée',
        '• .bestbot forget <mot ou sujet> — supprimer les souvenirs correspondants',
        '• .bestbot learn on|off — autoriser ou arrêter les observations stylistiques agrégées',
        '• .bestbot style — afficher tes préférences; .bestbot style <préférence> pour en ajouter une',
        '• .bestbot export — exporter tes données personnelles',
        '• .bestbot resetmemory — demander l’effacement; puis .bestbot resetmemory confirm',
        '• .bestbot add <technologies|projets|preferences|apprentissage|outils|habitudes|formats> <valeur> — ajouter au profil de Daniel (propriétaire)',
        '• .bestbot remove <champ> <valeur> — retirer du profil de Daniel (propriétaire)',
        '• .bestbot photo <URL HTTPS>|remove — gérer la photo de Daniel (propriétaire); image privée importable en légende/réponse',
        '• .bestbot sticker add <catégorie> — répondre à un sticker pour l’importer dans la bibliothèque locale (propriétaire)',
        '• .bestbot sticker list|remove <id> — consulter ou retirer les stickers importés',
        '• .bestbot stickers on|off|status|delay <minutes>|max <nombre> — réactions automatiques et fréquence (propriétaire)',
        'Les messages bruts ne sont pas gardés pour apprendre ton style. Les observations ne commencent qu’après ton accord.'
    ].join('\n');
}

async function handleBestBotCommand(sock, chatId, message, args = '') {
    const senderId = jidUtils.getSender(message);
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    const ownerAccount = isOwnerAccount(senderId, message);
    const subMatch = String(args || '').trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
    const sub = (subMatch?.[1] || '').toLowerCase();
    const rest = (subMatch?.[2] || '').trim();
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

    if (!sub || sub === 'help') return reply(memoryHelp());

    // Les données individuelles ne sont jamais affichées ou modifiées depuis un groupe.
    if (chatId.endsWith('@g.us')) {
        return reply('Pour protéger tes informations personnelles, utilise les commandes .bestbot en message privé.');
    }
    try {
        if (jidUtils.phoneDigits(chatId) !== jidUtils.phoneDigits(senderId)) {
            return reply('Pour protéger tes données, utilise cette commande dans ton propre fil privé avec le bot.');
        }
    } catch {
        return reply('Cette commande nécessite une conversation privée personnelle.');
    }

    try {
        switch (sub) {
            case 'profile': {
                if (!ownerAccount || !isOwner) return reply('Le profil de Daniel est réservé au propriétaire du bot.');
                const profileSet = rest.match(/^set\s+(\S+)\s+([\s\S]+)$/i);
                if (profileSet) {
                    const scalarAliases = {
                        nom: 'fullName', pseudo: 'pseudonym', pseudonyme: 'pseudonym', age: 'ageDeclared', âge: 'ageDeclared',
                        ville: 'city', city: 'city', etudes: 'institution', études: 'institution', ecole: 'institution',
                        niveau: 'level', level: 'level'
                    };
                    const field = scalarAliases[profileSet[1].toLowerCase()];
                    if (!field) return reply('Champ inconnu. Utilise : nom, pseudo, âge, ville, études ou niveau.');
                    memory.updateDanielProfileField(field, profileSet[2]);
                    return reply('Profil de Daniel mis à jour.');
                }
                return reply(profileText(memory.getDanielProfile()));
            }
            case 'memory': {
                const data = memory.getUserSummary(senderId);
                const items = data.memories.map((item, index) => `${index + 1}. ${item.content}`);
                const styles = data.stylePreferences.map((item, index) => `Style ${index + 1}. ${item.content}`);
                const projects = data.projects.map(project => `Projet ${project.name} : ${project.notes.map(note => note.content).join(' | ')}`);
                const observations = data.styleObservations.messages >= 10
                    ? `\nObservations stylistiques agrégées : ${data.styleObservations.messages} messages (aucun texte brut conservé).`
                    : '';
                const summary = `Apprentissage : ${data.consent.learning ? 'activé avec ton accord' : 'désactivé'}\n${items.slice(-10).join('\n') || 'Aucun souvenir enregistré.'}${projects.slice(-5).length ? `\n${projects.slice(-5).join('\n')}` : ''}${styles.slice(-5).length ? `\n${styles.slice(-5).join('\n')}` : ''}${observations}`;
                return reply(summary.length > 3500 ? `${summary.slice(0, 3480)}\n… aperçu tronqué; .bestbot export fournit le fichier complet.` : summary);
            }
            case 'learn': {
                const value = rest.toLowerCase();
                if (!['on', 'off'].includes(value)) return reply('Utilise : .bestbot learn on ou .bestbot learn off.');
                const enabled = value === 'on';
                memory.setLearningConsent(senderId, enabled);
                if (ownerAccount) require('./chatbot').clearLegacyLearningData();
                return reply(enabled
                    ? 'Accord enregistré. J’observerai uniquement des statistiques stylistiques agrégées; je ne conserverai pas tes messages bruts. Tu peux arrêter avec .bestbot learn off.'
                    : 'Apprentissage stylistique désactivé. Les statistiques stylistiques observées ont été effacées; tes souvenirs déclarés restent consultables.');
            }
            case 'remember': {
                if (!rest) return reply('Utilise : .bestbot remember <information à retenir>.');
                const item = memory.addMemory(senderId, rest);
                return reply(`C’est enregistré dans tes souvenirs personnels : « ${item.content} »`);
            }
            case 'project': {
                const divider = rest.indexOf('|');
                if (divider < 1 || divider === rest.length - 1) return reply('Utilise : .bestbot project <nom du projet> | <note à retenir>.');
                const project = memory.addProjectNote(senderId, rest.slice(0, divider), rest.slice(divider + 1));
                return reply(`Note enregistrée dans le projet privé « ${project.name} ».`);
            }
            case 'forget': {
                if (!rest) return reply('Utilise : .bestbot forget <mot ou sujet>.');
                const result = memory.forget(senderId, rest);
                return reply(result.removed
                    ? `${result.removed} souvenir(s), note(s) de projet ou préférence(s) correspondant à « ${rest.slice(0, 80)} » supprimé(s).`
                    : 'Aucun souvenir, note de projet ou préférence ne correspond à ce sujet.');
            }
            case 'resetmemory': {
                const key = crypto.createHash('sha256').update(memory.canonicalUserId(senderId) || 'invalid').digest('hex');
                const pendingAt = pendingResets.get(key);
                if (rest.toLowerCase() === 'confirm' && pendingAt && Date.now() - pendingAt <= RESET_CONFIRM_TTL_MS) {
                    pendingResets.delete(key);
                    memory.resetUser(senderId);
                    if (ownerAccount) require('./chatbot').clearLegacyLearningData();
                    return reply('Tes souvenirs, projets, préférences et observations stylistiques ont été effacés.');
                }
                pendingResets.set(key, Date.now());
                return reply('Pour confirmer l’effacement de tes souvenirs personnels, réponds dans les 2 minutes : .bestbot resetmemory confirm');
            }
            case 'style': {
                if (!rest) {
                    const data = memory.getUserSummary(senderId);
                    const prefs = data.stylePreferences.map(item => `• ${item.content}`).join('\n');
                    return reply(prefs ? `Tes préférences de réponse :\n${prefs}` : 'Aucune préférence de style enregistrée. Ajoute-en une avec .bestbot style <préférence>.');
                }
                memory.addStylePreference(senderId, rest);
                return reply('Préférence de style enregistrée pour tes conversations privées.');
            }
            case 'add':
            case 'remove': {
                if (!ownerAccount || !isOwner) return reply('La modification du profil de Daniel est réservée au propriétaire du bot.');
                const parsed = rest.match(/^(\S+)\s+([\s\S]+)$/);
                if (!parsed) return reply('Utilise : .bestbot add|remove <champ> <valeur>.');
                const aliases = {
                    technologies: 'technologies', technologie: 'technologies', langages: 'technologies',
                    projets: 'currentProjects', projet: 'currentProjects',
                    preferences: 'communicationPreferences', preference: 'communicationPreferences', communication: 'communicationPreferences',
                    apprentissage: 'learningGoals', objectifs: 'learningGoals', outils: 'tools',
                    habitudes: 'workHabits', formats: 'answerFormats', format: 'answerFormats',
                    activites: 'activities', activités: 'activities', centres: 'interests', interets: 'interests', intérêts: 'interests',
                    buts: 'goals', goals: 'goals'
                };
                const field = aliases[parsed[1].toLowerCase()];
                if (!field) return reply('Champ inconnu. Consulte .bestbot help pour les champs disponibles.');
                memory.updateDanielProfileList(field, parsed[2], sub === 'remove' ? 'remove' : 'add');
                return reply(sub === 'remove' ? 'Élément correspondant supprimé du profil de Daniel.' : 'Élément ajouté au profil privé de Daniel.');
            }
            case 'export': {
                const payload = Buffer.from(JSON.stringify(memory.exportUser(senderId), null, 2));
                if (payload.length > 4 * 1024 * 1024) return reply('L’export dépasse la limite de taille sécurisée; supprime ou réduit certains souvenirs avant de réessayer.');
                return sock.sendMessage(chatId, {
                    document: payload,
                    mimetype: 'application/json',
                    fileName: `bestbot-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`
                }, { quoted: message });
            }
            case 'photo': {
                if (!ownerAccount || !isOwner) return reply('La référence photo du profil de Daniel est réservée au propriétaire.');
                if (rest.toLowerCase() === 'remove' || rest.toLowerCase() === 'supprimer') {
                    memory.removeDanielPhoto();
                    return reply('La référence de photo a été supprimée du profil.');
                }
                if (!rest) {
                    const body = unwrapMessageContent(message?.message || {});
                    const context = body.extendedTextMessage?.contextInfo || body.imageMessage?.contextInfo || {};
                    const quoted = context.quotedMessage ? unwrapMessageContent(context.quotedMessage) : {};
                    const image = body.imageMessage || quoted.imageMessage;
                    if (image) {
                        const declaredSize = Number(image.fileLength?.toString?.() || image.fileLength);
                        if (Number.isFinite(declaredSize) && declaredSize > 5 * 1024 * 1024) throw new TypeError('Image supérieure à 5 Mo');
                        const stream = await downloadContentFromMessage(image, 'image');
                        const chunks = [];
                        let total = 0;
                        for await (const chunk of stream) {
                            total += chunk.length;
                            if (total > 5 * 1024 * 1024) throw new TypeError('Image supérieure à 5 Mo');
                            chunks.push(chunk);
                        }
                        memory.saveDanielPhotoBuffer(Buffer.concat(chunks), image.mimetype);
                        return reply('Photo enregistrée dans le volume persistant privé de Daniel. Elle n’est ni publiée ni ajoutée au dépôt.');
                    }
                    const profile = memory.getDanielProfile();
                    const saved = profile.profilePhotoPath ? 'un fichier privé est enregistré' : profile.profilePhotoUrl ? 'une URL HTTPS est enregistrée' : 'aucune photo enregistrée';
                    return reply(`Photo du profil de Daniel : ${saved}.\nPour importer : envoie une image avec la légende .bestbot photo ou réponds à une image avec .bestbot photo.\nPour une référence URL : .bestbot photo https://…\nPour supprimer : .bestbot photo remove`);
                }
                memory.setDanielPhotoUrl(rest);
                return reply('URL HTTPS enregistrée dans le profil privé de Daniel. Le fichier image n’est pas téléchargé ni publié par le bot.');
            }
            case 'sticker': {
                const stickerMatch = rest.match(/^(\S+)(?:\s+([\s\S]*))?$/);
                const action = (stickerMatch?.[1] || '').toLowerCase();
                const value = (stickerMatch?.[2] || '').trim();
                if (action === 'list') {
                    const status = stickers.getCatalogStatus();
                    const counts = Object.entries(status.counts).filter(([, count]) => count).map(([category, count]) => `${category}: ${count}`).join('\n');
                    const listed = stickers.loadCatalog().items.slice(-40);
                    const ids = listed.map(item => `${item.category} — ${item.id}`).join('\n');
                    return reply(`Bibliothèque locale : ${status.total} sticker(s)\n${counts || 'Aucun sticker importé.'}${ids ? `\n\nIdentifiants récents :\n${ids}` : ''}`);
                }
                if (action === 'add') {
                    if (!ownerAccount || !isOwner) return reply('Seul le propriétaire peut importer des stickers dans la bibliothèque partagée.');
                    const category = value.split(/\s+/)[0];
                    const imported = await stickers.importQuotedSticker(message, category);
                    return reply(`Sticker importé dans la catégorie « ${imported.category} » (id ${imported.id}). Il provient du sticker cité; aucun sticker privé du téléphone n’est supposé accessible automatiquement.`);
                }
                if (action === 'remove') {
                    if (!ownerAccount || !isOwner) return reply('Seul le propriétaire peut retirer un sticker de la bibliothèque partagée.');
                    return reply(stickers.removeSticker(value) ? 'Sticker supprimé de la bibliothèque.' : 'Identifiant de sticker introuvable.');
                }
                return reply('Utilise : .bestbot sticker add <catégorie> en répondant à un sticker, .bestbot sticker list, ou .bestbot sticker remove <id>.');
            }
            case 'stickers': {
                if (!ownerAccount || !isOwner) return reply('La configuration des réactions automatiques aux stickers est réservée au propriétaire.');
                const config = stickers.getConfig();
                const status = stickers.getCatalogStatus();
                const [action, rawValue] = rest.split(/\s+/, 2);
                const value = (rawValue || '').trim();
                if (!action || action === 'status') {
                    return reply(`Réactions automatiques : ${config.enabled ? 'activées' : 'désactivées'}\nBibliothèque : ${status.total} sticker(s) importé(s)\nDélai global : ${config.cooldownMinutes} min\nMaximum : ${config.dailyMax}/jour`);
                }
                if (['on', 'off'].includes(action)) {
                    const updated = stickers.configure({ enabled: action === 'on' });
                    return reply(`Réactions automatiques ${updated.enabled ? 'activées' : 'désactivées'}.${updated.enabled && !status.total ? ' Importe d’abord des stickers avec .bestbot sticker add <catégorie>.' : ''}`);
                }
                if (['delay', 'cooldown'].includes(action) && /^\d+$/.test(value)) {
                    const updated = stickers.configure({ cooldownMinutes: Number(value) });
                    return reply(`Délai global entre deux stickers : ${updated.cooldownMinutes} minute(s).`);
                }
                if (['max', 'dailymax'].includes(action) && /^\d+$/.test(value)) {
                    const updated = stickers.configure({ dailyMax: Number(value) });
                    return reply(`Limite globale : ${updated.dailyMax} sticker(s) par jour.`);
                }
                return reply('Utilise : .bestbot stickers on|off|status, delay <minutes>, max <nombre>.');
            }
            default:
                return reply(memoryHelp());
        }
    } catch (error) {
        console.error('[bestbot] commande échouée:', error.message);
        return reply(error instanceof TypeError ? `Impossible de traiter la demande : ${error.message}.` : 'Impossible de traiter la demande pour le moment.');
    }
}

module.exports = { handleBestBotCommand, isOwnerAccount, memoryHelp };
