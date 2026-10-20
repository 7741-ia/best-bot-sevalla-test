const { requestDigixImage } = require('../lib/digixApi');

function enhancePrompt(prompt) {
    const qualityEnhancers = [
        'high quality',
        'detailed',
        'masterpiece',
        'best quality',
        'ultra realistic',
        '4k',
        'highly detailed',
        'professional photography',
        'cinematic lighting',
        'sharp focus'
    ];

    const numEnhancers = Math.floor(Math.random() * 2) + 3;
    const selectedEnhancers = qualityEnhancers
        .sort(() => Math.random() - 0.5)
        .slice(0, numEnhancers);

    return `${prompt}, ${selectedEnhancers.join(', ')}`;
}

async function imagineCommand(sock, chatId, message) {
    try {
        const prompt = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            '';

        const imagePrompt = prompt.slice(8).trim();

        if (!imagePrompt) {
            await sock.sendMessage(chatId, {
                text: 'Merci d’indiquer une description pour générer l’image.\nExemple : .imagine un beau coucher de soleil sur les montagnes'
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: 'Génération de ton image en cours… Patiente un instant.'
        }, { quoted: message });

        const enhancedPrompt = enhancePrompt(imagePrompt);
        const { buffer } = await requestDigixImage('/ia/imagine', {
            prompt: enhancedPrompt,
            width: 1024,
            height: 1024,
            model: 'flux'
        }, {
            timeout: 60000
        });

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `Generated image for prompt: "${imagePrompt}"`
        }, { quoted: message });
    } catch (error) {
        console.error('Error in imagine command:', error);
        await sock.sendMessage(chatId, {
            text: 'Impossible de générer l’image. Réessaie plus tard.'
        }, { quoted: message });
    }
}

module.exports = imagineCommand;
