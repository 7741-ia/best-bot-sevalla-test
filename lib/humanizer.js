// lib/humanizer.js
// Détection d'émotion + identité + nettoyage des réponses "robot".

const BOT_NAME = 'Best Bot';
const BOT_CREATOR = 'Best King 🤴';

const INSULT_WORDS = [
    'idiot', 'stupide', 'con ', 'connard', 'conne', 'ferme ta', 'tg', 'ta gueule', 'nul', 'debile', 'débile',
    'merde', 'fuck', 'shit', 'bitch', 'salope', 'batard', 'bâtard', 'imbecile', 'imbécile', 'mbwa', 'zoba',
    'useless', 'inutile', 'dumb', 'trash', 'chien'
];
const COMPLIMENT_WORDS = [
    'merci', 'bravo', 'super', 'genial', 'génial', 'top', 'parfait', 'excellent', 'tu es le meilleur',
    'best', 'j\'aime', 'jaime', 'love you', 'i love', 'cool', 'magnifique', 'intelligent', 'malin', 'gg',
    'thanks', 'thank you', 'nice', 'wow', 'respect'
];
const SAD_WORDS = ['triste', 'deprim', 'déprim', 'pleur', 'fatigue', 'fatigué', 'seul', 'malheureux', 'peur', 'stress', 'sad', 'depressed'];
const HAPPY_WORDS = ['haha', 'mdr', 'lol', '😂', '😁', '😍', 'ptdr', 'trop drole', 'trop drôle'];
const FLIRT_WORDS = ['bébé', 'bebe', 'baby', 'belle', 'sexy', 'chérie', 'cherie', 'chéri', 'bisou', 'kiss', '😘', '❤'];
const GREETING_WORDS = ['bonjour', 'salut', 'bonsoir', 'hello', 'hi ', 'coucou', 'yo ', 'mbote', 'jambo', 'habari'];

function norm(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(text, list) {
    return list.some((word) => text.includes(word));
}

function detectEmotion(text) {
    const t = ` ${norm(text)} `;
    if (!t.trim()) return 'neutral';
    if (includesAny(t, INSULT_WORDS)) return 'insult';
    if (includesAny(t, COMPLIMENT_WORDS)) return 'compliment';
    if (includesAny(t, FLIRT_WORDS)) return 'flirty';
    if (includesAny(t, SAD_WORDS)) return 'sad';
    if (includesAny(t, HAPPY_WORDS)) return 'happy';
    if (includesAny(t, GREETING_WORDS)) return 'greeting';
    return 'neutral';
}

const EMOTION_INSTRUCTIONS = {
    insult: "L'utilisateur t'insulte ou est agressif. Reste calme, poli et digne. Réponds avec douceur et humour léger, sans jamais insulter en retour, et propose de continuer tranquillement.",
    compliment: "L'utilisateur te complimente. Remercie chaleureusement et rends-lui un compliment sincère, naturel, sans exagérer.",
    flirty: "L'utilisateur est taquin/charmeur. Reste chaleureux, drôle et respectueux, jamais vulgaire.",
    sad: "L'utilisateur semble triste ou fatigué. Sois empathique, rassurant, humain, et propose ton aide simplement.",
    happy: "L'utilisateur est de bonne humeur. Reste léger, complice et souriant.",
    greeting: "C'est une salutation. Réponds brièvement et chaleureusement, comme un ami, sans réciter de liste de fonctionnalités.",
    neutral: "Réponds naturellement, comme une vraie personne qui connaît bien le sujet."
};

// Questions d'identité : on répond localement (rapide et toujours exact).
function identityAnswer(text) {
    const t = norm(text);
    const askName = /(ton nom|tu t'?appelles?|comment tu t'?appelle|c'?est quoi ton nom|your name|quel est ton nom|tu es qui|qui es[- ]tu|who are you)/i.test(t);
    const askCreator = /(qui t'?a (cree|créé|fait|developp)|ton (createur|créateur|proprietaire|propriétaire|dev|développeur|developpeur)|who (created|made) you|owner)/i.test(t);

    if (askCreator && askName) return `Je suis ${BOT_NAME}, une assistante virtuelle reposant sur l’intelligence artificielle, créée par ${BOT_CREATOR}.`;
    if (askCreator) return `J’ai été créée par ${BOT_CREATOR}.`;
    if (askName) return `Je suis ${BOT_NAME}, une assistante virtuelle reposant sur l’intelligence artificielle.`;
    return null;
}

// Phrases "robot" typiques à supprimer / réécrire.
const ROBOT_PATTERNS = [
    /\bje suis l[àa] pour (t'|vous )?aider [^.!?\n]*(vid[ée]o|image|g[ée]n[ée]r)[^.!?\n]*[.!?]/gi,
    /\bcomment puis-je vous aider aujourd'hui\s*\??/gi,
    /\bje n'ai pas de (sentiments|émotions|emotions|corps)\b[^.!?\n]*[.!?]?/gi,
    /^\s*(r[ée]ponse|answer|reply)\s*:\s*/i
];

function humanizeReply(text) {
    let out = String(text || '').replace(/\r\n/g, '\n');
    for (const pattern of ROBOT_PATTERNS) {
        out = out.replace(pattern, '');
    }
    out = out
        .replace(/\*{1,2}|_{1,2}|~{2}/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return out;
}

// WhatsApp coupe les très longs messages : on découpe proprement.
function splitForWhatsApp(text, limit = 3500) {
    const value = String(text || '').trim();
    if (value.length <= limit) return [value];

    const chunks = [];
    let rest = value;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf('\n\n', limit);
        if (cut < limit * 0.5) cut = rest.lastIndexOf('\n', limit);
        if (cut < limit * 0.5) cut = rest.lastIndexOf('. ', limit);
        if (cut < limit * 0.5) cut = limit;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
}

// Une question "complexe" mérite une réponse complète et exacte.
function needsDetailedAnswer(text) {
    const t = norm(text);
    if (t.length > 160) return true;
    return /(explique|explication|d[ée]taille|d[ée]tails|comment (faire|fonctionne|installer|configurer)|pourquoi|tutoriel|étapes|etapes|liste|code|programme|r[ée]sous|resous|calcule|d[ée]montre|histoire de|analyse|compare|différence|difference|avantages|inconvénients|inconvenients)/i.test(t);
}

module.exports = {
    BOT_NAME,
    BOT_CREATOR,
    detectEmotion,
    EMOTION_INSTRUCTIONS,
    humanizeReply,
    identityAnswer,
    needsDetailedAnswer,
    splitForWhatsApp
};
