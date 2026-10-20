const yts = require('../lib/lazy')('yt-search');
const { resolveYouTubeAudio } = require('../lib/downloadProviders');

async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            return await sock.sendMessage(chatId, { 
                text: "Quelle chanson veux-tu télécharger ?"
            });
        }

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "Aucune chanson trouvée !"
            });
        }

        // Send loading message
        await sock.sendMessage(chatId, {
            text: '_Patiente, ton téléchargement est en cours_'
        }, { quoted: message });

        // Get the first video result
        const video = videos[0];
        const audioData = await resolveYouTubeAudio(video.url);

        // Send the audio
        await sock.sendMessage(chatId, {
            audio: { url: audioData.url },
            mimetype: "audio/mpeg",
            fileName: `${(audioData.title || video.title || 'song').replace(/[\\/:*?"<>|]/g, '')}.mp3`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in play command:', error);
        await sock.sendMessage(chatId, { 
            text: "Échec du téléchargement. Réessaie plus tard."
        });
    }
}

module.exports = playCommand; 

/*Powered by KNIGHT-BOT*
*Credits to Keith MD*`*/
