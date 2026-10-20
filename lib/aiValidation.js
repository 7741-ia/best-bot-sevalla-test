// lib/aiValidation.js
// Filtre strict des réponses inutilisables (Invalid Request, JSON, texte Digix "mélangé").

const BAD_PATTERNS = [
    /^["'\s]*invalid\s*request["'\s]*$/i,
    /^["'\s]*bad\s*request["'\s]*$/i,
    /^["'\s]*invalid\s*(api\s*)?key["'\s]*$/i,
    /^["'\s]*unauthorized["'\s]*$/i,
    /^["'\s]*forbidden["'\s]*$/i,
    /^["'\s]*not\s*found["'\s]*$/i,
    /^["'\s]*error["'\s]*$/i,
    /^["'\s]*(internal\s*)?server\s*error["'\s]*$/i,
    /^["'\s]*too\s*many\s*requests["'\s]*$/i,
    /^["'\s]*rate\s*limit(ed)?["'\s]*$/i,
    /^["'\s]*service\s*unavailable["'\s]*$/i,
    /^["'\s]*(request\s*)?time[d\s-]*out["'\s]*$/i,
    /^["'\s]*null["'\s]*$/i,
    /^["'\s]*undefined["'\s]*$/i,
    /^["'\s]*none["'\s]*$/i,
    /^["'\s]*n\/a["'\s]*$/i,
    /^\s*$/
];

function looksLikeRawJsonError(text) {
    const t = String(text || '').trim();
    if (!(t.startsWith('{') || t.startsWith('['))) return false;
    try {
        const parsed = JSON.parse(t);
        if (parsed && typeof parsed === 'object') {
            if (parsed.error || parsed.erreur || parsed.succes === false || parsed.success === false) return true;
            return true;
        }
    } catch {
        return true;
    }
    return false;
}

/**
 * Détecte le texte "mélangé" typique de Digix webcopilot :
 * mots français collés, fragments répétés, mélange de phrases incomplètes.
 * Ex: "Salut 👋 ! Je suis là... Il Sal Les n Salut su'yutjets a ! qui pas"
 */
function looksLikeGarbledText(text) {
    const t = String(text || '').trim();
    if (!t || t.length < 40) return false;

    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 12) return false;

    // Beaucoup de très courts tokens = fragmentation
    const shortCount = words.filter((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length <= 2).length;
    const shortRatio = shortCount / words.length;
    if (shortRatio > 0.38) return true;

    // Mots collés type "aujourd'huiDeSal" ou "quoiCommentut"
    const glued = (t.match(/[a-zàâäéèêëïîôùûüç][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/g) || []).length;
    if (glued >= 4) return true;

    // Répétitions anormales de "Salut", "aujourd", "spéc", etc.
    const lower = t.toLowerCase();
    const markers = ['salut', 'aujourd', 'spéc', 'besoin', 'question', 'dis-moi', 'comment'];
    let heavyRepeat = 0;
    for (const m of markers) {
        const re = new RegExp(m, 'gi');
        const count = (lower.match(re) || []).length;
        if (count >= 4) heavyRepeat += 1;
    }
    if (heavyRepeat >= 2) return true;

    // Phrases qui se contredisent / fragments typiques Digix
    if (/il\s+sal\s+les|su'yutjets|n\s+és'yol|dequy|ojeui\s+suis|nimeinformations/i.test(t)) return true;
    if (/\b(non\s*m|le\s+de\s+l|j\s*d\s*mais|u0001f)/i.test(t)) return true;

    // Trop de ponctuation cassée ou apostrophes bizarres
    const weirdApos = (t.match(/[a-z]'[a-z]{1,2}\b/gi) || []).length;
    if (weirdApos >= 5 && shortRatio > 0.25) return true;

    return false;
}

function isBadProviderReply(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return true;
    if (t.length < 2) return true;
    if (BAD_PATTERNS.some((re) => re.test(t))) return true;
    if (looksLikeRawJsonError(t)) return true;
    if (/^(invalid|bad)\s+request\b/i.test(t) && t.length < 60) return true;
    if (/^error\s*[:\-]/i.test(t) && t.length < 80) return true;
    if (/request failed with status code|status code \d{3}|même l.?ia veut plus te parler|\bdégage\b/i.test(t)) return true;
    if (/je ne suis pas disponible.*je te réponds dès que possible/i.test(t)) return true;
    // Texte Digix mélangé = inutilisable
    if (looksLikeGarbledText(text)) return true;
    return false;
}

function truncatePromptForGet(prompt, max = 1400) {
    const t = String(prompt || '').trim();
    if (t.length <= max) return t;
    const marker = '\n...[contexte raccourci]...\n';
    const available = Math.max(20, max - marker.length);
    const head = Math.ceil(available * 0.42);
    const tail = available - head;
    return `${t.slice(0, head)}${marker}${t.slice(-tail)}`;
}

function assertGoodReply(text, providerName = 'provider') {
    if (isBadProviderReply(text)) {
        throw new Error(`${providerName} returned an unusable reply`);
    }
    return String(text).trim();
}

module.exports = {
    isBadProviderReply,
    assertGoodReply,
    truncatePromptForGet,
    looksLikeRawJsonError,
    looksLikeGarbledText
};
