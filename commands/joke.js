const axios = require('axios');
const { toFrench } = require('../lib/french');

module.exports = async function (sock, chatId) {
    try {
        // On récupère une blague depuis l'API icanhazdadjoke
        const response = await axios.get('https://icanhazdadjoke.com/', {
            headers: { Accept: 'application/json' }
        });

        const blague = `😄 ${await toFrench(response.data.joke)}`;

        // Envoi de la blague dans le chat
        await sock.sendMessage(chatId, { text: blague });
    } catch (error) {
        console.error('Erreur lors de la récupération de la blague :', error);
        await sock.sendMessage(chatId, { text: 'Désolé, je ne peux pas récupérer de blague pour le moment.' });
    }
};
