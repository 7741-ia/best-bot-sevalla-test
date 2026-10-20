const VIBES = [
    'Ta prochaine bonne idee merite mieux que le dossier brouillons.',
    'Petit rappel: tu as deja traverse des journees plus compliquees que celle-ci.',
    'Aujourd’hui, avance a ton rythme. Meme un petit pas compte.',
    'Ton energie du jour: calme, concentree et impossible a distraire.',
    'Une bonne surprise peut commencer par un simple salut.',
    'Prends une pause, bois un peu d’eau, puis reviens avec ton meilleur plan.'
];

module.exports = async function vibeCommand(sock, chatId, message) {
    const seed = `${Date.now()}-${message?.key?.id || ''}`;
    let hash = 0;
    for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const vibe = VIBES[hash % VIBES.length];
    await sock.sendMessage(chatId, { text: `Vibe du moment: ${vibe}` }, { quoted: message });
};
