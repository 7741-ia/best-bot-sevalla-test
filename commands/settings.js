const fs = require('fs');

function readJsonSafe(path, fallback) {
    try {
        const txt = fs.readFileSync(path, 'utf8');
        return JSON.parse(txt);
    } catch (_) {
        return fallback;
    }
}

const isOwnerOrSudo = require('../lib/isOwner');

async function settingsCommand(sock, chatId, message) {
    try {
        const senderId = require('../lib/jidUtils').getSender(message);
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { text: 'Seul le propriétaire du bot peut utiliser cette commande !' }, { quoted: message });
            return;
        }

        const isGroup = chatId.endsWith('@g.us');
        const dataDir = './data';

        const mode = readJsonSafe(`${dataDir}/messageCount.json`, { isPublic: false });
        const autoStatus = readJsonSafe(`${dataDir}/autoStatus.json`, { enabled: false, reactOn: false, stickerOn: false });
        const autoread = readJsonSafe(`${dataDir}/autoread.json`, { enabled: false });
        const autotyping = readJsonSafe(`${dataDir}/autotyping.json`, { enabled: false });
        const pmblocker = readJsonSafe(`${dataDir}/pmblocker.json`, { enabled: false });
        const anticall = readJsonSafe(`${dataDir}/anticall.json`, { enabled: false });
        const userGroupData = readJsonSafe(`${dataDir}/userGroupData.json`, {
            antilink: {},
            antimedia: {},
            antibadword: {},
            antispam: {},
            groupHours: {},
            welcome: {},
            goodbye: {},
            chatbot: {},
            antitag: {},
            antistatus: {},
            antiviewonce: {},
            chatbotDm: { enabled: false },
            chatbotStyle: { learn: true }
        });

        const groupId = isGroup ? chatId : null;
        const autoReaction = Boolean(userGroupData.autoReaction) || Boolean(userGroupData.autoReaction?.[groupId]?.enabled);

        const antilinkOn = groupId ? Boolean(userGroupData.antilink && userGroupData.antilink[groupId]) : false;
        const antibadwordOn = groupId ? Boolean(userGroupData.antibadword && userGroupData.antibadword[groupId]) : false;
        const antimediaCfg = groupId ? (userGroupData.antimedia && userGroupData.antimedia[groupId]) : null;
        const antispamCfg = groupId ? (userGroupData.antispam && userGroupData.antispam[groupId]) : null;
        const groupHoursCfg = groupId ? (userGroupData.groupHours && userGroupData.groupHours[groupId]) : null;
        const welcomeOn = groupId ? Boolean(userGroupData.welcome && userGroupData.welcome[groupId]) : false;
        const goodbyeOn = groupId ? Boolean(userGroupData.goodbye && userGroupData.goodbye[groupId]) : false;
        const chatbotOn = groupId ? Boolean(userGroupData.chatbot && userGroupData.chatbot[groupId]) : false;
        const antitagCfg = groupId ? (userGroupData.antitag && userGroupData.antitag[groupId]) : null;
        const antistatusCfg = groupId ? (userGroupData.antistatus && userGroupData.antistatus[groupId]) : null;
        const antiviewonceCfg = groupId ? (userGroupData.antiviewonce && userGroupData.antiviewonce[groupId]) : null;

        const lines = [];
        lines.push('*BOT SETTINGS*');
        lines.push('');
        lines.push(`- Mode: ${mode.isPublic ? 'Public' : 'Private'}`);
        lines.push(`- Auto Status: ${autoStatus.enabled ? 'ON' : 'OFF'}`);
        lines.push(`- Status React: ${autoStatus.reactOn ? 'ON' : 'OFF'}`);
        lines.push(`- Status Sticker: ${autoStatus.stickerOn ? 'ON' : 'OFF'}`);
        lines.push(`- Autoread: ${autoread.enabled ? 'ON' : 'OFF'}`);
        lines.push(`- Autotyping: ${autotyping.enabled ? 'ON' : 'OFF'}`);
        lines.push(`- PM Blocker: ${pmblocker.enabled ? 'ON' : 'OFF'}`);
        lines.push(`- Anticall: ${anticall.enabled ? 'ON' : 'OFF'}`);
        lines.push(`- Auto Reaction: ${autoReaction ? 'ON' : 'OFF'}`);
        lines.push(`- Chatbot DM: ${userGroupData.chatbotDm?.enabled ? 'ON' : 'OFF'}`);
        lines.push(`- Chatbot Learning: ${userGroupData.chatbotStyle?.learn === false ? 'OFF' : 'ON'}`);

        if (groupId) {
            lines.push('');
            lines.push(`Group: ${groupId}`);

            if (antilinkOn) {
                const al = userGroupData.antilink[groupId];
                lines.push(`- Antilink: ON (action: ${al.action || 'delete'})`);
            } else {
                lines.push('- Antilink: OFF');
            }

            if (antibadwordOn) {
                const ab = userGroupData.antibadword[groupId];
                lines.push(`- Antibadword: ON (action: ${ab.action || 'delete'})`);
            } else {
                lines.push('- Antibadword: OFF');
            }

            if (antimediaCfg && antimediaCfg.enabled) {
                lines.push(`- Antimedia: ON (action: ${antimediaCfg.action || 'delete'})`);
            } else {
                lines.push('- Antimedia: OFF');
            }

            if (antispamCfg && antispamCfg.enabled) {
                lines.push(`- Antispam: ON (action: ${antispamCfg.action || 'delete'}, limit: ${antispamCfg.limit || 4}, window: ${antispamCfg.windowSeconds || 8}s, repeat: ${antispamCfg.repeatLimit || 3})`);
            } else {
                lines.push('- Antispam: OFF');
            }

            if (groupHoursCfg && groupHoursCfg.enabled) {
                lines.push(`- Group hours: ON (close: ${groupHoursCfg.closeTime || '--:--'}, open: ${groupHoursCfg.openTime || '--:--'}, warn: ${groupHoursCfg.warningMinutes ?? 5}m, tz: ${groupHoursCfg.timezone || 'Africa/Lubumbashi'})`);
            } else {
                lines.push('- Group hours: OFF');
            }

            lines.push(`- Welcome: ${welcomeOn ? 'ON' : 'OFF'}`);
            lines.push(`- Goodbye: ${goodbyeOn ? 'ON' : 'OFF'}`);
            lines.push(`- Chatbot: ${chatbotOn ? 'ON' : 'OFF'}`);

            if (antitagCfg && antitagCfg.enabled) {
                lines.push(`- Antitag: ON (action: ${antitagCfg.action || 'delete'})`);
            } else {
                lines.push('- Antitag: OFF');
            }

            if (antistatusCfg && antistatusCfg.enabled) {
                lines.push(`- Antistatus: ON (action: ${antistatusCfg.action || 'delete'})`);
            } else {
                lines.push('- Antistatus: OFF');
            }
            lines.push(`- Antiviewonce: ${antiviewonceCfg?.enabled ? 'ON' : 'OFF'}`);
        } else {
            lines.push('');
            lines.push('Note: Per-group settings will be shown when used inside a group.');
        }

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Impossible de lire les paramètres.' }, { quoted: message });
    }
}

module.exports = settingsCommand;
