const fs = require('fs');
const path = require('path');
const PERMANENT_ACCESS_NUMBERS = new Set(['243859886065', '243824439814']);
const USER_GROUP_DATA_PATH = process.env.BESTBOT_USER_GROUP_DATA_PATH || path.join(__dirname, '../data/userGroupData.json');

// Function to load user and group data from JSON file
function loadUserGroupData() {
    try {
        const dataPath = USER_GROUP_DATA_PATH;
        if (!fs.existsSync(dataPath)) {
            // Create the file with default structure if it doesn't exist
            fs.mkdirSync(path.dirname(dataPath), { recursive: true });
            const defaultData = {
                antibadword: {},
                antilink: {},
                antimedia: {},
                antistatus: {},
                antiviewonce: {},
                antitag: {},
                welcome: {},
                goodbye: {},
                chatbot: {},
                warnings: {},
                sudo: [],
                premium: {}
            };
            fs.writeFileSync(dataPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        return data;
    } catch (error) {
        console.error('Error loading user group data:', error);
        return {
            antibadword: {},
            antilink: {},
            antimedia: {},
            antistatus: {},
            antiviewonce: {},
            antitag: {},
            welcome: {},
            goodbye: {},
                chatbot: {},
                warnings: {},
                sudo: [],
                premium: {}
            };
    }
}

// Function to save user and group data to JSON file
function saveUserGroupData(data) {
    try {
        const dataPath = USER_GROUP_DATA_PATH;
        // Ensure the directory exists
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving user group data:', error);
        return false;
    }
}

// Helper for premium.json
function loadPremiumJson() {
    try {
        const premiumPath = path.join(__dirname, '../data/premium.json');
        if (fs.existsSync(premiumPath)) {
            const parsed = JSON.parse(fs.readFileSync(premiumPath, 'utf8'));
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.users) ? parsed.users : []);
            return list.map(normalizePremiumKey).filter(Boolean);
        }
    } catch (e) {
        console.error('Error loading premium.json:', e);
    }
    return [];
}

// Add these functions to your SQL helper file
async function setAntilink(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink) data.antilink = {};
        if (!data.antilink[groupId]) data.antilink[groupId] = {};
        
        data.antilink[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antilink:', error);
        return false;
    }
}

async function getAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink || !data.antilink[groupId]) return null;
        
        return type === 'on' ? data.antilink[groupId] : null;
    } catch (error) {
        console.error('Error getting antilink:', error);
        return null;
    }
}

async function removeAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antilink && data.antilink[groupId]) {
            delete data.antilink[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antilink:', error);
        return false;
    }
}

async function setAntimedia(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antimedia) data.antimedia = {};
        if (!data.antimedia[groupId]) data.antimedia[groupId] = {};

        data.antimedia[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };

        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antimedia:', error);
        return false;
    }
}

async function getAntimedia(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antimedia || !data.antimedia[groupId]) return null;

        return type === 'on' ? data.antimedia[groupId] : null;
    } catch (error) {
        console.error('Error getting antimedia:', error);
        return null;
    }
}

async function removeAntimedia(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antimedia && data.antimedia[groupId]) {
            delete data.antimedia[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antimedia:', error);
        return false;
    }
}

// Add antitag functions
async function setAntitag(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antitag) data.antitag = {};
        if (!data.antitag[groupId]) data.antitag[groupId] = {};
        
        data.antitag[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antitag:', error);
        return false;
    }
}

async function getAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antitag || !data.antitag[groupId]) return null;
        
        return type === 'on' ? data.antitag[groupId] : null;
    } catch (error) {
        console.error('Error getting antitag:', error);
        return null;
    }
}

async function removeAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antitag && data.antitag[groupId]) {
            delete data.antitag[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antitag:', error);
        return false;
    }
}

async function setAntistatus(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antistatus) data.antistatus = {};
        if (!data.antistatus[groupId]) data.antistatus[groupId] = {};

        data.antistatus[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };

        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antistatus:', error);
        return false;
    }
}

async function getAntistatus(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antistatus || !data.antistatus[groupId]) return null;

        return type === 'on' ? data.antistatus[groupId] : null;
    } catch (error) {
        console.error('Error getting antistatus:', error);
        return null;
    }
}

async function removeAntistatus(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antistatus && data.antistatus[groupId]) {
            delete data.antistatus[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antistatus:', error);
        return false;
    }
}

async function setAntiViewOnce(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antiviewonce) data.antiviewonce = {};

        data.antiviewonce[groupId] = {
            enabled: type === 'on'
        };

        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antiviewonce:', error);
        return false;
    }
}

async function getAntiViewOnce(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antiviewonce || !data.antiviewonce[groupId]) return null;
        return type === 'on' ? data.antiviewonce[groupId] : null;
    } catch (error) {
        console.error('Error getting antiviewonce:', error);
        return null;
    }
}

async function removeAntiViewOnce(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antiviewonce && data.antiviewonce[groupId]) {
            delete data.antiviewonce[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antiviewonce:', error);
        return false;
    }
}

function ensurePremiumBucket(data) {
    if (!data.premium || typeof data.premium !== 'object' || Array.isArray(data.premium)) {
        if (Array.isArray(data.premium)) {
            const converted = {};
            data.premium.forEach((jid) => {
                if (typeof jid === 'string' && jid.trim()) {
                    const key = String(jid).trim().split(':')[0].split('@')[0];
                    if (key) {
                        converted[key] = {
                            jid: String(jid).trim().split(':')[0],
                            addedAt: Date.now()
                        };
                    }
                }
            });
            data.premium = converted;
        } else {
            data.premium = {};
        }
    } else {
        const keys = Object.keys(data.premium);
        const needsNormalize = keys.some((key) => !/^\d+$/.test(key));

        if (needsNormalize) {
            const converted = {};

            keys.forEach((key) => {
                const info = data.premium[key];
                const sourceJid = info && typeof info === 'object' && info.jid
                    ? info.jid
                    : key;
                const normalizedKey = normalizePremiumKey(sourceJid || key);
                if (!normalizedKey) return;

                converted[normalizedKey] = {
                    jid: normalizePremiumJid(sourceJid || key) || `${normalizedKey}@s.whatsapp.net`,
                    addedAt: info && typeof info === 'object' && info.addedAt ? info.addedAt : Date.now(),
                    addedBy: info && typeof info === 'object' && info.addedBy ? info.addedBy : '',
                    note: info && typeof info === 'object' && info.note ? info.note : ''
                };
            });

            data.premium = converted;
        }
    }

    return data.premium;
}

function normalizePremiumKey(userId) {
    const normalized = String(userId || '').trim().split(':')[0];
    if (!normalized) return '';
    return normalized.split('@')[0];
}

function normalizePremiumJid(userId) {
    return String(userId || '').trim().split(':')[0];
}

// Le propriétaire (settings) et le compte connecté au bot ont toujours tous les droits
function isOwnerAccount(userId) {
    try {
        const { phoneDigits, botJid } = require('./jidUtils');
        const settings = require('../settings');
        const phone = phoneDigits(userId);
        const ownerDigits = String(settings.ownerNumber || '').split(':')[0].split('@')[0];
        const botDigits = String(botJid() || '').split(':')[0].split('@')[0];
        return Boolean(phone && (phone === ownerDigits || (botDigits && phone === botDigits)));
    } catch { return false; }
}

async function isPremium(userId) {
    try {
        const key = normalizePremiumKey(userId);
        if (!key) return false;
        const phone = require('./jidUtils').phoneDigits(userId);
        if (PERMANENT_ACCESS_NUMBERS.has(key) || PERMANENT_ACCESS_NUMBERS.has(phone) || isOwnerAccount(userId)) return true;

        // 1. Check in premium.json (The priority source as requested by user)
        const premiumList = loadPremiumJson();
        if (Array.isArray(premiumList) && (premiumList.includes(key) || premiumList.includes(phone))) {
            return true;
        }

        // 2. Fallback to userGroupData.json
        const data = loadUserGroupData();
        const premium = ensurePremiumBucket(data);
        return Boolean(premium[key] || premium[phone]);
    } catch (error) {
        console.error('Error checking premium:', error);
        return false;
    }
}

async function addPremium(userJid, metadata = {}) {
    try {
        const jid = normalizePremiumJid(userJid);
        const key = normalizePremiumKey(userJid);
        if (!jid || !key) return false;

        // Update premium.json
        const premiumList = loadPremiumJson();
        if (!premiumList.includes(key)) {
            premiumList.push(key);
            const premiumPath = path.join(__dirname, '../data/premium.json');
            fs.writeFileSync(premiumPath, JSON.stringify(premiumList, null, 2));
        }

        // Update userGroupData.json for metadata
        const data = loadUserGroupData();
        const premium = ensurePremiumBucket(data);
        premium[key] = {
            jid,
            addedAt: metadata.addedAt || Date.now(),
            addedBy: metadata.addedBy || '',
            note: metadata.note || ''
        };
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error adding premium user:', error);
        return false;
    }
}

async function removePremium(userJid) {
    try {
        const key = normalizePremiumKey(userJid);
        if (!key) return false;

        // Update premium.json
        let premiumList = loadPremiumJson();
        if (premiumList.includes(key)) {
            premiumList = premiumList.filter(k => k !== key);
            const premiumPath = path.join(__dirname, '../data/premium.json');
            fs.writeFileSync(premiumPath, JSON.stringify(premiumList, null, 2));
        }

        // Update userGroupData.json
        const data = loadUserGroupData();
        const premium = ensurePremiumBucket(data);
        if (premium[key]) {
            delete premium[key];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing premium user:', error);
        return false;
    }
}

async function getPremiumList() {
    try {
        const data = loadUserGroupData();
        const premium = ensurePremiumBucket(data);
        const premiumJson = loadPremiumJson();
        
        // Merge list from JSON and userGroupData
        const merged = new Set([...premiumJson, ...Object.keys(premium), ...PERMANENT_ACCESS_NUMBERS]);
        
        return Array.from(merged).map((key) => {
            const info = premium[key];
            return {
                key,
                jid: info && typeof info === 'object' && info.jid ? info.jid : `${key}@s.whatsapp.net`,
                ...(info && typeof info === 'object' ? info : {})
            };
        });
    } catch (error) {
        console.error('Error getting premium list:', error);
        return [];
    }
}

function ensureWarningBucket(data, groupId, userId) {
    if (!data.warnings) data.warnings = {};
    if (!data.warnings[groupId]) data.warnings[groupId] = {};

    const currentValue = data.warnings[groupId][userId];
    if (typeof currentValue === 'number') {
        data.warnings[groupId][userId] = {
            legacy: currentValue
        };
    } else if (!currentValue || typeof currentValue !== 'object') {
        data.warnings[groupId][userId] = {};
    }

    return data.warnings[groupId][userId];
}

// Add these functions for warning system
async function incrementWarningCount(groupId, userId, category = 'general') {
    try {
        const data = loadUserGroupData();
        const warningBucket = ensureWarningBucket(data, groupId, userId);

        if (!warningBucket[category]) warningBucket[category] = 0;
        warningBucket[category]++;
        saveUserGroupData(data);
        return warningBucket[category];
    } catch (error) {
        console.error('Error incrementing warning count:', error);
        return 0;
    }
}

async function resetWarningCount(groupId, userId, category = 'general') {
    try {
        const data = loadUserGroupData();
        if (data.warnings && data.warnings[groupId] && data.warnings[groupId][userId] !== undefined) {
            const warningBucket = ensureWarningBucket(data, groupId, userId);
            warningBucket[category] = 0;
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error resetting warning count:', error);
        return false;
    }
}

// Add sudo check function
async function isSudo(userId) {
    try {
        const key = normalizePremiumKey(userId);
        if (!key) return false;
        const phone = require('./jidUtils').phoneDigits(userId);
        if (PERMANENT_ACCESS_NUMBERS.has(key) || PERMANENT_ACCESS_NUMBERS.has(phone) || isOwnerAccount(userId)) return true;
        const data = loadUserGroupData();
        return Array.isArray(data.sudo) && data.sudo.some((entry) => {
            const entryKey = normalizePremiumKey(entry);
            return entryKey === key || entryKey === phone;
        });
    } catch (error) {
        console.error('Error checking sudo:', error);
        return false;
    }
}

// Manage sudo users
async function addSudo(userJid) {
    try {
        const data = loadUserGroupData();
        if (!data.sudo) data.sudo = [];
        const key = normalizePremiumKey(userJid);
        const jid = String(userJid || '').includes('@')
            ? String(userJid).trim().split(':')[0]
            : `${key}@s.whatsapp.net`;
        if (key && !data.sudo.some((entry) => normalizePremiumKey(entry) === key)) {
            data.sudo.push(jid);
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error adding sudo user:', error);
        return false;
    }
}

async function removeSudo(userJid) {
    try {
        const key = normalizePremiumKey(userJid);
        if (PERMANENT_ACCESS_NUMBERS.has(key)) return true;
        const data = loadUserGroupData();
        if (Array.isArray(data.sudo) && data.sudo.some((entry) => normalizePremiumKey(entry) === key)) {
            data.sudo = data.sudo.filter((entry) => normalizePremiumKey(entry) !== key);
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing sudo user:', error);
        return false;
    }
}

async function getSudoList() {
    try {
        const data = loadUserGroupData();
        return [...new Set([
            ...(Array.isArray(data.sudo) ? data.sudo : []),
            ...[...PERMANENT_ACCESS_NUMBERS].map((number) => `${number}@s.whatsapp.net`)
        ])];
    } catch (error) {
        console.error('Error getting sudo list:', error);
        return [];
    }
}

function getGroupMessageConfig(section, groupId) {
    const key = String(groupId || '').trim();
    const raw = key && section && typeof section === 'object' ? section[key] : null;
    if (raw === true) return { enabled: true, message: '' };
    if (typeof raw === 'string') return { enabled: Boolean(raw), message: raw };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { enabled: false, message: '' };
    return {
        enabled: Boolean(raw.enabled),
        message: typeof raw.message === 'string' ? raw.message : ''
    };
}

async function setGroupMessageConfig(sectionName, groupId, enabled, message) {
    const key = String(groupId || '').trim();
    if (!key) return false;
    const data = loadUserGroupData();
    if (!data[sectionName] || typeof data[sectionName] !== 'object' || Array.isArray(data[sectionName])) {
        data[sectionName] = {};
    }
    const current = getGroupMessageConfig(data[sectionName], key);
    const text = message == null || String(message).trim() === ''
        ? current.message
        : String(message).trim().slice(0, 2000);
    data[sectionName][key] = { enabled: Boolean(enabled), message: text };
    return saveUserGroupData(data);
}

async function removeGroupMessageConfig(sectionName, groupId) {
    const key = String(groupId || '').trim();
    if (!key) return false;
    const data = loadUserGroupData();
    if (data[sectionName] && Object.prototype.hasOwnProperty.call(data[sectionName], key)) {
        delete data[sectionName][key];
        return saveUserGroupData(data);
    }
    return true;
}

async function addWelcome(groupId, enabled, message) {
    return setGroupMessageConfig('welcome', groupId, enabled, message);
}

async function delWelcome(groupId) {
    return removeGroupMessageConfig('welcome', groupId);
}

async function isWelcomeOn(groupId) {
    const data = loadUserGroupData();
    return getGroupMessageConfig(data.welcome, groupId).enabled;
}

async function getWelcome(groupId) {
    const data = loadUserGroupData();
    return getGroupMessageConfig(data.welcome, groupId).message || null;
}

async function addGoodbye(groupId, enabled, message) {
    return setGroupMessageConfig('goodbye', groupId, enabled, message);
}

async function delGoodBye(groupId) {
    return removeGroupMessageConfig('goodbye', groupId);
}

async function isGoodByeOn(groupId) {
    const data = loadUserGroupData();
    return getGroupMessageConfig(data.goodbye, groupId).enabled;
}

async function getGoodbye(groupId) {
    const data = loadUserGroupData();
    return getGroupMessageConfig(data.goodbye, groupId).message || null;
}

module.exports = {
    loadUserGroupData,
    saveUserGroupData,
    setAntilink,
    getAntilink,
    removeAntilink,
    setAntimedia,
    getAntimedia,
    removeAntimedia,
    setAntitag,
    getAntitag,
    removeAntitag,
    setAntistatus,
    getAntistatus,
    removeAntistatus,
    setAntiViewOnce,
    getAntiViewOnce,
    removeAntiViewOnce,
    isPremium,
    addPremium,
    removePremium,
    getPremiumList,
    incrementWarningCount,
    resetWarningCount,
    addWelcome,
    delWelcome,
    isWelcomeOn,
    getWelcome,
    addGoodbye,
    delGoodBye,
    isGoodByeOn,
    getGoodbye,
    isSudo,
    addSudo,
    removeSudo,
    getSudoList
};
