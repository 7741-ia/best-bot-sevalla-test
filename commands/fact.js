const axios = require('axios');
const { toFrench } = require('../lib/french');

module.exports = async function (sock, chatId, message) {
    try {
        const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
        const fact = await toFrench(response.data.text);
        await sock.sendMessage(chatId, { text: `🧠 *Le saviez-vous ?*\n\n${fact}` }, { quoted: message });
    } catch (error) {
        console.error('Error fetching fact:', error);
        await sock.sendMessage(chatId, { text: '❌ Désolé, impossible de récupérer un fait pour le moment.' }, { quoted: message });
    }
};
