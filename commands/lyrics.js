const { requestDigix } = require('../lib/digixApi');
const knight = require('../lib/knightbotApi');

async function commandeParoles(sock, chatId, titreChanson, message) {
    if (!titreChanson) {
        await sock.sendMessage(chatId, {
            text: 'Indique le titre d’une chanson.\nUtilisation : .lyrics <titre de la chanson>'
        }, { quoted: message });
        return;
    }

    try {
        let paroles = '';
        let titre = titreChanson;
        let artiste = '';
        try {
            const data = await knight.lyrics(titreChanson);
            paroles = data.lyrics;
            titre = data.title || titre;
            artiste = data.artist || '';
        } catch {
            const data = await requestDigix('/search/lyricsv2', { title: titreChanson }, { timeout: 30000 });
            paroles = data?.paroles || data?.lyrics || data?.result || data?.message || '';
        }
        if (!paroles) {
            await sock.sendMessage(chatId, {
                text: `Désolé, je n’ai pas trouvé les paroles de « ${titreChanson} ».`
            }, { quoted: message });
            return;
        }

        const maxChars = 4096;
        const output = String(paroles).length > maxChars
            ? String(paroles).slice(0, maxChars - 3) + '...'
            : String(paroles);

        const header = titre && titre !== titreChanson ? `🎵 *${titre}${artiste ? ` — ${artiste}` : ''}*\n\n` : '';
        await sock.sendMessage(chatId, { text: header + output }, { quoted: message });
    } catch (error) {
        console.error('Error in lyrics command:', error);
        await sock.sendMessage(chatId, {
            text: `Erreur lors de la récupération des paroles de "${titreChanson}".`
        }, { quoted: message });
    }
}

module.exports = { commandeParoles, lyricsCommand: commandeParoles };
