// .insul / .insult <niveau 1-9> [@user]  — du plus drôle (1) au plus piquant (9).
// Règle : on tape sur le comportement / les habitudes, jamais sur l'origine, la religion,
// le physique, un handicap, la famille ou le deuil.

const LEVELS = {
    1: { label: 'Rigolo 😄', lines: [
        'Ton téléphone a plus de batterie que toi de motivation aujourd\'hui.',
        'Tu es la preuve qu\'on peut oublier pourquoi on est entré dans une pièce, même par message.',
        'Ton sens de l\'orientation ferait hésiter un GPS.',
        'Tu avances à la vitesse d\'une mise à jour bloquée à 99 %.',
        'Même ton réveil a abandonné l\'idée de te réveiller.',
        'Tu fais des « je réponds dans 5 minutes » qui durent des saisons.',
        'Tu es tellement lent(e) que les escargots te klaxonnent.',
    ] },
    2: { label: 'Taquin 😏', lines: [
        'Tu as tellement d\'onglets ouverts que même ton navigateur cherche le sujet.',
        'Ton plan est si discret qu\'il attend encore son propre plan.',
        'Tu lis les messages, tu réfléchis, tu oublies de répondre… et tu recommences.',
        'Tu promets « j\'arrive » comme d\'autres promettent de commencer le sport lundi.',
        'Ton fuseau horaire, c\'est « un jour peut-être ».',
        'Tu es le genre à arriver en retard à ton propre rendez-vous.',
        'Ta mémoire est comme ton Wi-Fi : elle coupe au pire moment.',
    ] },
    3: { label: 'Moqueur 😜', lines: [
        'Tu parles beaucoup pour quelqu\'un qui n\'a pas encore trouvé la sortie de sa propre phrase.',
        'Ton niveau d\'organisation fait pleurer un agenda vide.',
        'Tu es la mise à jour que personne n\'a demandée.',
        'Quand tu as une idée géniale, c\'est que quelqu\'un d\'autre l\'a déjà eue.',
        'Tu donnes des conseils comme un GPS en panne : avec beaucoup de confiance et aucune direction.',
        'Tes excuses sont tellement créatives qu\'elles mériteraient un prix.',
        'Tu lances des débats que tu perds tout seul.',
    ] },
    4: { label: 'Sarcastique 🙃', lines: [
        'Bravo, tu as réussi à rendre l\'évidence compliquée. Quel talent !',
        'Tu es toujours là pour les moments importants… juste après qu\'ils sont passés.',
        'Ton avis est comme un manuel d\'instructions : personne ne le lit, mais tu insistes.',
        'Chapeau, tu es le seul à avoir transformé « j\'ai une minute » en conférence de 2 heures.',
        'Ton enthousiasme est contagieux… comme un rhume, personne n\'en veut.',
        'Tu as un don : poser la question dont la réponse vient d\'être donnée.',
        'Quand tu dis « fais-moi confiance », tout le groupe regarde où sont les sorties.',
    ] },
    5: { label: 'Vexant 😤', lines: [
        'Si la médiocrité avait un ambassadeur, tu aurais déjà le badge et le discours.',
        'Tu as l\'énergie d\'un lundi et la ponctualité d\'un colis perdu.',
        'On dirait que tu cherches l\'attention, mais même elle ne te trouve pas.',
        'Tu confonds « avoir raison » et « parler plus fort ».',
        'Ton talent principal, c\'est d\'avoir un avis sur tout sans jamais t\'être renseigné(e).',
        'Tes promesses valent moins qu\'un coupon expiré.',
        'Tu fais beaucoup de bruit pour un résultat aussi discret.',
    ] },
    6: { label: 'Piquant 🌶️', lines: [
        'Tu es le genre de personne qu\'on invite par politesse et qu\'on oublie par soulagement.',
        'Ton charisme est tellement discret qu\'il demande un visa pour apparaître.',
        'Tu donnes des leçons que tu n\'as jamais suivies, et ça se voit.',
        'Tu es un(e) expert(e) pour transformer un petit problème en drame collectif.',
        'On t\'a demandé ton avis ? Non. Tu l\'as donné quand même, comme toujours.',
        'Tu aimes tellement avoir le dernier mot que tu le perds à chaque fois.',
        'Même tes excuses ont besoin d\'excuses.',
    ] },
    7: { label: 'Très piquant 🔥', lines: [
        'Ta présence dans une conversation, c\'est comme un spoiler : personne n\'en voulait et ça gâche tout.',
        'Tu n\'es pas le problème du groupe… tu en es juste la meilleure démonstration.',
        'Tu es la preuve vivante que la confiance en soi n\'a aucun lien avec les résultats.',
        'Tu as le don de ruiner une bonne ambiance avec une régularité quasi professionnelle.',
        'Tu es toujours « occupé(e) » quand il faut aider, et disponible pour juger.',
        'Si l\'inutilité était un sport, tu serais déjà sponsorisé(e).',
        'On sent que tu essaies d\'être intéressant(e). Continue, on aime les efforts désespérés.',
    ] },
    8: { label: 'Hyper piquant 💥', lines: [
        'Honnêtement, ton plus grand exploit est d\'avoir réussi à être aussi prétentieux(se) avec aussi peu de résultats.',
        'Tu es tellement doué(e) pour t\'écouter parler que tu n\'as jamais remarqué que personne d\'autre ne le fait.',
        'Ton absence dans un groupe améliorerait la qualité de la conversation de 40 %. Les gens ont vérifié.',
        'Tu apportes à chaque discussion exactement ce que le silence apporte déjà, en plus fatigant.',
        'Ton ego a besoin de son propre fuseau horaire, tellement il occupe de place pour rien.',
        'Tu crois être mystérieux(se) alors que tu es juste évité(e) poliment.',
        'Les gens ne t\'ignorent pas par méchanceté, ils font juste une économie d\'énergie.',
    ] },
    9: { label: 'Extrême 💀 (stress maximum)', lines: [
        'À ce stade, ce n\'est plus une insulte, c\'est un constat : tu es la raison pour laquelle on a inventé le bouton « quitter la conversation ».',
        'Tu es tellement épuisant(e) que même ta propre ombre demande régulièrement une pause loin de toi.',
        'Chaque fois que tu ouvres la bouche, le groupe se met d\'accord sans un mot : « on fait semblant de ne pas avoir vu ».',
        'Tu es le brouillon raté du « bonne personne » : plein de ratures, de fautes, et personne n\'ose le relire.',
        'Ton niveau de contribution au groupe est comparable à celui d\'un message supprimé : on sait que quelque chose a existé et on est soulagé que ça ait disparu.',
        'Tu as tellement tiré sur la corde de la patience des gens qu\'ils ont fini par la couper pour avoir la paix.',
        'Même les notifications t\'évitent : elles préfèrent aller vers quelqu\'un qui mérite d\'être prévenu.',
    ] },
};

const HELP = [
    '*😈 INSULTES PAR NIVEAU (1 → 9)*',
    ...Object.entries(LEVELS).map(([n, l]) => `${n} — ${l.label}`),
    '',
    'Usage : *.insult <niveau> @user* (ou en répondant à un message)',
    'Exemple : .insult 4 @Best',
    'Sans niveau : niveau 2 par défaut.',
    '_Pour rire entre amis — les niveaux 8 et 9 sont très piquants, à utiliser avec précaution._',
].join('\n');

function getText(message) {
    const m = message?.message || {};
    return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
}

function parseLevel(text) {
    const args = text.split(/\s+/).slice(1);
    for (const a of args) {
        if (/^[1-9]$/.test(a)) return Number(a);
    }
    return null;
}

async function insulCommand(sock, chatId, message) {
    const text = getText(message);
    if (/^\S+\s+(help|aide|niveaux?|list|liste)\b/i.test(text)) {
        await sock.sendMessage(chatId, { text: HELP }, { quoted: message });
        return;
    }

    const level = parseLevel(text) || 2;
    const { label, lines } = LEVELS[level];
    const line = lines[Math.floor(Math.random() * lines.length)];

    const context = message?.message?.extendedTextMessage?.contextInfo || {};
    const mentioned = Array.isArray(context.mentionedJid) ? context.mentionedJid[0] : null;
    const repliedTo = context.participant && context.participant !== sock.user?.id ? context.participant : null;
    const target = mentioned || repliedTo;

    if (!target) {
        await sock.sendMessage(chatId, { text: `*Auto-roast · Niveau ${level} — ${label}*\n${line}` }, { quoted: message });
        return;
    }

    await sock.sendMessage(chatId, {
        text: `*Niveau ${level} — ${label}*\n@${target.split('@')[0]}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`,
        mentions: [target],
    }, { quoted: message });
}

module.exports = insulCommand;
