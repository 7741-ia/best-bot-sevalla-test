// lib/ensureData.js
// Crée le dossier data/ et tous les fichiers JSON essentiels
// s'ils n'existent pas encore (évite les ENOENT sur Katabump / panels vides).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');

const DEFAULTS = {
    'owner.json': [],
    'antidelete.json': { enabled: false },
    'statusArchive.json': { entries: [] },
    'banned.json': [],
    'warnings.json': {},
    'premium.json': [],
    'messageCount.json': { isPublic: false },
    'userGroupData.json': {
        chatbot: {},
        chatbotDm: { enabled: true, offlineOnly: false },
        chatbotStyle: {
            learn: false,
            personaMessage: '',
            offlineMessage: 'Réponds normalement comme un humain expert dans tous les domaines.',
            intelligence: 'balanced',
            memory: true,
            humor: 'medium',
            maxLength: 3500,
            samples: [],
            learnedReplies: [],
            ownerLastSeenAt: 0
        }
    },
    'mention.json': { enabled: false },
    'anticall.json': { enabled: false },
    'autoread.json': { enabled: false },
    'autotyping.json': { enabled: false },
    'autoStatus.json': {
        enabled: true,
        reactOn: true,
        stickerOn: false,
        reactionEmojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎']
    },
    'scheduledMessages.json': []
};

function ensureDataFiles() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log('[ensureData] dossier data/ créé');
        }

        // Aussi créer tmp/ pour les médias temporaires
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        for (const [filename, fallback] of Object.entries(DEFAULTS)) {
            const filePath = path.join(DATA_DIR, filename);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
                console.log(`[ensureData] créé ${filename}`);
            }
        }
    } catch (error) {
        console.error('[ensureData] erreur:', error.message);
    }
}

module.exports = { ensureDataFiles, DATA_DIR };
