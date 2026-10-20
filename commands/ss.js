const fetch = require('node-fetch');
const knight = require('../lib/knightbotApi');

async function handleSsCommand(sock, chatId, message, match) {
    if (!match) {
        await sock.sendMessage(chatId, {
            text: `*SCREENSHOT TOOL*\n\n*.ss <url>*\n*.ssweb <url>*\n*.screenshot <url>*\n\nTake a screenshot of any website\n\nExemple :\n.ss https://google.com\n.ssweb https://google.com\n.screenshot https://google.com`,
            quoted: message
        });
        return;
    }

    try {
        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        // Extract URL from command
        const url = match.trim();
        
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return sock.sendMessage(chatId, {
                text: '❌ Indique un lien valide commençant par http:// ou https://',
                quoted: message
            });
        }

        try {
            const media = await knight.screenshot(url);
            await sock.sendMessage(chatId, { image: { url: media.url }, caption: `Capture : ${url}` }, { quoted: message });
        } catch (knightError) {
            console.warn('[SS] KnightBot indisponible, fallback:', knightError.message);
            const apiUrl = `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(url)}&theme=light&device=desktop`;
            const response = await fetch(apiUrl, { headers: { 'accept': '*/*' } });
            if (!response.ok) throw new Error(`API responded with status: ${response.status}`);
            await sock.sendMessage(chatId, { image: await response.buffer() }, { quoted: message });
        }

    } catch (error) {
        console.error('❌ Error in ss command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Impossible de faire la capture d’écran. Réessaie dans quelques minutes.\n\nCauses possibles :\n• Lien invalide\n• Le site bloque les captures\n• Le site est hors service\n• Le service est temporairement indisponible',
            quoted: message
        });
    }
}

module.exports = {
    handleSsCommand
}; 
