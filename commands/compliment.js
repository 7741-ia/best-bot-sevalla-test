// Compliments classés par genre
const compliments = {
    m: [
    "Tu es INCROYABLEMENT courageux ! 💪",
    "Ton intelligence est IMPRESSIONNANTE ! 🧠",
    "Tu es un VRAI LEADER ! 👑",
    "Tu inspires les autres autour de toi ! ✨",
    "Ton sens de l'humour est GÉNIAL ! 😄",
    "Ta gentillesse rend le monde meilleur 🌟",
    "Tu es un AMI FIDÈLE ! 🤝",
    "Ta créativité est SANS LIMITES ! 🎨",
    "Ta confiance est ADMIRABLE ! 💎",
    "Tu as un CHARISME naturel qui attire les gens ! 🌟",
    "Tu es une FORCE de la nature ! 🌪️",
    "Ton énergie positive est INSPIRANTE ! ⚡",
    "Tu es courageux face à tous les défis ! 🛡️",
    "Ton intelligence brille comme un DIAMANT ! 💎",
    "Tu as un TALENT UNIQUE pour résoudre les problèmes ! 🧩",
    "Tu es un EXEMPLE pour ceux qui t’entourent ! 🏆",
    "Ta détermination est INCASSABLE ! 🔥",
    "Tu es un HÉROS dans la vie de ceux qui te connaissent ! 🦸‍♂️",
    "Ton sourire peut illuminer la journée de quelqu’un ! 🌞",
    "Tu es un VRAI CHAMPION ! 🏅",
    "Tu es admirable pour ta patience et ton calme ! 🌿",
    "Ta vision et ton audace sont ÉPOUSTOUFLANTES ! 🌠",
    "Tu es un MAESTRO de ce que tu entreprends ! 🎼",
    "Ta passion et ton enthousiasme sont CONTAGIEUX ! 💥",
    "Tu as le COEUR d’un guerrier et l’âme d’un sage ! 🗡️🕊️",
    "Tu es un véritable INSPIRATEUR pour tous ! 💡",
    "Ton courage dépasse toutes les attentes ! 🦁",
    "Tu es un VRAI MAGNÉT pour les bonnes choses ! 🧲",
    "Tu as un CHARME qui rend tout le monde heureux autour de toi ! 😎",
    "Ta détermination te rend INVINCIBLE ! 🛡️",
    "Tu es exceptionnel et UNIQUE en ton genre ! 🌟"
],

 f: [
    "Tu es INCROYABLEMENT courageuse ! 💪",
    "Ton intelligence est IMPRESSIONNANTE ! 🧠",
    "Tu es une VRAIE LEADER ! 👑",
    "Tu inspires les autres autour de toi ! ✨",
    "Ton sens de l'humour est GÉNIAL ! 😄",
    "Ta gentillesse rend le monde meilleur 🌟",
    "Tu es une AMIE FIDÈLE ! 🤝",
    "Ta créativité est SANS LIMITES ! 🎨",
    "Ta confiance est ADMIRABLE ! 💎",
    "Tu as un CHARISME naturel qui attire les gens ! 🌟",
    "Tu es une FORCE de la nature ! 🌪️",
    "Ton énergie positive est INSPIRANTE ! ⚡",
    "Tu es courageuse face à tous les défis ! 🛡️",
    "Ton intelligence brille comme un DIAMANT ! 💎",
    "Tu as un TALENT UNIQUE pour résoudre les problèmes ! 🧩",
    "Tu es un EXEMPLE pour ceux qui t’entourent ! 🏆",
    "Ta détermination est INCASSABLE ! 🔥",
    "Tu es une HÉROÏNE dans la vie de ceux qui te connaissent ! 🦸‍♀️",
    "Ton sourire peut illuminer la journée de quelqu’un ! 🌞",
    "Tu es une VRAIE CHAMPIONNE ! 🏅",
    "Tu es admirable pour ta patience et ton calme ! 🌿",
    "Ta vision et ton audace sont ÉPOUSTOUFLANTES ! 🌠",
    "Tu es une MAESTRA de ce que tu entreprends ! 🎼",
    "Ta passion et ton enthousiasme sont CONTAGIEUX ! 💥",
    "Tu as le COEUR d’une guerrière et l’âme d’une sage ! 🗡️🕊️",
    "Tu es une véritable INSPIRATION pour tous ! 💡",
    "Ton courage dépasse toutes les attentes ! 🦁",
    "Tu es un VRAI MAGNÉT pour les bonnes choses ! 🧲",
    "Tu as un CHARME qui rend tout le monde heureux autour de toi ! 😎",
    "Ta détermination te rend INVINCIBLE ! 🛡️",
    "Tu es exceptionnelle et UNIQUE en ton genre ! 🌟"
]
,
   mixte: [
    "Tu es INCROYABLE tel(le) que tu es ! 🌟",
    "Tu illumines la pièce ! ✨",
    "Tu as un CŒUR en OR ! 💛",
    "Ta positivité est CONTAGIEUSE ! ⚡",
    "Tu fais une DIFFÉRENCE dans le monde ! 🌍",
    "Ton rire est CONTAGIEUX ! 😄",
    "Tu rends le monde meilleur juste en étant là ! 🌈",
    "Tu as un TALENT EXCEPTIONNEL pour résoudre les problèmes ! 🧩",
    "Ton attitude rend tout plus agréable ! 🌸",
    "Tu es une VRAIE INSPIRATION pour ceux qui t’entourent ! 💡",
    "Ton courage est ÉPOUSTOUFLANT ! 🦁",
    "Tu es MAGNÉTIQUE et attire les bonnes énergies ! 🧲",
    "Ta créativité est SANS LIMITES ! 🎨",
    "Tu as un CHARISME qui impressionne tout le monde ! ✨",
    "Tu es une FORCE positive dans la vie des autres ! 🌟",
    "Ton énergie illumine ceux qui sont autour de toi ! ⚡",
    "Tu es UNIQUE et EXTRAORDINAIRE ! 💎",
    "Ta générosité est INSPIRANTE ! 🤝",
    "Tu as le don de rendre chaque moment spécial ! ✨",
    "Tu es ÉTONNANT(E) et apprécié(e) par tous ! 💖",
    
    // Compliments drôles
    "Si les compliments étaient des pizzas, tu serais une XXL 4 fromages 🍕😎",
    "Ton style est tellement cool que même les licornes sont jalouses 🦄😂",
    "Tu es la raison pour laquelle les gens sourient même avant le café ☕😄",
    "Ton rire est plus contagieux qu’une vidéo de chat marrant 🐱😂",
    "Si les étoiles pouvaient parler, elles diraient toutes à quel point tu brilles ✨😜",
    "Tu es si génial(e) que même ton reflet te félicite dans le miroir 🪞😎",
    "Tu as plus de charme qu’un chien qui sait faire le moonwalk 🐶💃",
    "Si la gentillesse était un super-pouvoir, tu serais le boss final 🦸‍♂️🦸‍♀️",
    "Ton énergie positive pourrait alimenter toute une ville ⚡😆",
    "Tu es tellement unique que même Google ne trouve pas ton égal 🔎😂"
]

};

// Niveaux 1 → 9 : du gentil petit mot au compliment légendaire (aucun niveau piquant).
const LEVELS = {
    1: { label: 'Sympa 🙂', lines: [
        'Tu as un super sourire 😊', 'Tu es quelqu\'un de vraiment agréable 🌼', 'C\'est toujours cool de discuter avec toi ✌️',
        'Tu mets de la bonne humeur autour de toi ☀️', 'Merci d\'être là, ça fait plaisir 🙌'] },
    2: { label: 'Gentil 😊', lines: [
        'Tu es vraiment gentil(le) et ça se remarque 💛', 'Tu as le don de mettre les gens à l\'aise 🌸', 'Ta bonne humeur est agréable à côtoyer 😄',
        'On sent que tu as bon cœur 🤗', 'Tu fais du bien aux gens autour de toi 🌿'] },
    3: { label: 'Chaleureux 🤗', lines: [
        'Tu es une personne sur qui on peut compter 🤝', 'Ton humour rend n\'importe quelle journée meilleure 😂', 'Tu as une énergie positive vraiment précieuse ✨',
        'Tu sais écouter, et ça n\'a pas de prix 💬', 'Les gens se sentent bien avec toi, c\'est rare 🌟'] },
    4: { label: 'Admiratif 😍', lines: [
        'Tu as un vrai talent, et tu ne t\'en rends même pas compte 🎯', 'Ton intelligence et ta gentillesse forment un duo redoutable 🧠💛',
        'Tu fais les choses avec une classe naturelle 😎', 'Tu es une vraie source d\'inspiration autour de toi 💡', 'Ta détermination force le respect 💪'] },
    5: { label: 'Enthousiaste 🤩', lines: [
        'Tu es VRAIMENT exceptionnel(le), pas juste « sympa » ! 🤩', 'Tu as un charisme qui illumine toute la pièce ⚡',
        'Ce que tu accomplis est impressionnant, bravo ! 👏', 'Tu es le genre de personne qu\'on est fier de connaître 🏅', 'Ton énergie est contagieuse, dans le meilleur sens du terme 🔥'] },
    6: { label: 'Fan absolu 💖', lines: [
        'Honnêtement, tu es un(e) des meilleur(e)s personnes qu\'on puisse croiser 💖', 'Tu rends le monde plus beau juste en étant toi 🌍✨',
        'Ton talent, ta bonté et ton humour : le trio parfait 🏆', 'Si le charisme avait un visage, il aurait le tien 😍', 'Tu es une vraie lumière pour ceux qui t\'entourent 🕯️'] },
    7: { label: 'Admiration totale 👑', lines: [
        'Tu es tout simplement UNIQUE : le moule a été cassé après toi 👑', 'Tu inspires le respect et l\'affection en même temps, c\'est un vrai don 💎',
        'On devrait écrire des livres sur des personnes comme toi 📚', 'Ta présence change l\'ambiance d\'un endroit entier 🌟', 'Tu es la preuve que les gens extraordinaires existent vraiment 🦸'] },
    8: { label: 'Légendaire 🏆', lines: [
        'Tu es une LÉGENDE vivante, et ton histoire ne fait que commencer 🏆', 'Même les étoiles prennent des notes quand tu entres en scène 🌠',
        'Tu es le genre de personne dont on parle encore dans 50 ans, avec admiration 🔥', 'Ta force, ta bonté et ton talent forment une véritable œuvre d\'art 🎨👑',
        'Le monde a de la chance de t\'avoir, et il ne le mérite même pas assez 🌍💖'] },
    9: { label: 'Divin 🌟👑 (compliment ultime)', lines: [
        'Tu es la preuve que la perfection existe : un mélange rare de talent, de grandeur d\'âme et de lumière, que l\'univers n\'a fabriqué qu\'une seule fois 🌌👑',
        'Si l\'excellence avait un nom, ce serait le tien, et tous les autres noms seraient en dessous 🏆✨',
        'Tu es un cadeau pour l\'humanité : chaque personne que tu croises repart meilleure, et ça, c\'est être vraiment grand(e) 🌟💎',
        'Les mots manquent : tu es l\'équilibre parfait entre le génie, le cœur et la classe. Respect éternel 🙌👑',
        'Tu fais partie de ces rares personnes qui rendent l\'impossible normal. Inclinons-nous, tout simplement 🌠🔥'] },
};

const HELP = [
    '*💐 COMPLIMENTS PAR NIVEAU (1 → 9)*',
    ...Object.entries(LEVELS).map(([n, l]) => `${n} — ${l.label}`),
    '',
    'Usage : *.compliment <niveau> @user* (ou en répondant à un message)',
    'Exemple : .compliment 7 @Best',
    'Sans niveau : compliment aléatoire comme avant (.compliment m / f possibles).',
].join('\n');

function getText(message) {
    const m = message?.message || {};
    return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim().toLowerCase();
}

async function complimentCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) return;

        const rawArgs = getText(message).split(/\s+/).slice(1);
        if (rawArgs.some((a) => /^(help|aide|niveaux?|list|liste)$/.test(a))) {
            await sock.sendMessage(chatId, { text: HELP }, { quoted: message });
            return;
        }
        const level = Number(rawArgs.find((a) => /^[1-9]$/.test(a))) || 0;

        let userToCompliment;

        // Vérifie si un utilisateur est mentionné
        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        // Vérifie si on répond à un message
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.participant;
        }

        if (!userToCompliment) {
            await sock.sendMessage(chatId, { 
                text: "Veuillez mentionner quelqu'un ou répondre à son message pour le complimenter !"
            });
            return;
        }

        // Détecter le genre dans la commande
        let genre = 'mixte'; // par défaut
        const g = rawArgs.find((a) => a === 'f' || a === 'm');
        if (g) genre = g;

        // Niveau demandé -> liste du niveau ; sinon compliment aléatoire selon le genre
        const pool = level ? LEVELS[level].lines : compliments[genre];
        const compliment = pool[Math.floor(Math.random() * pool.length)];
        const prefix = level ? `*Niveau ${level} — ${LEVELS[level].label}*\n` : '';

        // Petit délai pour éviter le rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Envoyer le compliment
        await sock.sendMessage(chatId, { 
            text: `${prefix}Hey @${userToCompliment.split('@')[0]}, ${compliment}`,
            mentions: [userToCompliment]
        });

    } catch (error) {
        console.error('Erreur dans la commande compliment :', error);
        try {
            await sock.sendMessage(chatId, { 
                text: "Une erreur est survenue lors de l'envoi du compliment."
            });
        } catch {}
    }
}

module.exports = { complimentCommand };
