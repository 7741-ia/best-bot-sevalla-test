// --- Options mémoire (petit serveur) -------------------------------------------------------------
// Certains panneaux (Katabump) imposent `node Index.js` sans options. Au tout premier démarrage, on se relance
// UNE fois avec les bonnes options (même processus : execve remplace Node, aucune mémoire en plus).
if (!process.env.BB_FLAGS_APPLIED && typeof process.execve === 'function' &&
    !process.execArgv.some((arg) => arg.startsWith('--max-old-space-size'))) {
    try {
        process.env.BB_FLAGS_APPLIED = '1';
        process.execve(process.execPath,
            [process.execPath, '--expose-gc', '--max-old-space-size=' + (process.env.NODE_HEAP_MB || 170), '--max-semi-space-size=2', '--optimize-for-size', process.argv[1], ...process.argv.slice(2)],
            process.env);
    } catch (error) {
        console.log('[boot] relance avec options mémoire impossible :', error.message);
    }
}
// Si le relancement n'a pas eu lieu : au moins disposer du ramasse-miettes manuel utilisé par hostGuard
if (typeof global.gc !== 'function') {
    try {
        require('v8').setFlagsFromString('--expose-gc');
        global.gc = require('vm').runInNewContext('gc');
    } catch (error) { /* ignoré */ }
}


// --- Silence le bruit de libsignal (Baileys) : il affiche des dumps entiers de sessions (clés, buffers) à chaque message.
// Ça pollue les logs Sevalla/Katabump et coûte du CPU/RAM (util.inspect d'objets énormes). Les vraies erreurs restent visibles.
const SIGNAL_NOISE = /^(Closing session|Opening session|Removing old closed session|Migrating session|Session already (closed|open)|Closing open session in favor of incoming prekey bundle|Decrypted message with closed session|Failed to decrypt message with any known session)/i;
for (const level of ['log', 'info', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
        if (typeof args[0] === 'string' && SIGNAL_NOISE.test(args[0])) return;
        original(...args);
    };
}

try { require('dotenv').config(); } catch (_) {}
const http = require('http');
const healthPort = Number(process.env.PORT || 8080);
if (process.env.BESTBOT_MANAGER_CHILD !== '1') {
    http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/health') {
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Best King bot worker is running');
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    }).listen(healthPort, '0.0.0.0', () => {
        console.log(`[health] HTTP server listening on port ${healthPort}`);
    });
}
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const sharp = require('./lib/lazy')('sharp')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const { setOwnerPresence } = require('./commands/chatbot');
const { initScheduler } = require('./commands/schedulemsg');
const { initGroupHoursScheduler } = require('./commands/grouphours');
const { initGroupAmbienceScheduler } = require('./lib/groupAmbience');
const { formatRdcDate } = require('./lib/time');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    Browsers,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')
const presenceMode = require('./lib/presenceMode')
const { clearWhatsAppAuthDirectory, getWhatsAppAuthDirectory } = require('./lib/whatsappAuthStorage')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => { try { store.writeToFile() } catch(e){} }, settings.storeWriteInterval || 120000).unref()

const lockFilePath = path.join(process.cwd(), '.bot.lock')

function isPidRunning(pid) {
    if (!pid || Number.isNaN(Number(pid))) return false
    try {
        process.kill(Number(pid), 0)
        return true
    } catch {
        return false
    }
}

function acquireSingleInstanceLock() {
    try {
        if (fs.existsSync(lockFilePath)) {
            const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8').trim())
            if (existingPid && existingPid !== process.pid && isPidRunning(existingPid)) {
                console.log(chalk.red(`Une autre instance du bot est déjà en cours d’exécution (PID ${existingPid}). Ferme-la avant de relancer ce projet.`))
                process.exit(1)
            }
            try { fs.unlinkSync(lockFilePath) } catch {}
        }

        fs.writeFileSync(lockFilePath, String(process.pid))
    } catch (error) {
        console.error('Impossible de créer le verrou d’instance unique :', error.message)
    }
}

function releaseSingleInstanceLock() {
    try {
        if (fs.existsSync(lockFilePath)) {
            const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8').trim())
            if (!existingPid || existingPid === process.pid) {
                fs.unlinkSync(lockFilePath)
            }
        }
    } catch {}
}

acquireSingleInstanceLock()
process.on('exit', releaseSingleInstanceLock)

// Crée data/ + fichiers JSON manquants (évite ENOENT sur Katabump)
const { ensureDataFiles } = require('./lib/ensureData')
ensureDataFiles()

// Optimisations hébergement (Katabump / petits panels)
require('./lib/hostGuard')

// Chargement sécurisé de owner.json
let owner = []
try {
    const ownerRaw = fs.readFileSync('./data/owner.json', 'utf8')
    owner = JSON.parse(ownerRaw)
    if (!Array.isArray(owner)) owner = []
} catch (e) {
    console.warn('[boot] owner.json absent ou invalide — démarrage avec liste vide')
    owner = []
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true })
        fs.writeFileSync('./data/owner.json', '[]')
    } catch (_) {}
}

global.botname = "BestBot"
global.themeemoji = "•"
const configuredPhoneNumber = String(process.env.PHONE_NUMBER || settings.ownerNumber || '')
    .replace(/[^0-9]/g, '')
const pairingCode = configuredPhoneNumber.length > 0 || process.argv.includes("--pairing-code")
const PAIRING_CODE_TTL_MS = 45000
const PAIRING_REFRESH_MS = 35000
const useMobile = process.argv.includes("--mobile")

// État global de connexion : un seul socket WhatsApp et une seule reconnexion
// peuvent exister à la fois dans un même processus.
let activeSocket = null
let startingConnection = false
let reconnectTimer = null
let managerShutdown = false
// Le code reste stable pendant sa fenêtre de validité, même si WhatsApp
// ferme le socket avec 428 et que Baileys prépare une reconnexion.
let lastPairingRequestAt = 0
let pairingRefreshTimer = null
function notifyManager(event) {
    if (process.env.BESTBOT_MANAGER_CHILD !== '1' || typeof process.send !== 'function') return
    try { process.send({ sessionId: process.env.BESTBOT_SESSION_ID, ...event }) } catch {}
}

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
let shutdownPromise = null
async function gracefulShutdown(signal) {
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = (async () => {
        console.log(`[shutdown] arrêt demandé (${signal})`)
        if (reconnectTimer) clearTimeout(reconnectTimer)
        startingConnection = false
        try { store.writeToFile(undefined, true) } catch (error) { console.error('[shutdown] store flush failed:', error.message) }
        const socket = activeSocket
        activeSocket = null
        try { socket?.ev?.removeAllListeners() } catch {}
        try { socket?.ws?.close() } catch {}
        try { rl?.close() } catch {}
        releaseSingleInstanceLock()
    })().finally(() => process.exit(0))
    return shutdownPromise
}
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { gracefulShutdown(signal).catch(() => process.exit(1)) })
}
if (process.env.BESTBOT_MANAGER_CHILD === '1') {
    process.on('message', async (message) => {
        if (!message || !['disconnect', 'restart'].includes(message.type) || managerShutdown) return
        managerShutdown = true
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = null
        if (message.type === 'disconnect') {
            try { await activeSocket?.logout?.() } catch (error) {
                notifyManager({ type: 'error', message: `WhatsApp logout: ${error?.message || 'échec'}` })
            }
            await new Promise((resolve) => setTimeout(resolve, 700))
            try { clearWhatsAppAuthDirectory({ cwd: __dirname }) } catch (error) {
                notifyManager({ type: 'error', message: `Nettoyage de session: ${error?.message || 'échec'}` })
            }
            notifyManager({ type: 'state', status: 'disconnected', reason: 'admin_disconnect' })
        }
        await gracefulShutdown(message.type === 'disconnect' ? 'ADMIN_DISCONNECT' : 'ADMIN_RESTART')
    })
}
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(configuredPhoneNumber)
    }
}


async function startXeonBotInc() {
    if (activeSocket) {
        console.log(chalk.gray('[connection] démarrage ignoré : une connexion existe déjà.'))
        return activeSocket
    }
    if (startingConnection) {
        console.log(chalk.gray('[connection] démarrage ignoré : connexion déjà en cours.'))
        return null
    }

    startingConnection = true
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const authDirectory = getWhatsAppAuthDirectory({ cwd: __dirname })
        const { state, saveCreds } = await useMultiFileAuthState(authDirectory)
        let pairingPhoneNumber = ''
        let pairingRequestInFlight = false
        if (pairingCode && !state.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api')

            const enteredNumber = global.phoneNumber || await question(chalk.bgBlack(chalk.greenBright(`Entre ton numéro WhatsApp 😍\nFormat : 243000000000 (sans + ni espace) : `)))
            pairingPhoneNumber = String(enteredNumber).replace(/[^0-9]/g, '')
            if (pairingPhoneNumber.length < 8 || pairingPhoneNumber.length > 15) {
                throw new Error('Numéro invalide. Entre un numéro de 8 à 15 chiffres, sans + ni espace.')
            }
        }

        const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, useClones: false, maxKeys: 1000 })

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: Browsers.ubuntu('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: false,
            shouldSyncHistoryMessage: () => false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
        })
        activeSocket = XeonBotInc
        startingConnection = false
        // In pairing-code mode Baileys does not necessarily emit `qr`: that event is
        // intended for QR authentication. Wait for the WebSocket itself to open, then
        // request the phone-linking code. Otherwise the public request stays stuck on
        // “Préparation de votre liaison…” forever.
        if (pairingCode && pairingPhoneNumber && !state.creds.registered) {
            const requestPairingCode = async () => {
                if (state.creds.registered || pairingRequestInFlight || activeSocket !== XeonBotInc) return
                const elapsed = Date.now() - lastPairingRequestAt
                if (elapsed < PAIRING_REFRESH_MS) {
                    const waitMs = Math.max(1000, PAIRING_REFRESH_MS - elapsed)
                    clearTimeout(pairingRefreshTimer)
                    pairingRefreshTimer = setTimeout(() => { void requestPairingCode() }, waitMs)
                    pairingRefreshTimer.unref?.()
                    return
                }
                pairingRequestInFlight = true
                lastPairingRequestAt = Date.now()
                try {
                    await XeonBotInc.waitForSocketOpen()
                    if (state.creds.registered || activeSocket !== XeonBotInc) return
                    const rawCode = await XeonBotInc.requestPairingCode(pairingPhoneNumber)
                    const code = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode
                    notifyManager({ type: 'pairing-code', code, expiresAt: Date.now() + PAIRING_CODE_TTL_MS })
                    if (process.env.BESTBOT_MANAGER_CHILD !== '1') {
                        console.log(chalk.black(chalk.bgGreen(`Ton code d’appairage : `)), chalk.black(chalk.white(code)))
                        console.log(chalk.yellow(`\nEntre ce code dans WhatsApp :\n1. Ouvre WhatsApp\n2. Va dans Paramètres > Appareils liés\n3. Appuie sur "Lier un appareil"\n4. Saisis le code affiché ci-dessus`))
                    } else {
                        console.log('[pairing] code généré et transmis uniquement au navigateur demandeur')
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error?.message || error)
                    notifyManager({ type: 'error', message: `Code d’appairage: ${error?.message || 'échec de génération'}` })
                    console.log(chalk.red('Impossible d’obtenir le code d’appairage. Vérifie ton numéro puis réessaie.'))
                } finally {
                    pairingRequestInFlight = false
                    if (!state.creds.registered && activeSocket === XeonBotInc) {
                        pairingRefreshTimer = setTimeout(() => { void requestPairingCode() }, PAIRING_REFRESH_MS)
                        pairingRefreshTimer.unref?.()
                    }
                }
            }
            void requestPairingCode()
        }
        presenceMode.install(XeonBotInc)
        const ownerJid = jidNormalizedUser(`${settings.ownerNumber}@s.whatsapp.net`)
        let connectionNoticeSent = false
        XeonBotInc.ev.on('presence.update', ({ id, presences = {} } = {}) => {
            const matchingPresence = Object.entries(presences).find(([jid]) => jidNormalizedUser(jid) === ownerJid)?.[1]
            const updateJid = id ? jidNormalizedUser(id) : ''
            if (matchingPresence || updateJid === ownerJid) {
                const presence = matchingPresence?.lastKnownPresence || Object.values(presences)[0]?.lastKnownPresence
                if (presence) setOwnerPresence(presence)
            }
        })

        initScheduler(XeonBotInc)
        initGroupHoursScheduler(XeonBotInc)
        // Désactivé par sécurité : aucun message automatique dans un groupe sans commande autorisée.
        // initGroupAmbienceScheduler(XeonBotInc)

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        const messages = Array.isArray(chatUpdate?.messages) ? chatUpdate.messages : [];
        for (const mek of messages) {
            try {
                if (!mek?.message) continue;
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
                const singleUpdate = { ...chatUpdate, messages: [mek] };

                if (mek.key?.remoteJid === 'status@broadcast') {
                    if (!mek.key.fromMe) require('./lib/statusContacts').record(mek.key.participant, mek.key.participantAlt, mek.pushName);
                    await handleStatus(XeonBotInc, singleUpdate);
                    continue;
                }
                // In private mode, only block non-group messages (allow groups for moderation).
                if (!XeonBotInc.public && !mek.key?.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us');
                    if (!isGroup) continue;
                }
                if (mek.key?.id?.startsWith('BAE5') && mek.key.id.length === 16) continue;

                if (XeonBotInc?.msgRetryCounterCache) XeonBotInc.msgRetryCounterCache.clear();
                await handleMessages(XeonBotInc, singleUpdate, true);
            } catch (err) {
                console.error('Error processing message in upsert:', err?.message || err);
                const remoteJid = mek?.key?.remoteJid;
                if (remoteJid && remoteJid !== 'status@broadcast') {
                    await XeonBotInc.sendMessage(remoteJid, {
                        text: 'Une erreur est survenue pendant le traitement de ton message.'
                    }).catch(() => {});
                }
            }
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        const id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        if (connection === 'connecting') notifyManager({ type: 'state', status: 'connecting' })
        if (qr && !state.creds.registered) notifyManager({ type: 'state', status: 'pairing' })
        if (connection !== 'open') setOwnerPresence('unknown')
        
        if (qr) {
            console.log(chalk.yellow('📱 QR code généré. Scanne-le avec WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connexion à WhatsApp...'))
        }
        
        if (connection == "open") {
            const linkedNumber = String(XeonBotInc.user?.id || '').replace(/:\d+@.*/, '').replace(/@.*/, '')
            notifyManager({ type: 'state', status: 'connected', linkedNumber })
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            presenceMode.start(XeonBotInc)
            Promise.resolve(XeonBotInc.presenceSubscribe(ownerJid)).catch((error) => {
                console.error('[chatbot] Owner presence subscription failed:', error.message)
            })

            if (!connectionNoticeSent) try {
                const botJid = jidNormalizedUser(XeonBotInc.user.id);
                const connectedName = XeonBotInc.user?.name || settings.botOwner || 'Utilisateur';
                const caption =
                    `╭─〔 BestBot CONNECTED 〕─⬣\n` +
                    `│ Bonjour ${connectedName}\n` +
                    `│\n` +
                    `│ Bienvenue dans l'univers de *BestBot*.\n` +
                    `│ Ta session est active et le bot est maintenant pret.\n` +
                    `│\n` +
                    `│ ✦ Statut : Connecte avec succes\n` +
                    `│ ✦ Heure RDC : ${formatRdcDate()}\n` +
                    `│ ✦ Owner : ${settings.botOwner}\n` +
                    `│ ✦ Contact owner : wa.me/${settings.ownerNumber}\n` +
                    `│\n` +
                    `│ Merci de faire confiance a BestBot.\n` +
                    `│ Nous sommes ravis de t'accueillir.\n` +
                    `╰────────────────────⬣`;

                try {
                    const profilePicUrl = await XeonBotInc.profilePictureUrl(botJid, 'image');
                    const profilePicResponse = await axios.get(profilePicUrl, {
                        responseType: 'arraybuffer',
                        timeout: 15000,
                        maxContentLength: 2 * 1024 * 1024,
                        validateStatus: (status) => status >= 200 && status < 300
                    });
                    const contentType = String(profilePicResponse.headers['content-type'] || '');
                    if (!contentType.startsWith('image/')) throw new Error('Profile picture URL did not return an image');
                    const profilePicBuffer = await sharp(Buffer.from(profilePicResponse.data), { limitInputPixels: 25000000 })
                        .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 65 })
                        .toBuffer();
                    await XeonBotInc.sendMessage(botJid, {
                        image: profilePicBuffer,
                        caption
                    });
                    connectionNoticeSent = true;
                } catch (error) {
                    console.error('Connection profile message failed:', error.message);
                    await XeonBotInc.sendMessage(botJid, { text: caption });
                    connectionNoticeSent = true;
                }
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'BestBot'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL:non`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: BestBot`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: Best King King`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot connecté avec succès ! ✅`))
            console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        
        if (connection === 'close') {
            if (activeSocket === XeonBotInc) activeSocket = null
            try { XeonBotInc.ev.removeAllListeners(); XeonBotInc.ws?.close() } catch (e) {}
            try { msgRetryCounterCache.close() } catch (e) {} // sinon un cache + un timer s'accumulent à chaque reconnexion
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const disconnectMessage = String(lastDisconnect?.error || '').toLowerCase()
            notifyManager({ type: 'connection-close', statusCode, message: String(lastDisconnect?.error?.message || lastDisconnect?.error || 'Connexion fermée').slice(0, 400) })
            
            console.log(chalk.red(`Connexion fermée à cause de ${lastDisconnect?.error} (statut WhatsApp : ${statusCode ?? 'inconnu'}), reconnexion : ${shouldReconnect}`))

            if (managerShutdown) return

            if (disconnectMessage.includes('conflict')) {
                console.log(chalk.red('Conflit de session détecté. Une autre instance du bot, un autre hébergement, ou un autre appareil lié utilise déjà cette session WhatsApp.'))
                console.log(chalk.yellow('Ferme toutes les autres instances du bot puis relance-le. Si le problème continue, supprime le dossier session et reconnecte le bot une seule fois.'))
                // Ne pas supprimer la session et ne pas lancer plusieurs retries.
                return scheduleReconnect(30000)
            }
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    clearWhatsAppAuthDirectory({ cwd: __dirname })
                    console.log(chalk.yellow('La session WhatsApp déconnectée a été supprimée. Merci de te reconnecter.'))
                } catch (error) {
                    console.error('Error deleting session:', error)
                }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
                // En mode pairing, un 401 est un rejet terminal de WhatsApp.
                // Ne pas relancer un nouveau code : cela crée une boucle de
                // codes invalides et masque la cause réelle à l’utilisateur.
                if (pairingCode) {
                    managerShutdown = true
                    return gracefulShutdown('PAIRING_AUTH_REJECTED')
                }
                return scheduleReconnect(3000)
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'))
                return scheduleReconnect(5000)
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Reject incoming calls and send one polite notice per caller per minute.
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: 'Bonjour, je ne peux pas répondre aux appels pour le moment. Tu peux m’écrire ici, je te répondrai dès que possible. Merci de ta compréhension.' });
                    }
                } catch {}
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        startingConnection = false
        console.error('Error in startXeonBotInc:', error)
        notifyManager({ type: 'error', message: `Démarrage WhatsApp: ${error?.message || 'échec'}` })
        scheduleReconnect(5000)
    }
}

function scheduleReconnect(delayMs = 5000) {
    if (managerShutdown || activeSocket || reconnectTimer || startingConnection) return
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        startXeonBotInc().catch((error) => {
            console.error('Retry failed:', error?.message || error)
            scheduleReconnect(10000)
        })
    }, delayMs)
}


// Start the bot with error handling
startXeonBotInc().catch(async error => {
    // Ne jamais tuer le process : une seule reconnexion différée à la fois.
    console.error('Fatal error (retry dans 10s):', error)
    scheduleReconnect(10000)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

// Auto-reload du fichier désactivé : sur un panel il provoquait des doubles
// instances et des arrêts inattendus du bot.
