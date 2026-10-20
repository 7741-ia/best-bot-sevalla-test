// 🧹 Fix for ENOSPC / temp overflow in hosted panels
const fs = require('fs');
const path = require('path');

// Redirect temp storage away from system /tmp
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

// Auto-cleaner (léger) — hostGuard fait le gros du nettoyage
setInterval(() => {
    fs.readdir(customTemp, (err, files) => {
        if (err) return;
        for (const file of files) {
            const filePath = path.join(customTemp, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && Date.now() - stats.mtimeMs > 30 * 60 * 1000) {
                    fs.unlink(filePath, () => { });
                }
            });
        }
    });
}, 30 * 60 * 1000).unref();

const settings = require('./settings');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const yts = require('./lib/lazy')('yt-search');
const { fetchBuffer } = require('./lib/myfunc');
const fetch = require('node-fetch');
const ytdl = require('./lib/lazy')('ytdl-core');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { isSudo } = require('./lib/index');
const isOwnerOrSudo = require('./lib/isOwner');
const { autotypingCommand, isAutotypingEnabled, handleAutotypingForMessage, handleAutotypingForCommand, showTypingAfterCommand } = require('./commands/autotyping');
const { autorecordingCommand, handleAutorecordingForMessage, showRecordingAfterCommand } = require('./commands/autorecording');
const resetChatsCommand = require('./commands/resetchats');
const { imgCommand, apkCommand, tempmailCommand } = require('./commands/mediaExtras');
const broadcastCommand = require('./commands/broadcast');
const { autoreadCommand, isAutoreadEnabled, handleAutoread } = require('./commands/autoread');

// Command imports
const tagAllCommand = require('./commands/tagall');
const helpCommand = require('./commands/help');
const banCommand = require('./commands/ban');
const { promoteCommand } = require('./commands/promote');
const { demoteCommand } = require('./commands/demote');
const muteCommand = require('./commands/mute');
const unmuteCommand = require('./commands/unmute');
const stickerCommand = require('./commands/sticker');
const profilePicCommand = require('./commands/profilepic');
const getStatusCommand = require('./commands/getstatus');
const { calcCommand, toimgCommand, splitCommand, randomCommand, passwordCommand, vcardCommand } = require('./commands/localtools');
const isAdmin = require('./lib/isAdmin');
const warnCommand = require('./commands/warn');
const warningsCommand = require('./commands/warnings');
const ttsCommand = require('./commands/tts');
const { modCommand, mod2Command } = require('./commands/mod');
const { tictactoeCommand, handleTicTacToeMove } = require('./commands/tictactoe');
const pollCommand = require('./commands/poll');
const quizCommand = require('./commands/quiz');
const { checkQuizAnswer } = require('./commands/quiz');
const todCommand = require('./commands/tod');
const { wyrCommand } = require('./commands/tod');
const { incrementMessageCount, topMembers } = require('./commands/topmembers');
const ownerCommand = require('./commands/owner');
const deleteCommand = require('./commands/delete');
const { handleAntilinkCommand, handleLinkDetection } = require('./commands/antilink');
const { handleAntitagCommand, handleTagDetection } = require('./commands/antitag');
const { handleAntimediaCommand, handleMediaDetection } = require('./commands/antimedia');
const { handleAntistatusCommand, handleAntistatusDetection } = require('./commands/antistatus');
const { handleAntistatusTagCommand, handleAntistatusTagDetection } = require('./commands/antistatustag');
const { handleAntiViewOnceCommand, handleAntiViewOnceDetection } = require('./commands/antiviewonce');
const { handleAntispamCommand, handleAntispamDetection } = require('./commands/antispam');
const { handleGroupHoursCommand } = require('./commands/grouphours');
const { handleMentionDetection, mentionToggleCommand, setMentionCommand } = require('./commands/mention');
const memeCommand = require('./commands/meme');
const vibeCommand = require('./commands/vibe');
const insulCommand = require('./commands/insul');
const tagCommand = require('./commands/tag');
const tagNotAdminCommand = require('./commands/tagnotadmin');
const hideTagCommand = require('./commands/hidetag');
const jokeCommand = require('./commands/joke');
const quoteCommand = require('./commands/quote');
const factCommand = require('./commands/fact');
const weatherCommand = require('./commands/weather');
const newsCommand = require('./commands/news');
const kickCommand = require('./commands/kick');
const simageCommand = require('./commands/simage');
const attpCommand = require('./commands/attp');
const { complimentCommand } = require('./commands/compliment');
const { lyricsCommand } = require('./commands/lyrics');
const { clearCommand } = require('./commands/clear');
const pingCommand = require('./commands/ping');
const aliveCommand = require('./commands/alive');
const blurCommand = require('./commands/img-blur');
const { welcomeCommand, handleJoinEvent } = require('./commands/welcome');
const { goodbyeCommand, handleLeaveEvent } = require('./commands/goodbye');
const githubCommand = require('./commands/github');
const { handleAntiBadwordCommand, handleBadwordDetection } = require('./lib/antibadword');
const antibadwordCommand = require('./commands/antibadword');
const { handleChatbotCommand, handleChatbotResponse, updateOwnerLastSeen } = require('./commands/chatbot');
const { handleBestBotCommand } = require('./commands/bestbot');
const { unwrapMessageContent } = require('./lib/waMessage');
const askCommand = require('./commands/ask');
const smartCommand = require('./commands/smart');
const takeCommand = require('./commands/take');
const wastedCommand = require('./commands/wasted');
const shipCommand = require('./commands/ship');
const groupInfoCommand = require('./commands/groupinfo');
const resetlinkCommand = require('./commands/resetlink');
const staffCommand = require('./commands/staff');
const unbanCommand = require('./commands/unban');
const { handlePromotionEvent } = require('./commands/promote');
const { handleDemotionEvent } = require('./commands/demote');
const { viewonceCommand, viewonceSaveToSelfCommand, shouldSaveViewOnceFromEmojiReply } = require('./commands/viewonce');
const { premiumCommand, vipCardCommand } = require('./commands/premium');
const clearSessionCommand = require('./commands/clearsession');
const { autoStatusCommand, handleStatusUpdate } = require('./commands/autostatus');
const stickerTelegramCommand = require('./commands/stickertelegram');
const textmakerCommand = require('./commands/textmaker');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage, statusDownloadCommand } = require('./commands/antidelete');
const { scheduleMessageCommand } = require('./commands/schedulemsg');
const clearTmpCommand = require('./commands/cleartmp');
const setProfilePicture = require('./commands/setpp');
const { setGroupDescription, setGroupName, setGroupPhoto } = require('./commands/groupmanage');
const instagramCommand = require('./commands/instagram');
const facebookCommand = require('./commands/facebook');
const spotifyCommand = require('./commands/spotify');
const playCommand = require('./commands/play');
const tiktokCommand = require('./commands/tiktok');
const songCommand = require('./commands/song');
const { handleMovieCommand } = require('./commands/movies');
const aiCommand = require('./commands/ai');
const digixCommand = require('./commands/digix');
const urlCommand = require('./commands/url');
const { handleTranslateCommand } = require('./commands/translate');
const { handleSsCommand } = require('./commands/ss');
const { socialCommand, qrCommand, knightApiHelp } = require('./commands/knightapi');
const { addCommandReaction, handleAreactCommand } = require('./lib/reactions');
const imagineCommand = require('./commands/imagine');
const videoCommand = require('./commands/video');
const sudoCommand = require('./commands/sudo');
const { miscCommand, handleHeart } = require('./commands/misc');
const stickercropCommand = require('./commands/stickercrop');
const updateCommand = require('./commands/update');
const removebgCommand = require('./commands/removebg');
const { reminiCommand } = require('./commands/remini');
const { igsCommand } = require('./commands/igs');
const { anticallCommand, readState: readAnticallState } = require('./commands/anticall');
const { pmblockerCommand, readState: readPmBlockerState } = require('./commands/pmblocker');
const settingsCommand = require('./commands/settings');
const soraCommand = require('./commands/sora');
const { touchGroupActivity } = require('./lib/groupAmbience');

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A";
global.ytch = "BEST BOT";

// Add this near the top of main.js with other global configuration
const processedStatusKeys = new Map();

function buildStatusProcessKeyFromKey(key) {
    if (!key?.id) return null;
    const participant = key.participant && key.participant !== 'status@broadcast'
        ? key.participant
        : (key.remoteJidAlt && key.remoteJidAlt !== 'status@broadcast'
            ? key.remoteJidAlt
            : (key.remoteJid && key.remoteJid !== 'status@broadcast' ? key.remoteJid : 'unknown'));
    return `${key.remoteJid || 'status'}:${participant}:${key.id}`;
}

function buildStatusProcessKey(status) {
    const msg = status?.messages?.[0];
    const key = msg?.key || status?.key || status?.reaction?.key;
    return buildStatusProcessKeyFromKey(key);
}

function getStatusMessages(status) {
    if (!status || Array.isArray(status)) return [];

    if (Array.isArray(status.messages)) {
        return status.messages.filter((message) => message?.key?.remoteJid === 'status@broadcast');
    }

    if (status?.key?.remoteJid === 'status@broadcast') {
        return [status];
    }

    return [];
}

function markStatusProcessed(processKey) {
    const now = Date.now();
    if (!processKey) return false;
    const existing = processedStatusKeys.get(processKey);
    if (existing && now - existing < 15000) {
        return true;
    }
    processedStatusKeys.set(processKey, now);

    for (const [key, ts] of processedStatusKeys.entries()) {
        if (now - ts > 60000) {
            processedStatusKeys.delete(key);
        }
    }
    return false;
}

async function handleMessages(sock, messageUpdate, printLog) {
    let chatId;
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        // WhatsApp peut livrer plusieurs messages d'un coup (reconnexion, rafale) : on les traite tous,
        // pas seulement le premier (l'anti-doublon plus bas évite les traitements en double).
        if (Array.isArray(messages) && messages.length > 1) {
            await Promise.allSettled(messages.map((m) => handleMessages(sock, { ...messageUpdate, messages: [m] }, printLog)));
            return;
        }

        const message = messages[0];
        if (!message?.message) return;

        // Anti-doublon : un même message ne doit être traité qu'une seule fois (évite les commandes exécutées plusieurs fois)
        if (message.key?.id) {
            const now = Date.now();
            if (!global.__handledMsgIds) global.__handledMsgIds = new Map();
            const seen = global.__handledMsgIds;
            if (seen.size > 500) for (const [id, t] of seen) if (now - t > 10 * 60 * 1000) seen.delete(id);
            const dedupeKey = `${message.key.remoteJid}:${message.key.id}`;
            if (seen.has(dedupeKey)) return;
            seen.set(dedupeKey, now);
        }

        
        let __isBotPaused = false;
        try {
            const guard = require('./lib/hostGuard');
            __isBotPaused = Boolean(guard.isPaused && guard.isPaused());
        } catch {}

        // Handle autoread functionality
        await handleAutoread(sock, message);
        await require('./lib/presenceMode').handleIncoming(sock, message);

        // Store message for antidelete feature
        if (message.message) {
            storeMessage(sock, message);
        }

        // Handle message revocation
        if (message.message?.protocolMessage?.type === 0) {
            await handleMessageRevocation(sock, message);
            return;
        }

        try { global.__botJid = (sock.user?.id || '').replace(/:\d+@/, '@'); require('./lib/jidUtils').learn(message); } catch (e) {}
        chatId = message.key.remoteJid;
        const senderId = require('./lib/jidUtils').getSender(message);
        const isGroup = chatId.endsWith('@g.us');
        if (isGroup) touchGroupActivity(chatId);
        const senderIsSudo = await isSudo(senderId);
        const senderIsOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);

        // Handle button responses
        if (message.message?.buttonsResponseMessage) {
            const buttonId = message.message.buttonsResponseMessage.selectedButtonId;
            const chatId = message.key.remoteJid;

            if (buttonId === 'channel') {
                await sock.sendMessage(chatId, {
                    text: '📢 *Join our Channel:'
                }, { quoted: message });
                return;
            } else if (buttonId === 'owner') {
                const ownerCommand = require('./commands/owner');
                await ownerCommand(sock, chatId);
                return;
            } else if (buttonId === 'support') {
                await sock.sendMessage(chatId, {
                    text: `🔗 *Support`
                }, { quoted: message });
                return;
            }
        }

        // Preserve raw message for commands like .tag that need original casing
        const normalizedMessage = unwrapMessageContent(message.message || {});
        const rawText = normalizedMessage?.conversation?.trim() ||
            normalizedMessage?.extendedTextMessage?.text?.trim() ||
            normalizedMessage?.imageMessage?.caption?.trim() ||
            normalizedMessage?.videoMessage?.caption?.trim() ||
            normalizedMessage?.documentMessage?.caption?.trim() ||
            '';
        const buttonText = message.message?.buttonsResponseMessage?.selectedButtonId?.trim() || '';
        const listSelection = message.message?.listResponseMessage?.singleSelectReply?.selectedRowId?.trim() || '';
        const slashCommand = /^\/(calc|sticker|toimg|split|random|password|vcard)(?=\s|$)/i.test(rawText);
        const commandInput = rawText || buttonText || listSelection;
        const normalizedInput = slashCommand ? `.${commandInput.slice(1)}` : commandInput;
        const userMessage = normalizedInput.toLowerCase().replace(/\.\s+/g, '.').trim();

        if (message.key.fromMe && rawText && !rawText.startsWith('.') && !slashCommand) {
            updateOwnerLastSeen();
        }

        // Only log command usage; never log personal memory/profile arguments.
        if (userMessage.startsWith('.')) {
            const safeCommand = userMessage === '.bestbot' || userMessage.startsWith('.bestbot ')
                ? '.bestbot [arguments masqués]'
                : userMessage;
            console.log(`📝 Command used in ${isGroup ? 'group' : 'private'}: ${safeCommand}`);
        }
        // Read bot mode once; don't early-return so moderation can still run in private mode
        let isPublic = false;
        try {
            const data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof data.isPublic === 'boolean') isPublic = data.isPublic;
        } catch (error) {
            console.error('Error checking access mode:', error);
            // Default to private if the mode file cannot be read.
        }
        const isOwnerOrSudoCheck = message.key.fromMe || senderIsOwnerOrSudo;
        if (userMessage === '.bestbot' || userMessage.startsWith('.bestbot ')) {
            const args = (rawText || userMessage).slice('.bestbot'.length).trim();
            await handleBestBotCommand(sock, chatId, message, args);
            return;
        }
        // Check if user is banned (skip ban check for unban command)
        if (isBanned(senderId) && !userMessage.startsWith('.unban')) {
            // Only respond occasionally to avoid spam
            if (Math.random() < 0.1) {
                await sock.sendMessage(chatId, {
                    text: '❌ Tu es banni de ce bot. Contacte un administrateur pour être débanni.'
                
                });
            }
            return;
        }

        if (isOwnerOrSudoCheck && shouldSaveViewOnceFromEmojiReply(message, rawText)) {
            await viewonceSaveToSelfCommand(sock, chatId, message, { silent: true });
            return;
        }

        // First check if it's a game move
        if (/^[1-9]$/.test(userMessage) || userMessage.toLowerCase() === 'surrender') {
            await handleTicTacToeMove(sock, chatId, senderId, userMessage);
            return;
        }

        // Quiz answer detection (group only)
        if (isGroup && checkQuizAnswer(sock, chatId, message, userMessage, senderId)) {
            return;
        }

        /*  // Basic message response in private chat
          if (!isGroup && (userMessage === 'hi' || userMessage === 'hello' || userMessage === 'bot' || userMessage === 'hlo' || userMessage === 'hey' || userMessage === 'bro')) {
              await sock.sendMessage(chatId, {
                  text: 'Salut, comment puis-je t’aider ?\nUtilise .menu pour voir les commandes.',
                  ...channelInfo
              });
              return;
          } */

        if (!message.key.fromMe) incrementMessageCount(chatId, senderId);

        // Run moderation checks early before command handling
        // Always run moderation in groups, regardless of mode
        if (isGroup) {
            if (await handleAntispamDetection(sock, chatId, message, senderId)) {
                return;
            }

            if (await handleLinkDetection(sock, chatId, message, rawText || userMessage, senderId)) {
                return;
            }

            if (await handleMediaDetection(sock, chatId, message, senderId)) {
                return;
            }

            if (await handleAntiViewOnceDetection(sock, chatId, message)) {
                return;
            }

            // Supprime auto les repartages/mentions de statut dans un groupe
            if (await handleAntistatusTagDetection(sock, chatId, message, senderId)) {
                return;
            }

            if (userMessage) {
                await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
            }
        } else if (chatId === 'status@broadcast') {
            await handleAntistatusDetection(sock, message, senderId);
        }

        // PM blocker: block non-owner DMs when enabled (do not ban)
        if (!isGroup && !message.key.fromMe && !senderIsSudo) {
            try {
                const pmState = readPmBlockerState();
                if (pmState.enabled) {
                    // Inform user, delay, then block without banning globally
                    await sock.sendMessage(chatId, { text: pmState.message || 'Les messages privés sont bloqués. Contacte le propriétaire uniquement dans les groupes.' });
                    await new Promise(r => setTimeout(r, 1500));
                    try { await sock.updateBlockStatus(chatId, 'block'); } catch (e) { }
                    return;
                }
            } catch (e) { }
        }

        // Then check for command prefix
        if (!userMessage.startsWith('.')) {
            // Show typing indicator if autotyping is enabled
            const typingShown = await handleAutotypingForMessage(sock, chatId, userMessage);
            if (!typingShown) await handleAutorecordingForMessage(sock, chatId, userMessage);

            if (isGroup) {
                // Les protections administratives restent actives, mais le bot ne
                // répond jamais aux messages ordinaires, mentions ou infractions aux règles.
                await handleTagDetection(sock, chatId, message, senderId);
            } else if (chatId !== 'status@broadcast' && !chatId.endsWith('@newsletter')) {
                // Auto-download : si l'utilisateur colle un lien TikTok sans commande -> on télécharge
                const _txt = String(rawText || userMessage || '');
                if (/https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i.test(_txt)) {
                    try { await tiktokCommand(sock, chatId, message); } catch (e) { console.error('tiktok auto:', e.message); }
                    return;
                }
                // Route texte ET média (image/audio/vidéo/sticker) vers le chatbot IA
                if (!__isBotPaused) {
                    await handleChatbotResponse(sock, chatId, message, rawText || userMessage, senderId);
                } else {
                    console.log('[chatbot] message privé ignoré : bot en pause maintenance (CPU/RAM trop élevés)');
                }
            }
            return;
        }
        // In private mode, only owner/sudo can run commands
        if (!isPublic && !isOwnerOrSudoCheck) {
            return;
        }

        // List of admin commands
        const adminCommands = ['.mute', '.unmute', '.ban', '.unban', '.promote', '.demote', '.kick', '.tagall', '.tagnotadmin', '.hidetag', '.antilink', '.antimedia', '.antispam', '.heuresgroupe', '.grouphours', '.groupopenclose', '.antitag', '.antistatus', '.antistatustag', '.antitagstatus', '.antiviewonce', '.setgdesc', '.setgname', '.setgpp', '.warnings', '.clear'];
        const isAdminCommand = adminCommands.some(cmd => userMessage.startsWith(cmd));

        // List of owner commands
        const ownerCommands = ['.mode', '.autostatus', '.antidelete', '.statusdl', '.statusview', '.schedulemsg', '.cleartmp', '.setpp', '.clearsession', '.areact', '.autoreact', '.autotyping', '.autorecording', '.resetchats', '.broadcast', '.autoread', '.pmblocker', '.premium'];
        const isOwnerCommand = ownerCommands.some(cmd => userMessage.startsWith(cmd));

        let isSenderAdmin = false;
        let isBotAdmin = false;

        // Check admin status only for admin commands in groups
        if (isGroup && isAdminCommand) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { text: 'Merci de mettre le bot admin pour utiliser les commandes d’administration.' }, { quoted: message });
                return;
            }

            if (
                userMessage.startsWith('.mute') ||
                userMessage === '.unmute' ||
                userMessage.startsWith('.ban') ||
                userMessage.startsWith('.unban') ||
                userMessage.startsWith('.promote') ||
                userMessage.startsWith('.demote')
            ) {
                if (!isSenderAdmin && !message.key.fromMe) {
                    await sock.sendMessage(chatId, {
                        text: 'Désolé, seuls les administrateurs du groupe peuvent utiliser cette commande.'
                    }, { quoted: message });
                    return;
                }
            }
        }

        // Check owner status for owner commands
        if (isOwnerCommand) {
            if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                await sock.sendMessage(chatId, { text: '❌ Cette commande est réservée au propriétaire ou aux sudo.' }, { quoted: message });
                return;
            }
        }

        // Command handlers - Execute commands immediately without waiting for typing indicator
        // We'll show typing indicator after command execution if needed
        let commandExecuted = false;

        switch (true) {
            case userMessage === '.simage': {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMessage?.stickerMessage) {
                    await simageCommand(sock, quotedMessage, chatId);
                } else {
                    await sock.sendMessage(chatId, { text: 'Réponds à un sticker avec la commande .simage pour le convertir.' }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage.startsWith('.kick'):
                const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
                break;
            case userMessage.startsWith('.mute'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const muteArg = parts[1];
                    const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
                    if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
                        await sock.sendMessage(chatId, { text: 'Indique un nombre de minutes valide, ou utilise .mute sans nombre pour mute immédiatement.' }, { quoted: message });
                    } else {
                        await muteCommand(sock, chatId, senderId, message, muteDuration);
                    }
                }
                break;
            case userMessage === '.unmute':
                await unmuteCommand(sock, chatId, senderId);
                break;
            case userMessage.startsWith('.ban'):
                if (!isGroup) {
                    if (!message.key.fromMe && !senderIsSudo) {
                        await sock.sendMessage(chatId, { text: 'Seul le propriétaire ou un sudo peut utiliser .ban en privé.' }, { quoted: message });
                        break;
                    }
                }
                await banCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.unban'):
                if (!isGroup) {
                    if (!message.key.fromMe && !senderIsSudo) {
                        await sock.sendMessage(chatId, { text: 'Seul le propriétaire ou un sudo peut utiliser .unban en privé.' }, { quoted: message });
                        break;
                    }
                }
                await unbanCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.help') || userMessage.startsWith('.menu') || userMessage === '.bot' || userMessage === '.list':
                await helpCommand(sock, chatId, message, commandInput);
                commandExecuted = true;
                break;
            case userMessage === '.sticker' || userMessage === '.s':
                await stickerCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.calc' || userMessage.startsWith('.calc '):
                await calcCommand(sock, chatId, message, rawText);
                commandExecuted = true;
                break;
            case userMessage === '.toimg':
                await toimgCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.split' || userMessage.startsWith('.split '):
                await splitCommand(sock, chatId, message, rawText);
                commandExecuted = true;
                break;
            case userMessage === '.random' || userMessage.startsWith('.random '):
                await randomCommand(sock, chatId, message, rawText);
                commandExecuted = true;
                break;
            case userMessage === '.password' || userMessage.startsWith('.password '):
                await passwordCommand(sock, chatId, message, rawText);
                commandExecuted = true;
                break;
            case userMessage === '.vcard' || userMessage.startsWith('.vcard '):
                await vcardCommand(sock, chatId, message, rawText);
                commandExecuted = true;
                break;
            case userMessage === '.pp' || userMessage === '.profilepic' || userMessage === '.getpp':
                await profilePicCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.save' || userMessage === '.savestatus' || userMessage === '.getstatus' || userMessage === '.status':
                await getStatusCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.warnings' || userMessage.startsWith('.warnings '):
                if ((isGroup && !isSenderAdmin && !isOwnerOrSudoCheck) || (!isGroup && !isOwnerOrSudoCheck)) {
                    await sock.sendMessage(chatId, { text: 'Seuls les administrateurs du groupe ou le propriétaire peuvent consulter les avertissements.' }, { quoted: message });
                    break;
                }
                const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warningsCommand(sock, chatId, mentionedJidListWarnings);
                break;
            case userMessage.startsWith('.warn'):
                const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                break;
            case userMessage.startsWith('.tts'):
                const ttsArg = rawText.replace(/^\.tts\s*/i, '').trim();
                await ttsCommand(sock, chatId, ttsArg, message);
                break;
            case userMessage.startsWith('.maintenance') || userMessage === '.maint': {
                if (!senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, { text: '⛔ Réservé au owner/sudo.' }, { quoted: message });
                    break;
                }
                const guard = require('./lib/hostGuard');
                const arg = userMessage.replace(/^\.(maintenance|maint)\s*/i, '').trim();
                if (arg === 'on') {
                    guard.enterMaintenance('manuel (owner)');
                    await sock.sendMessage(chatId, { text: '🛠️ Maintenance activée manuellement.' }, { quoted: message });
                } else if (arg === 'off') {
                    guard.exitMaintenance();
                    await sock.sendMessage(chatId, { text: '✅ Maintenance désactivée. Reprise immédiate.' }, { quoted: message });
                } else {
                    const s = guard.maintenanceStatus();
                    const txt = s.paused
                        ? `🛠️ *Maintenance ON*\nRaison : ${s.reason}\nDepuis : ${Math.round(s.sinceMs/1000)}s\nRAM : ${s.rssMB}MB · CPU : ${s.cpuPct}%\n\n• .maintenance off — forcer la reprise`
                        : `✅ *Bot actif*\nRAM : ${s.rssMB}MB · CPU : ${s.cpuPct}%\n\n• .maintenance on — pause manuelle\n• .maintenance off — reprise`;
                    await sock.sendMessage(chatId, { text: txt }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage.startsWith('.delete') || userMessage.startsWith('.del'):
                await deleteCommand(sock, chatId, message, senderId);
                break;
            case userMessage.startsWith('.attp'):
                await attpCommand(sock, chatId, message);
                break;

            case userMessage === '.settings':
                await settingsCommand(sock, chatId, message);
                break;
            case userMessage === '.mod':
                await modCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.mod2':
                await mod2Command(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.premium'):
                await premiumCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.vipcard'):
                await vipCardCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.mode'):
                // Check if sender is the owner
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, { text: 'Seul le propriétaire du bot peut utiliser cette commande.' }, { quoted: message });
                    return;
                }
                {
                    const presenceAction = userMessage.split(' ')[1]?.toLowerCase();
                    if (['online', 'offline', 'normal'].includes(presenceAction)) {
                        await require('./lib/presenceMode').handleModeCommand(sock, chatId, message, presenceAction);
                        return;
                    }
                }
                // Read current data first
                let data;
                try {
                    data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
                } catch (error) {
                    console.error('Error reading access mode:', error);
                    await sock.sendMessage(chatId, { text: 'Impossible de lire le statut actuel du mode du bot.' });
                    return;
                }

                const action = userMessage.split(' ')[1]?.toLowerCase();
                // If no argument provided, show current status
                if (!action) {
                    const currentMode = data.isPublic ? 'public' : 'private';
                    await sock.sendMessage(chatId, {
                        text: `Mode actuel du bot : *${currentMode}*\n\nPrésence : *${require('./lib/presenceMode').getMode()}*\n\nUtilisation : .mode public/private\n.mode online - toujours apparaître en ligne\n.mode offline - apparaître hors ligne\n.mode normal - présence normale\n\nExemple :\n.mode public - autoriser tout le monde à utiliser le bot\n.mode private - réserver au propriétaire uniquement`
                        
                    }, { quoted: message });
                    return;
                }

                if (action !== 'public' && action !== 'private') {
                    await sock.sendMessage(chatId, {
                        text: 'Utilisation : .mode public/private\n\nExemple :\n.mode public - autoriser tout le monde à utiliser le bot\n.mode private - réserver au propriétaire uniquement'
                    }, { quoted: message });
                    return;
                }

                try {
                    // Update access mode
                    data.isPublic = action === 'public';

                    // Save updated data
                    fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));

                    await sock.sendMessage(chatId, { text: `Le bot est maintenant en mode *${action}*.` });
                } catch (error) {
                    console.error('Error updating access mode:', error);
                    await sock.sendMessage(chatId, { text: 'Impossible de mettre à jour le mode d’accès du bot.' });
                }
                break;
            case userMessage.startsWith('.anticall'):
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, { text: 'Seul le propriétaire ou un sudo peut utiliser anticall.' }, { quoted: message });
                    break;
                }
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    await anticallCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.pmblocker'):
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    await pmblockerCommand(sock, chatId, message, args);
                }
                commandExecuted = true;
                break;
            case userMessage === '.owner':
                await ownerCommand(sock, chatId);
                break;
            case userMessage === '.tagall':
                await tagAllCommand(sock, chatId, senderId, message);
                break;
            case userMessage === '.tagnotadmin':
                await tagNotAdminCommand(sock, chatId, senderId, message);
                break;
            case userMessage.startsWith('.hidetag'):
                {
                    const messageText = rawText.slice(8).trim();
                    const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                    await hideTagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                }
                break;
            case userMessage.startsWith('.tag'):
                const messageText = rawText.slice(4).trim();  // use rawText here, not userMessage
                const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                await tagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                break;
            case userMessage.startsWith('.antilink'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement être utilisée dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d’abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntilinkCommand(sock, chatId, rawText, senderId, isSenderAdmin, message);
                break;
            case userMessage.startsWith('.antimedia'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement etre utilisee dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d’abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntimediaCommand(sock, chatId, rawText, senderId, isSenderAdmin, message);
                break;
            case userMessage.startsWith('.antispam'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement etre utilisee dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntispamCommand(sock, chatId, rawText, senderId, isSenderAdmin, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.heuresgroupe') ||
                userMessage.startsWith('.grouphours') ||
                userMessage.startsWith('.groupopenclose'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement etre utilisee dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d abord.'
                    }, { quoted: message });
                    return;
                }
                await handleGroupHoursCommand(sock, chatId, rawText, senderId, isSenderAdmin, message);
                commandExecuted = true;
                break;
            case userMessage === '.antitag' || userMessage.startsWith('.antitag '):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement être utilisée dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d’abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;
            case userMessage.startsWith('.antistatustag'):
            case userMessage.startsWith('.antitagstatus'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement être utilisée dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d’abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntistatusTagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.antistatus'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement être utilisée dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d’abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntistatusCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;
            case userMessage.startsWith('.antiviewonce'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Cette commande peut uniquement être utilisée dans un groupe.'
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Merci de mettre le bot administrateur d’abord.'
                    }, { quoted: message });
                    return;
                }
                await handleAntiViewOnceCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;
            case userMessage === '.meme':
                await memeCommand(sock, chatId, message);
                break;
            case userMessage === '.joke':
                await jokeCommand(sock, chatId, message);
                break;
            case userMessage === '.insul' || userMessage.startsWith('.insul ') || userMessage === '.insult' || userMessage.startsWith('.insult '):
                await insulCommand(sock, chatId, message);
                break;
            case userMessage === '.vibe':
                await vibeCommand(sock, chatId, message);
                break;
            case userMessage === '.quote':
                await quoteCommand(sock, chatId, message);
                break;
            case userMessage === '.fact':
                await factCommand(sock, chatId, message, message);
                break;
            case userMessage === '.api' || userMessage.startsWith('.api '):
                await apisCommand(sock, chatId, message, rawText.replace(/^\.api\s*/i, '').trim());
                commandExecuted = true;
                break;
            case userMessage === '.knightapi' || userMessage === '.knightapis':
                await knightApiHelp(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.country' || userMessage.startsWith('.country '):
                await apisCommand(sock, chatId, message, `country ${rawText.replace(/^\.country\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage === '.pokemon' || userMessage.startsWith('.pokemon '):
                await apisCommand(sock, chatId, message, `pokemon ${rawText.replace(/^\.pokemon\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage === '.crypto' || userMessage.startsWith('.crypto '):
                await apisCommand(sock, chatId, message, `crypto ${rawText.replace(/^\.crypto\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage === '.nasa':
                await apisCommand(sock, chatId, message, 'nasa');
                commandExecuted = true;
                break;
            case userMessage === '.recipe' || userMessage.startsWith('.recipe '):
                await apisCommand(sock, chatId, message, `recipe ${rawText.replace(/^\.recipe\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage === '.address' || userMessage.startsWith('.address '):
                await apisCommand(sock, chatId, message, `address ${rawText.replace(/^\.address\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage === '.currency' || userMessage.startsWith('.currency '):
                await apisCommand(sock, chatId, message, `currency ${rawText.replace(/^\.currency\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage === '.short' || userMessage.startsWith('.short '):
                await apisCommand(sock, chatId, message, `short ${rawText.replace(/^\.short\s*/i, '').trim()}`);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.weather'):
                const city = userMessage.slice(9).trim();
                if (city) {
                    await weatherCommand(sock, chatId, message, city);
                } else {
                    await sock.sendMessage(chatId, { text: 'Merci d’indiquer une ville, par exemple : .weather Paris' }, { quoted: message });
                }
                break;
            case userMessage === '.news':
                await newsCommand(sock, chatId);
                break;
            case userMessage.startsWith('.ttt') || userMessage.startsWith('.tictactoe'):
                const tttText = userMessage.split(' ').slice(1).join(' ');
                await tictactoeCommand(sock, chatId, senderId, tttText);
                break;
            case userMessage.startsWith('.poll') || userMessage.startsWith('.sondage'):
                {
                    const pollText = (rawText || userMessage).replace(/^\.(poll|sondage)\s*/i, '').trim();
                    await pollCommand(sock, chatId, message, pollText);
                }
                break;
            case userMessage.startsWith('.quiz'):
                {
                    const quizText = (rawText || userMessage).slice(5).trim();
                    await quizCommand(sock, chatId, message, quizText, senderId);
                }
                break;
            case userMessage.startsWith('.tod') || userMessage.startsWith('.verite') || userMessage.startsWith('.action') || userMessage.startsWith('.truth') || userMessage.startsWith('.dare'):
                {
                    const todText = (rawText || userMessage).replace(/^\.(tod|verite|vérité|action|truth|dare)\s*/i, '').trim();
                    await todCommand(sock, chatId, message, todText, senderId);
                }
                break;
            case userMessage === '.wyr' || userMessage.startsWith('.wyr ') || userMessage === '.plutot' || userMessage === '.plutôt':
                await wyrCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.move'):
                const position = parseInt(userMessage.split(' ')[1]);
                if (isNaN(position)) {
                    await sock.sendMessage(chatId, { text: 'Merci de fournir une position valide pour le coup du morpion.' }, { quoted: message });
                } else {
                    await handleTicTacToeMove(sock, chatId, senderId, String(position));
                }
                break;
            case userMessage === '.topmembers':
                topMembers(sock, chatId, isGroup);
                break;
            case userMessage.startsWith('.compliment'):
                await complimentCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.lyrics'):
                const songTitle = userMessage.split(' ').slice(1).join(' ');
                await lyricsCommand(sock, chatId, songTitle, message);
                break;
            case userMessage === '.clear':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Cette commande ne peut être utilisée que dans un groupe.' }, { quoted: message });
                    break;
                }
                if (!isSenderAdmin && !isOwnerOrSudoCheck) {
                    await sock.sendMessage(chatId, { text: 'Seuls les administrateurs du groupe peuvent utiliser .clear.' }, { quoted: message });
                    break;
                }
                await clearCommand(sock, chatId);
                break;
            case userMessage.startsWith('.promote'):
                const mentionedJidListPromote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await promoteCommand(sock, chatId, mentionedJidListPromote, message);
                break;
            case userMessage.startsWith('.demote'):
                const mentionedJidListDemote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await demoteCommand(sock, chatId, mentionedJidListDemote, message);
                break;
            case userMessage === '.ping':
                await pingCommand(sock, chatId, message);
                break;
            case userMessage === '.alive':
                await aliveCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.mention '):
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    const isOwner = message.key.fromMe || senderIsSudo;
                    await mentionToggleCommand(sock, chatId, message, args, isOwner);
                }
                break;
            case userMessage === '.setmention':
                {
                    const isOwner = message.key.fromMe || senderIsSudo;
                    await setMentionCommand(sock, chatId, message, isOwner);
                }
                break;
            case userMessage.startsWith('.blur'):
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                await blurCommand(sock, chatId, message, quotedMessage);
                break;
            case userMessage.startsWith('.welcome'):
                if (isGroup) {
                    // Check admin status if not already checked
                    if (!isSenderAdmin) {
                        const adminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = adminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || message.key.fromMe) {
                        await welcomeCommand(sock, chatId, message);
                    } else {
                        await sock.sendMessage(chatId, { text: 'Désolé, seuls les administrateurs du groupe peuvent utiliser cette commande.' }, { quoted: message });
                    }
                } else {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe.' }, { quoted: message });
                }
                break;
            case userMessage.startsWith('.goodbye'):
                if (isGroup) {
                    // Check admin status if not already checked
                    if (!isSenderAdmin) {
                        const adminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = adminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || message.key.fromMe) {
                        await goodbyeCommand(sock, chatId, message);
                    } else {
                        await sock.sendMessage(chatId, { text: 'Désolé, seuls les administrateurs du groupe peuvent utiliser cette commande.' }, { quoted: message });
                    }
                } else {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe.' }, { quoted: message });
                }
                break;
            case userMessage === '.git':
            case userMessage === '.github':
            case userMessage === '.sc':
            case userMessage === '.script':
            case userMessage === '.repo':
                await githubCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.antibadword'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe.' }, { quoted: message });
                    return;
                }

                const adminStatus = await isAdmin(sock, chatId, senderId);
                isSenderAdmin = adminStatus.isSenderAdmin;
                isBotAdmin = adminStatus.isBotAdmin;

                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, { text: '*Le bot doit être admin pour utiliser cette fonction.*' }, { quoted: message });
                    return;
                }

                await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
                break;
            case userMessage.startsWith('.chatbot'):
                const match = (rawText || userMessage).slice(8).trim();
                await handleChatbotCommand(sock, chatId, message, match);
                break;
            case userMessage.startsWith('.ask'):
                {
                    const askText = (rawText || userMessage).slice(4).trim();
                    await askCommand(sock, chatId, message, askText);
                }
                break;
            case userMessage.startsWith('.smart'):
                {
                    const smartText = (rawText || userMessage).slice(6).trim();
                    await smartCommand(sock, chatId, message, smartText);
                }
                break;
            case userMessage.startsWith('.digix') || userMessage.startsWith('.dx'):
                await digixCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.take') || userMessage.startsWith('.steal'):
                {
                    const isSteal = userMessage.startsWith('.steal');
                    const sliceLen = isSteal ? 6 : 5; // '.steal' vs '.take'
                    const takeArgs = rawText.slice(sliceLen).trim().split(' ');
                    await takeCommand(sock, chatId, message, takeArgs);
                }
                break;
            case userMessage.startsWith('.waste'):
                await wastedCommand(sock, chatId, message);
                break;
            case userMessage === '.ship':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe !' }, { quoted: message });
                    return;
                }
                await shipCommand(sock, chatId, message);
                break;
            case userMessage === '.groupinfo' || userMessage === '.infogp' || userMessage === '.infogrupo':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe !' }, { quoted: message });
                    return;
                }
                await groupInfoCommand(sock, chatId, message);
                break;
            case userMessage === '.resetlink' || userMessage === '.revoke' || userMessage === '.anularlink':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe !' }, { quoted: message });
                    return;
                }
                await resetlinkCommand(sock, chatId, senderId);
                break;
            case userMessage === '.staff' || userMessage === '.admins' || userMessage === '.listadmin':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Cette commande peut uniquement être utilisée dans un groupe !' }, { quoted: message });
                    return;
                }
                await staffCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.tourl') || userMessage.startsWith('.url'):
                await urlCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.tg') || userMessage.startsWith('.stickertelegram') || userMessage.startsWith('.tgsticker') || userMessage.startsWith('.telesticker'):
                await stickerTelegramCommand(sock, chatId, message);
                break;

            case userMessage === '.vv':
                await viewonceCommand(sock, chatId, message);
                break;
            case userMessage === '.vv2':
                await viewonceSaveToSelfCommand(sock, chatId, message);
                break;
            case userMessage === '.clearsession' || userMessage === '.clearsesi':
                await clearSessionCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.autostatus'):
                const autoStatusArgs = userMessage.split(' ').slice(1);
                await autoStatusCommand(sock, chatId, message, autoStatusArgs);
                break;
            case userMessage.startsWith('.metallic'):
                await textmakerCommand(sock, chatId, message, userMessage, 'metallic');
                break;
            case userMessage.startsWith('.ice'):
                await textmakerCommand(sock, chatId, message, userMessage, 'ice');
                break;
            case userMessage.startsWith('.snow'):
                await textmakerCommand(sock, chatId, message, userMessage, 'snow');
                break;
            case userMessage.startsWith('.impressive'):
                await textmakerCommand(sock, chatId, message, userMessage, 'impressive');
                break;
            case userMessage.startsWith('.matrix'):
                await textmakerCommand(sock, chatId, message, userMessage, 'matrix');
                break;
            case userMessage.startsWith('.light'):
                await textmakerCommand(sock, chatId, message, userMessage, 'light');
                break;
            case userMessage.startsWith('.neon'):
                await textmakerCommand(sock, chatId, message, userMessage, 'neon');
                break;
            case userMessage.startsWith('.devil'):
                await textmakerCommand(sock, chatId, message, userMessage, 'devil');
                break;
            case userMessage.startsWith('.purple'):
                await textmakerCommand(sock, chatId, message, userMessage, 'purple');
                break;
            case userMessage.startsWith('.thunder'):
                await textmakerCommand(sock, chatId, message, userMessage, 'thunder');
                break;
            case userMessage.startsWith('.leaves'):
                await textmakerCommand(sock, chatId, message, userMessage, 'leaves');
                break;
            case userMessage.startsWith('.1917'):
                await textmakerCommand(sock, chatId, message, userMessage, '1917');
                break;
            case userMessage.startsWith('.arena'):
                await textmakerCommand(sock, chatId, message, userMessage, 'arena');
                break;
            case userMessage.startsWith('.hacker'):
                await textmakerCommand(sock, chatId, message, userMessage, 'hacker');
                break;
            case userMessage.startsWith('.sand'):
                await textmakerCommand(sock, chatId, message, userMessage, 'sand');
                break;
            case userMessage.startsWith('.blackpink'):
                await textmakerCommand(sock, chatId, message, userMessage, 'blackpink');
                break;
            case userMessage.startsWith('.glitch'):
                await textmakerCommand(sock, chatId, message, userMessage, 'glitch');
                break;
            case userMessage.startsWith('.fire'):
                await textmakerCommand(sock, chatId, message, userMessage, 'fire');
                break;
            case userMessage.startsWith('.antidelete'):
                const antideleteMatch = userMessage.slice(11).trim();
                await handleAntideleteCommand(sock, chatId, message, antideleteMatch);
                break;
            case userMessage.startsWith('.statusdl'):
                await statusDownloadCommand(sock, chatId, message, rawText);
                break;
            case userMessage.startsWith('.statusview'):
                await statusDownloadCommand(sock, chatId, message, rawText);
                break;
            case userMessage.startsWith('.schedulemsg'):
                await scheduleMessageCommand(sock, chatId, message, rawText);
                break;
            case userMessage === '.surrender':
                // Handle surrender command for tictactoe game
                await handleTicTacToeMove(sock, chatId, senderId, 'surrender');
                break;
            case userMessage === '.cleartmp':
                await clearTmpCommand(sock, chatId, message);
                break;
            case userMessage === '.setpp':
                await setProfilePicture(sock, chatId, message);
                break;
            case userMessage.startsWith('.setgdesc'):
                {
                    const text = rawText.slice(9).trim();
                    await setGroupDescription(sock, chatId, senderId, text, message);
                }
                break;
            case userMessage.startsWith('.setgname'):
                {
                    const text = rawText.slice(9).trim();
                    await setGroupName(sock, chatId, senderId, text, message);
                }
                break;
            case userMessage.startsWith('.setgpp'):
                await setGroupPhoto(sock, chatId, senderId, message);
                break;
            case userMessage.startsWith('.instagram') || userMessage.startsWith('.insta') || (userMessage === '.ig' || userMessage.startsWith('.ig ')):
                await instagramCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.igsc'):
                await igsCommand(sock, chatId, message, true);
                break;
            case userMessage.startsWith('.igs'):
                await igsCommand(sock, chatId, message, false);
                break;
            case userMessage.startsWith('.fb') || userMessage.startsWith('.facebook'):
                await facebookCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.music'):
                await playCommand(sock, chatId, message);
                break;
            case /^\.(movie|movieinfo|moviedl|moviepage)(?:\s|$)/.test(userMessage):
                await handleMovieCommand(sock, chatId, message, commandInput);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.spotify'):
                await spotifyCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.play') || userMessage.startsWith('.mp3') || userMessage.startsWith('.ytmp3') || userMessage.startsWith('.song'):
                await songCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.video') || userMessage.startsWith('.ytmp4'):
                await videoCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.tiktok') || userMessage.startsWith('.tt'):
                await tiktokCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.twitter') || userMessage.startsWith('.x '):
                await socialCommand(sock, chatId, message, 'twitter', 'video');
                break;
            case userMessage.startsWith('.pinterest') || userMessage.startsWith('.pin '):
                await socialCommand(sock, chatId, message, 'pinterest', 'image');
                break;
            case userMessage === '.qr' || userMessage.startsWith('.qr '):
                await qrCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.gpt') || userMessage.startsWith('.chat') || userMessage.startsWith('.gemini'):
                await aiCommand(sock, chatId, message);
                break;
            case userMessage === '.translate' || userMessage.startsWith('.translate ') || userMessage === '.trt' || userMessage.startsWith('.trt '):
                const commandLength = userMessage.startsWith('.translate') ? 10 : 4;
                await handleTranslateCommand(sock, chatId, message, userMessage.slice(commandLength));
                return;
            case /^\.fr(?:\s|$)/.test(userMessage):
                await handleTranslateCommand(sock, chatId, message, userMessage.slice(3), 'fr');
                return;
            case /^\.en(?:\s|$)/.test(userMessage):
                await handleTranslateCommand(sock, chatId, message, userMessage.slice(3), 'en');
                return;
            case userMessage.startsWith('.ss') || userMessage.startsWith('.ssweb') || userMessage.startsWith('.screenshot'):
                const ssCommandLength = userMessage.startsWith('.screenshot') ? 11 : (userMessage.startsWith('.ssweb') ? 6 : 3);
                await handleSsCommand(sock, chatId, message, userMessage.slice(ssCommandLength).trim());
                break;
            case userMessage.startsWith('.areact') || userMessage.startsWith('.autoreact') || userMessage.startsWith('.autoreaction'):
                await handleAreactCommand(sock, chatId, message, senderId);
                break;
            case userMessage.startsWith('.sudo'):
                await sudoCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.imagine') || userMessage.startsWith('.flux') || userMessage.startsWith('.dalle'): await imagineCommand(sock, chatId, message);
                break;
            case userMessage === '.jid': await groupJidCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.autotyping'):
                await autotypingCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.autorecording'):
                await autorecordingCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.img' || userMessage.startsWith('.img '):
                await imgCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.apk' || userMessage.startsWith('.apk '):
                await apkCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.tempmail' || userMessage.startsWith('.tempmail '):
                await tempmailCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.resetchats'):
                await resetChatsCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.broadcast'):
                await broadcastCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.autoread'):
                await autoreadCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.heart'):
                await handleHeart(sock, chatId, message);
                break;
            case userMessage.startsWith('.horny'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['horny', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.circle'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['circle', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.lgbt'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['lgbt', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.lolice'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['lolice', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.simpcard'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['simpcard', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.tonikawa'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['tonikawa', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.its-so-stupid'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['its-so-stupid', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.namecard'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['namecard', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;

            case userMessage.startsWith('.oogway2'):
            case userMessage.startsWith('.oogway'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const sub = userMessage.startsWith('.oogway2') ? 'oogway2' : 'oogway';
                    const args = [sub, ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.tweet'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['tweet', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.ytcomment'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['youtube-comment', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.comrade'):
            case userMessage.startsWith('.gay'):
            case userMessage.startsWith('.glass'):
            case userMessage.startsWith('.jail'):
            case userMessage.startsWith('.passed'):
            case userMessage.startsWith('.triggered'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const sub = userMessage.slice(1).split(/\s+/)[0];
                    const args = [sub, ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.nom'):
            case userMessage.startsWith('.poke'):
            case userMessage.startsWith('.cry'):
            case userMessage.startsWith('.kiss'):
            case userMessage.startsWith('.pat'):
            case userMessage.startsWith('.hug'):
            case userMessage.startsWith('.wink'):
            case userMessage.startsWith('.facepalm'):
            case userMessage.startsWith('.face-palm'):
            case userMessage.startsWith('.animuquote'):
            case userMessage.startsWith('.quote'):
            case userMessage === '.crop':
                await stickercropCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.update'):
                {
                    const parts = rawText.trim().split(/\s+/);
                    const zipArg = parts[1] && parts[1].startsWith('http') ? parts[1] : '';
                    await updateCommand(sock, chatId, message, zipArg);
                }
                commandExecuted = true;
                break;
            case userMessage.startsWith('.removebg') || userMessage.startsWith('.rmbg') || userMessage.startsWith('.nobg'):
                await removebgCommand.exec(sock, message, userMessage.split(' ').slice(1));
                break;
            case userMessage.startsWith('.remini') || userMessage.startsWith('.enhance') || userMessage.startsWith('.upscale'):
                await reminiCommand(sock, chatId, message, userMessage.split(' ').slice(1));
                break;
            case userMessage.startsWith('.sora'):
                await soraCommand(sock, chatId, message);
                break;
            default:
                if (isGroup) {
                    // Aucun chatbot, réponse aux mentions ou rappel de règles sans commande.
                    // Les protections antitag restent disponibles comme fonctions d’administration.
                    await handleTagDetection(sock, chatId, message, senderId);
                } else if (chatId !== 'status@broadcast' && !chatId.endsWith('@newsletter')) {
                    await handleChatbotResponse(sock, chatId, message, rawText || userMessage, senderId);
                }
                commandExecuted = false;
                break;
        }

        // If a command was executed, show typing status after command execution
        if (commandExecuted !== false) {
            // Command was executed, now show typing status after command execution
            await showTypingAfterCommand(sock, chatId);
            await showRecordingAfterCommand(sock, chatId);
        }

        // Function to handle .groupjid command
        async function groupJidCommand(sock, chatId, message) {
            const groupJid = message.key.remoteJid;

            if (!groupJid.endsWith('@g.us')) {
                return await sock.sendMessage(chatId, {
                    text: "❌ Cette commande peut uniquement être utilisée dans un groupe."
                });
            }

            await sock.sendMessage(chatId, {
                text: `✅ JID du groupe : ${groupJid}`
            }, {
                quoted: message
            });
        }

        if (userMessage.startsWith('.')) {
            // After command is processed successfully
            await addCommandReaction(sock, message);
        }
    } catch (error) {
        console.error('❌ Error in message handler:', error.message);
        // Only try to send error message if we have a valid chatId
        if (chatId) {
            await sock.sendMessage(chatId, {
                text: '❌ Impossible de traiter la commande.'
            });
        }
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;

        // Check if it's a group
        if (!id.endsWith('@g.us')) return;

        // Respect bot mode: only announce promote/demote in public mode
        let isPublic = false;
        try {
            const modeData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof modeData.isPublic === 'boolean') isPublic = modeData.isPublic;
        } catch (e) {
            // If reading fails, keep public-only announcements disabled.
        }

        // Handle promotion events
        if (action === 'promote') {
            if (!isPublic) return;
            await handlePromotionEvent(sock, id, participants, author);
            return;
        }

        // Handle demotion events
        if (action === 'demote') {
            if (!isPublic) return;
            await handleDemotionEvent(sock, id, participants, author);
            return;
        }

        // Handle join events
        if (action === 'add') {
            await handleJoinEvent(sock, id, participants);
        }

        // Handle leave events
        if (action === 'remove') {
            await handleLeaveEvent(sock, id, participants);
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

// Instead, export the handlers along with handleMessages
module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        const statusMessages = getStatusMessages(status);
        if (statusMessages.length === 0) {
            return;
        }

        for (const msg of statusMessages) {
            const processKey = buildStatusProcessKeyFromKey(msg?.key);
            if (markStatusProcessed(processKey)) {
                continue;
            }

            try {
                if (msg?.message) {
                    const senderId = msg.key?.participant || msg.participant || msg.key?.remoteJid;
                    await handleAntistatusDetection(sock, msg, senderId);
                    await storeMessage(sock, msg);
                    if (msg.message?.protocolMessage?.type === 0) {
                        await handleMessageRevocation(sock, msg);
                    }
                }
            } catch (error) {
                console.error('Status antidelete handler error:', error.message);
            }

            await handleStatusUpdate(sock, { messages: [msg] });
        }
    }
};
const { apisCommand } = require('./commands/apis');
