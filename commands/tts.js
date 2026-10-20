const gTTS = require('../lib/lazy')('gtts');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const knight = require('../lib/knightbotApi');

// Voix disponibles (alias -> code langue gTTS)
// gTTS supporte les langues; on expose des "voix" nommées pour faciliter le choix.
const VOICES = {
    // Français
    fr: { lang: 'fr', label: 'Français (France)' },
    'fr-ca': { lang: 'fr', label: 'Français (Canada)' },
    // Anglais
    en: { lang: 'en', label: 'Anglais (US)' },
    'en-uk': { lang: 'en-uk', label: 'Anglais (UK)' },
    'en-au': { lang: 'en-au', label: 'Anglais (Australie)' },
    // Autres
    es: { lang: 'es', label: 'Espagnol' },
    it: { lang: 'it', label: 'Italien' },
    de: { lang: 'de', label: 'Allemand' },
    pt: { lang: 'pt', label: 'Portugais' },
    ar: { lang: 'ar', label: 'Arabe' },
    hi: { lang: 'hi', label: 'Hindi' },
    ja: { lang: 'ja', label: 'Japonais' },
    ko: { lang: 'ko', label: 'Coréen' },
    zh: { lang: 'zh-cn', label: 'Chinois' },
    ru: { lang: 'ru', label: 'Russe' },
    tr: { lang: 'tr', label: 'Turc' },
    nl: { lang: 'nl', label: 'Néerlandais' },
    sw: { lang: 'sw', label: 'Swahili' },
};

const HELP =
`🎙️ *Best Bot TTS*

Usage: .tts [--voice=<voix>] [--speed=<0.5-2>] [--format=mp3|ogg] <texte>

Exemples:
• .tts Bonjour tout le monde
• .tts --voice=en-uk Hello mate
• .tts --voice=fr --speed=1.3 Salut c'est rapide
• .tts --format=ogg --voice=es Hola amigos   (note vocale)

Alias rétrocompatible: .tts fr Bonjour

Voix disponibles: ${Object.keys(VOICES).join(', ')}
.tts voices  → liste détaillée`;

function parseArgs(raw) {
    const opts = { voice: 'fr', speed: 1.0, format: 'mp3' };
    const tokens = raw.split(/\s+/);
    const textParts = [];
    for (const tok of tokens) {
        if (!tok) continue;
        const m = tok.match(/^--(voice|lang|speed|format)=(.+)$/i);
        if (m) {
            const key = m[1].toLowerCase();
            const val = m[2];
            if (key === 'voice' || key === 'lang') opts.voice = val.toLowerCase();
            else if (key === 'speed') {
                const s = parseFloat(val);
                if (!isNaN(s)) opts.speed = Math.max(0.5, Math.min(2.0, s));
            } else if (key === 'format') {
                const f = val.toLowerCase();
                if (f === 'mp3' || f === 'ogg') opts.format = f;
            }
        } else if (textParts.length === 0 && VOICES[tok.toLowerCase()]) {
            // rétrocompat: .tts fr Bonjour
            opts.voice = tok.toLowerCase();
        } else {
            textParts.push(tok);
        }
    }
    opts.text = textParts.join(' ').trim();
    return opts;
}

function processAudio(inputPath, outputPath, speed, format) {
    return new Promise((resolve, reject) => {
        let cmd = ffmpeg(inputPath);
        // atempo est limité à [0.5, 2.0]; on borne déjà, donc un seul filtre suffit
        if (Math.abs(speed - 1.0) > 0.001) {
            cmd = cmd.audioFilters(`atempo=${speed}`);
        }
        if (format === 'ogg') {
            cmd = cmd.audioCodec('libopus').format('ogg').audioBitrate('64k').audioChannels(1);
        } else {
            cmd = cmd.audioCodec('libmp3lame').format('mp3').audioBitrate('128k');
        }
        cmd.on('end', () => resolve(outputPath))
           .on('error', reject)
           .save(outputPath);
    });
}

async function ttsCommand(sock, chatId, rawText, message) {
    const raw = (rawText || '').trim();

    if (!raw || raw === 'help' || raw === '--help') {
        await sock.sendMessage(chatId, { text: HELP }, { quoted: message });
        return;
    }
    if (raw === 'voices' || raw === '--voices') {
        const list = Object.entries(VOICES)
            .map(([k, v]) => `• *${k}* — ${v.label}`)
            .join('\n');
        await sock.sendMessage(chatId, { text: `🎙️ *Voix disponibles*\n\n${list}` }, { quoted: message });
        return;
    }

    const { text, voice, speed, format } = parseArgs(raw);
    if (!text) {
        await sock.sendMessage(chatId, { text: 'Merci de fournir le texte à convertir en audio.\n\n' + HELP }, { quoted: message });
        return;
    }
    const v = VOICES[voice];
    if (!v) {
        await sock.sendMessage(chatId, { text: `❌ Voix inconnue: *${voice}*.\nUtilise \`.tts voices\` pour la liste.` }, { quoted: message });
        return;
    }

    const assetsDir = path.join(__dirname, '..', 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    const stamp = Date.now();
    const rawPath = path.join(assetsDir, `tts-raw-${stamp}.mp3`);
    const outPath = path.join(assetsDir, `tts-${stamp}.${format}`);

    try {
        try {
            if (format === 'ogg') throw new Error('format ogg demandé : utiliser le fallback local');
            const remote = await knight.tts(text, v.lang);
            await sock.sendMessage(chatId, {
                audio: { url: remote.url },
                mimetype: 'audio/mpeg',
                ptt: false
            }, { quoted: message });
            return;
        } catch (remoteError) {
            console.warn('[TTS] KnightBot indisponible, fallback local:', remoteError.message);
        }

        const gtts = new gTTS(text, v.lang);
        await new Promise((resolve, reject) => {
            gtts.save(rawPath, (err) => (err ? reject(err) : resolve()));
        });

        await processAudio(rawPath, outPath, speed, format);

        const isPtt = format === 'ogg';
        await sock.sendMessage(chatId, {
            audio: { url: outPath },
            mimetype: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
            ptt: isPtt,
        }, { quoted: message });
    } catch (e) {
        console.error('TTS error:', e);
        await sock.sendMessage(chatId, { text: '❌ Erreur lors de la génération de l’audio TTS.\n' + (e.message || '') }, { quoted: message });
    } finally {
        for (const p of [rawPath, outPath]) {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
        }
    }
}

module.exports = ttsCommand;
