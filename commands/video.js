const yts = require('../lib/lazy')('yt-search');
const settings = require('../settings');
const { resolveYouTubeVideo } = require('../lib/downloadProviders');

async function videoCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: 'Quelle vidéo veux-tu télécharger ?' }, { quoted: message });
            return;
        }

        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';

        if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
            videoUrl = searchQuery;
        } else {
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: 'Aucune vidéo trouvée !' }, { quoted: message });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
        if (thumb) {
            await sock.sendMessage(chatId, {
                image: { url: thumb },
                caption: `*${videoTitle || searchQuery}*\nDownloading...`
            }, { quoted: message });
        }

        const urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
        if (!urls) {
            await sock.sendMessage(chatId, { text: 'Ce n’est pas un lien YouTube valide !' }, { quoted: message });
            return;
        }

        const videoData = await resolveYouTubeVideo(videoUrl);

        await sock.sendMessage(chatId, {
            video: { url: videoData.url },
            mimetype: 'video/mp4',
            fileName: `${videoData.title || videoTitle || 'video'}.mp4`,
            caption: `*${videoData.title || videoTitle || 'Video'}*\n\n> *_Telecharge par ${settings.botName || 'BestBot'}_*`
        }, { quoted: message });
    } catch (error) {
        console.error('[VIDEO] Command Error:', error?.message || error);
        await sock.sendMessage(chatId, { text: 'Échec du téléchargement : ' + (error?.message || 'Unknown error') }, { quoted: message });
    }
}

module.exports = videoCommand;
