const axios = require('axios');
const { toFrench } = require('../lib/french');

module.exports = async function (sock, chatId) {
    try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            await sock.sendMessage(chatId, { text: '❌ Configure la variable NEWS_API_KEY pour activer les actualités.' });
            return;
        }
        const country = process.env.NEWS_COUNTRY || 'fr';
        const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=${country}&apiKey=${apiKey}`);
        const articles = response.data.articles.slice(0, 5);
        if (!articles.length) throw new Error('Aucun article');
        let newsMessage = '📰 *Dernières actualités* :\n\n';
        for (const [index, article] of articles.entries()) {
            const title = await toFrench(article.title || '');
            const description = await toFrench(article.description || '');
            newsMessage += `${index + 1}. *${title}*\n${description}\n\n`;
        }
        await sock.sendMessage(chatId, { text: newsMessage.trim() });
    } catch (error) {
        console.error('Error fetching news:', error);
        await sock.sendMessage(chatId, { text: '❌ Désolé, impossible de récupérer les actualités pour le moment.' });
    }
};
