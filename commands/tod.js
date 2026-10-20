// commands/tod.js
// Truth or Dare (Action ou Vérité) + Would You Rather
// .tod          → random Truth ou Dare
// .tod truth    → Vérité
// .tod dare     → Action
// .wyr          → Would You Rather

const truths = [
    "Quel est le secret le plus embarrassant que tu aies jamais gardé ?",
    "Qui est la dernière personne que tu as stalkée sur les réseaux ?",
    "As-tu déjà menti à un ami proche ? Pourquoi ?",
    "Quel est ton plus gros regret ?",
    "Si tu pouvais effacer un souvenir, lequel serait-ce ?",
    "Qui dans ce groupe te fait le plus rire ?",
    "As-tu déjà eu un crush sur quelqu’un du groupe ?",
    "Quel est le message le plus gênant que tu aies envoyé par erreur ?",
    "Si tu gagnais 1 million d’euros demain, que ferais-tu en premier ?",
    "Quelle est ta plus grande peur irrationnelle ?",
    "As-tu déjà triché à un examen ou un jeu ?",
    "Quel est le compliment le plus bizarre que tu aies reçu ?",
    "Si tu devais changer de prénom, lequel choisirais-tu ?",
    "Quelle est la chose la plus folle que tu aies faite par amour ?",
    "Qui te connaît le mieux dans ce groupe ?"
];

const dares = [
    "Envoie un vocal de 10 secondes en chantant une chanson au hasard.",
    "Change ta photo de profil pendant 10 minutes (ou dis pourquoi tu ne peux pas).",
    "Écris un compliment sincère à la personne qui t’a tagué.",
    "Envoie un emoji au hasard à 3 personnes du groupe en MP.",
    "Invente une blague nulle et envoie-la maintenant.",
    "Fais un message vocal en imitant quelqu’un du groupe.",
    "Dis ton plus grand rêve en 15 secondes (vocal).",
    "Écris une phrase romantique ridicule et envoie-la.",
    "Choisis quelqu’un et dis-lui 3 qualités.",
    "Envoie un sticker bizarre que tu as.",
    "Fais une déclaration d’amour (fausse) à un membre du groupe.",
    "Raconte une anecdote embarrassante en 20 secondes.",
    "Change ton status WhatsApp pendant 5 minutes avec quelque chose de drôle.",
    "Tague 2 personnes et dis pourquoi elles sont cool.",
    "Envoie un message motivant à tout le groupe."
];

const wyr = [
    ["Avoir la capacité de voler", "Être invisible"],
    ["Ne plus jamais manger de chocolat", "Ne plus jamais écouter de musique"],
    ["Voyager dans le passé", "Voyager dans le futur"],
    ["Être le plus intelligent du monde", "Être le plus riche du monde"],
    ["Vivre sans téléphone", "Vivre sans internet"],
    ["Toujours dire la vérité", "Toujours mentir"],
    ["Avoir 10 meilleurs amis", "Avoir 1 âme sœur parfaite"],
    ["Savoir danser parfaitement", "Savoir chanter parfaitement"],
    ["Ne plus jamais dormir", "Ne plus jamais manger"],
    ["Être célèbre mais malheureux", "Être anonyme mais très heureux"],
    ["Parler toutes les langues", "Maîtriser tous les instruments de musique"],
    ["Vivre dans un monde sans réseaux sociaux", "Vivre dans un monde sans télévision"],
    ["Avoir un super-pouvoir mais ne pouvoir l’utiliser qu’une fois par an", "Avoir un petit pouvoir utilisable tous les jours"],
    ["Être bloqué dans un ascenseur avec ton ex", "Être bloqué avec ton crush"],
    ["Perdre tous tes souvenirs d’enfance", "Ne plus jamais pouvoir créer de nouveaux souvenirs"]
];

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function todCommand(sock, chatId, message, text, senderId) {
    const args = String(text || '').trim().toLowerCase();
    let type = 'random';
    if (args.startsWith('truth') || args.startsWith('verite') || args.startsWith('vérité') || args === 'v') type = 'truth';
    else if (args.startsWith('dare') || args.startsWith('action') || args === 'a' || args === 'd') type = 'dare';

    if (type === 'random') type = Math.random() < 0.5 ? 'truth' : 'dare';

    if (type === 'truth') {
        const t = pick(truths);
        return sock.sendMessage(chatId, {
            text: `🎤 *VÉRITÉ* pour @${senderId.split('@')[0]}\n\n${t}\n\nRéponds honnêtement 👀`,
            mentions: [senderId]
        }, { quoted: message });
    }

    const d = pick(dares);
    return sock.sendMessage(chatId, {
        text: `🔥 *ACTION* pour @${senderId.split('@')[0]}\n\n${d}\n\nTu as 2 minutes ⏱️`,
        mentions: [senderId]
    }, { quoted: message });
}

async function wyrCommand(sock, chatId, message) {
    const [a, b] = pick(wyr);
    return sock.sendMessage(chatId, {
        text: `🤔 *Tu préfères…*\n\n🅰️ ${a}\n\nou\n\n🅱️ ${b}\n\nRéagis avec 🅰️ ou 🅱️ !`
    }, { quoted: message });
}

module.exports = todCommand;
module.exports.wyrCommand = wyrCommand;
