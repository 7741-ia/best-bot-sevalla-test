const { requestDigix } = require('../lib/digixApi');
const { toFrench } = require('../lib/french');

module.exports = async function (sock, chatId, message, city) {
    try {
        if (!city) {
            await sock.sendMessage(chatId, {
                text: '🌤️ Indique le nom d\'une ville.\nExemple : .weather Paris'
            }, { quoted: message });
            return;
        }

        const data = await requestDigix('/search/wther', { city }, { timeout: 30000 });
        const location = data?.ville || city;
        const condition = data?.condition ? await toFrench(data.condition) : 'Inconnue';
        const temperature = data?.temperature || 'N/D';
        const humidity = data?.humidite || 'N/D';
        const wind = data?.vent || 'N/D';

        const weatherText = [
            `🌍 *Météo à ${location}*`,
            `☁️ Conditions : ${condition}`,
            `🌡️ Température : ${temperature}`,
            `💧 Humidité : ${humidity}`,
            `💨 Vent : ${wind}`
        ].join('\n');

        await sock.sendMessage(chatId, { text: weatherText }, { quoted: message });
    } catch (error) {
        console.error('Error fetching weather:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Désolé, impossible de récupérer la météo pour le moment.'
        }, { quoted: message });
    }
};
