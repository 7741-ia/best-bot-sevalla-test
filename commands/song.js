const axios = require('axios');
const yts = require('../lib/lazy')('yt-search');
const fs = require('fs');
const path = require('path');
const { toAudio } = require('../lib/converter');
const { resolveYouTubeAudio } = require('../lib/downloadProviders');

async function songCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: 'Utilisation : .song <titre ou lien YouTube>' }, { quoted: message });
            return;
        }

        let video;
        if (searchQuery.includes('youtube.com') || searchQuery.includes('youtu.be')) {
            video = { url: searchQuery, title: 'YouTube Audio', thumbnail: null, timestamp: '' };
        } else {
            const search = await yts(searchQuery);
            if (!search || !search.videos.length) {
                await sock.sendMessage(chatId, { text: 'Aucun résultat trouvé.' }, { quoted: message });
                return;
            }
            video = search.videos[0];
        }

        await sock.sendMessage(chatId, {
            image: video.thumbnail
                ? { url: video.thumbnail }
                : { url: 'https://i.ytimg.com/vi/hwJLJdBTIKU/hqdefault.jpg' },
            caption: `🎵 Téléchargement : *${video.title}*\n⏱ Durée : ${video.timestamp || 'Inconnue'}`
        }, { quoted: message });

        const audioData = await resolveYouTubeAudio(video.url);
        const audioResponse = await axios.get(audioData.url, {
            responseType: 'arraybuffer',
            timeout: 90000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: (s) => s >= 200 && s < 400,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
            }
        });

        const audioBuffer = Buffer.from(audioResponse.data);
        if (!audioBuffer.length) {
            throw new Error('Downloaded audio buffer is empty');
        }

        const firstBytes = audioBuffer.slice(0, 12);
        const asciiSignature = firstBytes.toString('ascii', 4, 8);
        let inputExt = 'mp3';

        if (asciiSignature === 'ftyp') {
            inputExt = 'm4a';
        } else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
            inputExt = 'ogg';
        } else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
            inputExt = 'wav';
        }

        let finalBuffer = audioBuffer;
        if (inputExt !== 'mp3') {
            finalBuffer = await toAudio(audioBuffer, inputExt);
        }

        await sock.sendMessage(chatId, {
            audio: finalBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${(audioData.title || video.title || 'song')}.mp3`,
            ptt: false
        }, { quoted: message });

        try {
            const tempDir = path.join(__dirname, '../temp');
            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);
                const now = Date.now();
                files.forEach((file) => {
                    const filePath = path.join(tempDir, file);
                    try {
                        const stats = fs.statSync(filePath);
                        if (now - stats.mtimeMs > 10000 && (file.endsWith('.mp3') || file.endsWith('.m4a') || /^\d+\.(mp3|m4a)$/.test(file))) {
                            fs.unlinkSync(filePath);
                        }
                    } catch {}
                });
            }
        } catch {}
    } catch (err) {
        console.error('Song command error:', err);
        await sock.sendMessage(chatId, { text: '❌ Impossible de télécharger la chanson.' }, { quoted: message });
    }
}

module.exports = songCommand;
