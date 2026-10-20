// commands/poll.js
// Sondage moderne pour groupes WhatsApp
// Usage :
//   .poll Question | Option1 | Option2 | Option3
//   .sondage Question | Option1 | Option2
// Compatible Baileys (pollMessage natif)

async function pollCommand(sock, chatId, message, text) {
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
        return sock.sendMessage(chatId, {
            text: '📊 Les sondages fonctionnent uniquement dans les groupes.'
        }, { quoted: message });
    }

    const raw = String(text || '').trim();
    if (!raw) {
        return sock.sendMessage(chatId, {
            text: `📊 *Sondage moderne*

Utilise :
*.poll Question | Option1 | Option2 | Option3*

Exemples :
• .poll Quelle est la meilleure pizza ? | Margherita | Pepperoni | 4 fromages
• .sondage On fait quoi ce soir ? | Ciné | Jeux | Chill

Tu peux mettre 2 à 12 options.
Le sondage est natif WhatsApp (tout le monde peut voter).`
        }, { quoted: message });
    }

    // Support | ou - comme séparateur
    let parts = raw.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) {
        parts = raw.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
    }

    if (parts.length < 2) {
        return sock.sendMessage(chatId, {
            text: '❌ Format incorrect.\nExemple : *.poll Question | Option1 | Option2*'
        }, { quoted: message });
    }

    const name = parts[0].slice(0, 255);
    const values = parts.slice(1).map(v => v.slice(0, 100)).filter(Boolean).slice(0, 12);

    if (values.length < 2) {
        return sock.sendMessage(chatId, {
            text: '❌ Il faut au moins 2 options.'
        }, { quoted: message });
    }

    try {
        await sock.sendMessage(chatId, {
            poll: {
                name,
                values,
                selectableCount: 1
            }
        }, { quoted: message });
    } catch (err) {
        console.error('[poll] error:', err.message);
        // Fallback texte si poll natif échoue
        const list = values.map((v, i) => `${i + 1}. ${v}`).join('\n');
        await sock.sendMessage(chatId, {
            text: `📊 *Sondage*\n\n*${name}*\n\n${list}\n\nRéagis avec le numéro de ton choix 👆`
        }, { quoted: message });
    }
}

module.exports = pollCommand;
