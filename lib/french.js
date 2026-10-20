// Traduit automatiquement un texte (API anglaise) en français. En cas d'échec, renvoie le texte d'origine.
const { translateText } = require('./translationService');

const cache = new Map();
const FR_WORDS = /\b(le|la|les|des|une|un|est|sont|dans|pour|avec|que|qui|pas|sur|du|et|ou|au|aux|ce|cette|il|elle|nous|vous)\b/gi;
const EN_WORDS = /\b(the|and|of|to|is|are|was|with|for|that|this|in|on|it|as|by|from|have|has|which|their|its)\b/gi;

function looksFrench(text) {
    const fr = (text.match(FR_WORDS) || []).length;
    const en = (text.match(EN_WORDS) || []).length;
    return fr > en;
}

function chunk(text, size = 1200) {
    const parts = [];
    let current = '';
    for (const piece of text.split(/(?<=[.!?\n])\s+/)) {
        if ((current + ' ' + piece).length > size && current) {
            parts.push(current);
            current = piece;
        } else {
            current = current ? `${current} ${piece}` : piece;
        }
    }
    if (current) parts.push(current);
    return parts;
}

async function toFrench(text) {
    const source = String(text ?? '').trim();
    if (source.length < 3 || looksFrench(source)) return source;
    if (cache.has(source)) return cache.get(source);
    try {
        const translated = [];
        for (const part of chunk(source)) {
            const result = await Promise.race([
                translateText(part, 'fr'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
            ]);
            translated.push(result?.translatedText || part);
        }
        const output = translated.join(' ').trim() || source;
        if (cache.size > 200) cache.delete(cache.keys().next().value);
        cache.set(source, output);
        return output;
    } catch (error) {
        return source;
    }
}

module.exports = { toFrench, looksFrench };
