const fs = require('fs')
const STORE_FILE = './baileys_store.json'

// Config: keep last 20 messages per chat (configurable) - More aggressive for lower RAM
let MAX_MESSAGES = 20
const MAX_EDITED_MESSAGES_PER_CHAT = 100
const MAX_EDIT_REVISIONS_PER_MESSAGE = 10

// Try to read config from settings
try {
    const settings = require('../settings.js')
    if (settings.maxStoreMessages && typeof settings.maxStoreMessages === 'number') {
        MAX_MESSAGES = settings.maxStoreMessages
    }
} catch (e) {
    // Use default if settings not available
}

function cloneValue(value) {
    if (value == null) return value

    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value)
        } catch (e) {
            // Fall through to JSON cloning
        }
    }

    try {
        return JSON.parse(JSON.stringify(value))
    } catch (e) {
        return value
    }
}

function normalizeTimestamp(value) {
    if (value == null) return Date.now()

    const numeric = Number(value)
    if (!Number.isNaN(numeric)) {
        return numeric < 1e12 ? numeric * 1000 : numeric
    }

    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
        return date.getTime()
    }

    return Date.now()
}

function extractTextContent(messageBody) {
    return (
        messageBody?.conversation ||
        messageBody?.extendedTextMessage?.text ||
        messageBody?.imageMessage?.caption ||
        messageBody?.videoMessage?.caption ||
        messageBody?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        messageBody?.documentMessage?.caption ||
        ''
    )
}

function getMessageKind(messageBody) {
    if (!messageBody) return 'message'
    if (messageBody.conversation || messageBody.extendedTextMessage) return 'text'
    if (messageBody.imageMessage) return 'image'
    if (messageBody.videoMessage) return 'video'
    if (messageBody.audioMessage) return 'audio'
    if (messageBody.stickerMessage) return 'sticker'
    if (messageBody.documentMessage || messageBody.documentWithCaptionMessage) return 'document'
    if (messageBody.contactMessage) return 'contact'
    if (messageBody.locationMessage) return 'location'
    if (messageBody.pollCreationMessage) return 'poll'
    return 'message'
}

function createEditSnapshot(messageBody, timestamp) {
    return {
        timestamp: normalizeTimestamp(timestamp),
        kind: getMessageKind(messageBody),
        text: String(extractTextContent(messageBody) || '').trim()
    }
}

function snapshotsEqual(left, right) {
    return Boolean(left) && Boolean(right) && left.kind === right.kind && left.text === right.text
}

function trimEditedRecords(chatEditedMessages) {
    const entries = Object.entries(chatEditedMessages || {})

    if (entries.length <= MAX_EDITED_MESSAGES_PER_CHAT) {
        return
    }

    entries
        .sort((a, b) => (b[1]?.lastEditedAt || 0) - (a[1]?.lastEditedAt || 0))
        .slice(MAX_EDITED_MESSAGES_PER_CHAT)
        .forEach(([messageId]) => {
            delete chatEditedMessages[messageId]
        })
}

const store = {
    messages: {},
    contacts: {},
    chats: {},
    editedMessages: {},

    readFromFile(filePath = STORE_FILE) {
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
                this.contacts = data.contacts || {}
                this.chats = data.chats || {}
                this.messages = data.messages || {}
                this.editedMessages = data.editedMessages || {}

                // Clean up any existing data to match new format
                this.cleanupData()
                this.cleanupEditedMessages()
            }
        } catch (e) {
            console.warn('Failed to read store file:', e.message)
        }
    },

    dirty: false,

    writeToFile(filePath = STORE_FILE, force = false) {
        if (!this.dirty && !force) return
        try {
            this.dirty = false
            const data = JSON.stringify({
                contacts: this.contacts,
                chats: this.chats,
                messages: this.messages,
                editedMessages: this.editedMessages
            })
            const tmpPath = filePath + '.tmp'
            fs.writeFileSync(tmpPath, data)
            fs.renameSync(tmpPath, filePath)
        } catch (e) {
            this.dirty = true
            console.warn('Failed to write store file:', e.message)
        }
    },

    cleanupData() {
        // Convert old format messages to new format if needed
        if (this.messages) {
            Object.keys(this.messages).forEach(jid => {
                if (typeof this.messages[jid] === 'object' && !Array.isArray(this.messages[jid])) {
                    // Old format - convert to new format
                    const messages = Object.values(this.messages[jid])
                    this.messages[jid] = messages.slice(-MAX_MESSAGES)
                }
            })
        }
    },

    cleanupEditedMessages() {
        if (!this.editedMessages || typeof this.editedMessages !== 'object') {
            this.editedMessages = {}
            return
        }

        Object.keys(this.editedMessages).forEach((jid) => {
            const chatEditedMessages = this.editedMessages[jid]

            if (!chatEditedMessages || typeof chatEditedMessages !== 'object' || Array.isArray(chatEditedMessages)) {
                this.editedMessages[jid] = {}
                return
            }

            Object.keys(chatEditedMessages).forEach((messageId) => {
                const record = chatEditedMessages[messageId]

                if (!record || typeof record !== 'object') {
                    delete chatEditedMessages[messageId]
                    return
                }

                if (!Array.isArray(record.history)) {
                    record.history = []
                }

                record.history = record.history.filter((entry) => entry && typeof entry === 'object')

                if (record.history.length === 0) {
                    delete chatEditedMessages[messageId]
                    return
                }

                if (record.history.length > MAX_EDIT_REVISIONS_PER_MESSAGE) {
                    const firstSnapshot = record.history[0]
                    const tailSnapshots = record.history.slice(-(MAX_EDIT_REVISIONS_PER_MESSAGE - 1))
                    record.history = [firstSnapshot, ...tailSnapshots]
                }

                record.messageId = record.messageId || messageId
                record.remoteJid = record.remoteJid || jid
                record.senderJid = record.senderJid || record.sender || ''
                record.lastEditedAt = normalizeTimestamp(record.lastEditedAt || record.history[record.history.length - 1]?.timestamp)
                record.editCount = Math.max(0, record.history.length - 1)
                record.wasEdited = true
            })

            trimEditedRecords(chatEditedMessages)
        })
    },

    applyEditedMessageUpdate(entry) {
        const editedContent =
            entry?.update?.message?.editedMessage?.message ||
            entry?.update?.message?.protocolMessage?.editedMessage?.message ||
            null
        if (!editedContent) return

        const jid = entry?.key?.remoteJid
        const messageId = entry?.key?.id
        if (!jid || !messageId) return

        const timestamp = normalizeTimestamp(entry?.update?.messageTimestamp)
        const chatMessages = Array.isArray(this.messages[jid]) ? this.messages[jid] : []
        const storedMessage = chatMessages.find((msg) => msg?.key?.id === messageId)
        const senderJid = entry?.key?.participant || storedMessage?.key?.participant || storedMessage?.key?.remoteJid || jid
        const currentSnapshot = createEditSnapshot(editedContent, timestamp)

        if (!this.editedMessages[jid] || typeof this.editedMessages[jid] !== 'object' || Array.isArray(this.editedMessages[jid])) {
            this.editedMessages[jid] = {}
        }

        const chatEditedMessages = this.editedMessages[jid]
        const existingRecord = chatEditedMessages[messageId]

        const record = existingRecord && typeof existingRecord === 'object'
            ? existingRecord
            : {
                messageId,
                remoteJid: jid,
                senderJid,
                history: []
            }

        if (!Array.isArray(record.history)) {
            record.history = []
        }

        if (record.history.length === 0 && storedMessage?.message) {
            record.history.push(createEditSnapshot(
                storedMessage.message,
                storedMessage.messageTimestamp || storedMessage.timestamp || timestamp
            ))
        }

        if (record.history.length === 0) {
            record.history.push(currentSnapshot)
        } else if (!snapshotsEqual(record.history[record.history.length - 1], currentSnapshot)) {
            record.history.push(currentSnapshot)
        }

        if (record.history.length > MAX_EDIT_REVISIONS_PER_MESSAGE) {
            const firstSnapshot = record.history[0]
            const tailSnapshots = record.history.slice(-(MAX_EDIT_REVISIONS_PER_MESSAGE - 1))
            record.history = [firstSnapshot, ...tailSnapshots]
        }

        record.messageId = messageId
        record.remoteJid = jid
        record.senderJid = record.senderJid || senderJid
        record.lastEditedAt = timestamp
        record.editCount = Math.max(0, record.history.length - 1)
        record.wasEdited = true

        chatEditedMessages[messageId] = record
        trimEditedRecords(chatEditedMessages)

        if (storedMessage?.message) {
            storedMessage.message = cloneValue(editedContent)
            if (entry?.update?.messageTimestamp != null) {
                storedMessage.messageTimestamp = entry.update.messageTimestamp
            }
            storedMessage.edited = true
            storedMessage.editedAt = timestamp
        }
    },

    bind(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (!msg.key?.remoteJid) return
                const jid = msg.key.remoteJid
                this.messages[jid] = this.messages[jid] || []

                // push new message
                this.messages[jid].push(msg)
                this.dirty = true

                // trim old ones (moins de messages gardés pour les groupes : économie de RAM)
                const limit = jid.endsWith('@g.us') ? Math.min(10, MAX_MESSAGES) : MAX_MESSAGES
                if (this.messages[jid].length > limit) {
                    this.messages[jid] = this.messages[jid].slice(-limit)
                }
            })
        })

        ev.on('messages.update', (updates) => {
            updates.forEach((entry) => {
                this.applyEditedMessageUpdate(entry)
            })
        })

        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) {
                    this.contacts[contact.id] = {
                        id: contact.id,
                        name: contact.notify || contact.name || ''
                    }
                }
            })
        })

        ev.on('chats.upsert', (chats) => {
            (chats || []).forEach((chat) => {
                if (chat?.id) this.chats[chat.id] = { id: chat.id, subject: chat.subject || chat.name || '' }
            })
        })

        ev.on('contacts.upsert', (contacts) => {
            (contacts || []).forEach((c) => {
                if (c?.id) this.contacts[c.id] = { id: c.id, name: c.name || c.notify || '', saved: Boolean(c.name) }
            })
        })

        ev.on('messaging-history.set', ({ chats = [], contacts = [] } = {}) => {
            chats.forEach((chat) => { if (chat?.id) this.chats[chat.id] = { id: chat.id, subject: chat.subject || chat.name || '' } })
            contacts.forEach((c) => { if (c?.id) this.contacts[c.id] = { id: c.id, name: c.name || c.notify || '', saved: Boolean(c.name) } })
        })

        ev.on('chats.set', (chats) => {
            this.chats = {}
            chats.forEach(chat => {
                this.chats[chat.id] = { id: chat.id, subject: chat.subject || '' }
            })
        })
    },

    async loadMessage(jid, id) {
        return this.messages[jid]?.find(m => m.key.id === id) || null
    },

    getEditedMessageRecord(jid, id) {
        return this.editedMessages?.[jid]?.[id] || null
    },

    // Get store statistics
    getStats() {
        let totalMessages = 0
        let totalContacts = Object.keys(this.contacts).length
        let totalChats = Object.keys(this.chats).length
        let totalEditedMessages = 0

        Object.values(this.messages).forEach(chatMessages => {
            if (Array.isArray(chatMessages)) {
                totalMessages += chatMessages.length
            }
        })

        Object.values(this.editedMessages || {}).forEach((chatEditedMessages) => {
            if (chatEditedMessages && typeof chatEditedMessages === 'object') {
                totalEditedMessages += Object.keys(chatEditedMessages).length
            }
        })

        return {
            messages: totalMessages,
            editedMessages: totalEditedMessages,
            contacts: totalContacts,
            chats: totalChats,
            maxMessagesPerChat: MAX_MESSAGES
        }
    }
}

module.exports = store
