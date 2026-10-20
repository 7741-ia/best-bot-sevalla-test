'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const MAX_MEMORIES = 50;
const MAX_TEXT_LENGTH = 500;
const DANIEL_PROFILE = Object.freeze({
    fullName: 'Daniel Amisi',
    pseudonym: 'Best King',
    ageDeclared: 23,
    city: 'Beni, République démocratique du Congo',
    institution: 'Université Chrétienne Bilingue du Congo (UCBC)',
    level: 'L3, troisième année de génie informatique',
    activities: ['formateur', 'développeur', 'concepteur d’applications', 'porteur de projets technologiques'],
    interests: ['programmation', 'intelligence artificielle', 'développement web et mobile', 'automatisation', 'bots WhatsApp', 'nouvelles technologies', 'sport'],
    goals: ['apprendre continuellement', 'développer des applications innovantes', 'renforcer ses compétences techniques', 'créer des solutions utiles'],
    profilePhotoUrl: null,
    profilePhotoPath: null,
    optional: {
        technologies: [],
        currentProjects: [],
        communicationPreferences: [],
        learningGoals: [],
        tools: [],
        workHabits: [],
        answerFormats: []
    },
    source: 'Informations explicitement fournies par Daniel dans le cahier des charges',
    schemaVersion: SCHEMA_VERSION
});

function getBaseDir() {
    if (process.env.BESTBOT_MEMORY_DIR) return path.resolve(process.env.BESTBOT_MEMORY_DIR);
    if (process.env.BESTBOT_STATUS_DATA_DIR) return path.join(path.resolve(process.env.BESTBOT_STATUS_DATA_DIR), 'assistant-memory');
    return path.join(process.cwd(), 'data', 'assistant-memory');
}

function ensureDir() {
    const dir = getBaseDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch {}
    return dir;
}

function canonicalUserId(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^([\w-]+)(?::\d+)?@(s\.whatsapp\.net|lid)$/i);
    if (!match) return null;
    return `${match[1]}@${match[2].toLowerCase()}`;
}

function fileForUser(userId) {
    const canonical = canonicalUserId(userId);
    if (!canonical) throw new TypeError('Identifiant WhatsApp invalide');
    const digest = crypto.createHash('sha256').update(canonical).digest('hex');
    return path.join(ensureDir(), `${digest}.json`);
}

function freshRecord() {
    return {
        schemaVersion: SCHEMA_VERSION,
        consent: { learning: false, updatedAt: null },
        memories: [],
        projects: [],
        stylePreferences: [],
        styleObservations: { messages: 0, totalChars: 0, questionMessages: 0, emojiMessages: 0, updatedAt: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function readUser(userId) {
    const file = fileForUser(userId);
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!data || data.schemaVersion !== SCHEMA_VERSION) return freshRecord();
        return {
            ...freshRecord(), ...data,
            consent: { learning: Boolean(data.consent?.learning), updatedAt: data.consent?.updatedAt || null },
            memories: Array.isArray(data.memories) ? data.memories.slice(-MAX_MEMORIES) : [],
            projects: Array.isArray(data.projects) ? data.projects.slice(-20).map(project => ({
                name: String(project?.name || '').slice(0, 80),
                notes: Array.isArray(project?.notes) ? project.notes.slice(-20).map(note => ({
                    id: String(note?.id || crypto.randomUUID()),
                    content: String(note?.content || '').slice(0, MAX_TEXT_LENGTH),
                    createdAt: note?.createdAt || null
                })) : [],
                updatedAt: project?.updatedAt || null
            })) : [],
            stylePreferences: Array.isArray(data.stylePreferences) ? data.stylePreferences.slice(-20) : [],
            styleObservations: {
                messages: Math.max(0, Number(data.styleObservations?.messages) || 0),
                totalChars: Math.max(0, Number(data.styleObservations?.totalChars) || 0),
                questionMessages: Math.max(0, Number(data.styleObservations?.questionMessages) || 0),
                emojiMessages: Math.max(0, Number(data.styleObservations?.emojiMessages) || 0),
                updatedAt: data.styleObservations?.updatedAt || null
            }
        };
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('[assistantMemory] lecture impossible:', error.message);
        return freshRecord();
    }
}

function writeAtomic(file, value) {
    const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
        fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.renameSync(temp, file);
        try { fs.chmodSync(file, 0o600); } catch {}
    } finally {
        try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
    }
}

function saveUser(userId, record) {
    const file = fileForUser(userId);
    record.schemaVersion = SCHEMA_VERSION;
    record.updatedAt = new Date().toISOString();
    writeAtomic(file, record);
    return record;
}

function setLearningConsent(userId, enabled) {
    const record = readUser(userId);
    record.consent.learning = Boolean(enabled);
    record.consent.updatedAt = new Date().toISOString();
    if (!enabled) record.styleObservations = freshRecord().styleObservations;
    return saveUser(userId, record);
}

function addMemory(userId, text) {
    const content = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    if (!content) throw new TypeError('Le souvenir ne peut pas être vide');
    const record = readUser(userId);
    record.memories.push({ id: crypto.randomUUID(), content, source: 'explicit', createdAt: new Date().toISOString() });
    record.memories = record.memories.slice(-MAX_MEMORIES);
    saveUser(userId, record);
    return record.memories[record.memories.length - 1];
}

function addStylePreference(userId, text) {
    const content = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!content) throw new TypeError('La préférence ne peut pas être vide');
    const record = readUser(userId);
    record.stylePreferences.push({ id: crypto.randomUUID(), content, source: 'explicit', createdAt: new Date().toISOString() });
    record.stylePreferences = record.stylePreferences.slice(-20);
    saveUser(userId, record);
    return record.stylePreferences[record.stylePreferences.length - 1];
}

function addProjectNote(userId, projectName, noteText) {
    const name = String(projectName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const content = String(noteText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    if (!name || !content) throw new TypeError('Indique un nom de projet et une note');
    const record = readUser(userId);
    let project = record.projects.find(item => item.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
    if (!project) {
        project = { name, notes: [], updatedAt: null };
        record.projects.push(project);
    }
    project.name = name;
    project.notes.push({ id: crypto.randomUUID(), content, createdAt: new Date().toISOString() });
    project.notes = project.notes.slice(-20);
    project.updatedAt = new Date().toISOString();
    record.projects = record.projects.slice(-20);
    saveUser(userId, record);
    return project;
}

function forget(userId, topic) {
    const needle = String(topic || '').trim().toLocaleLowerCase('fr');
    if (!needle) return { removed: 0 };
    const record = readUser(userId);
    const before = record.memories.length + record.stylePreferences.length + record.projects.reduce((count, project) => count + 1 + project.notes.length, 0);
    record.memories = record.memories.filter(item => !String(item.content || '').toLocaleLowerCase('fr').includes(needle));
    record.stylePreferences = record.stylePreferences.filter(item => !String(item.content || '').toLocaleLowerCase('fr').includes(needle));
    record.projects = record.projects.filter(project => !project.name.toLocaleLowerCase('fr').includes(needle))
        .map(project => ({ ...project, notes: project.notes.filter(note => !note.content.toLocaleLowerCase('fr').includes(needle)) }))
        .filter(project => project.notes.length);
    const after = record.memories.length + record.stylePreferences.length + record.projects.reduce((count, project) => count + 1 + project.notes.length, 0);
    const removed = before - after;
    if (removed) saveUser(userId, record);
    return { removed };
}

function resetUser(userId) {
    const file = fileForUser(userId);
    try { fs.unlinkSync(file); return true; }
    catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

// Les observations ne conservent jamais le texte reçu : uniquement des compteurs agrégés après consentement.
function observeStyle(userId, text) {
    const value = String(text || '').trim();
    if (!value) return false;
    const record = readUser(userId);
    if (!record.consent.learning) return false;
    const stats = record.styleObservations;
    stats.messages = Math.min(100000, stats.messages + 1);
    stats.totalChars = Math.min(100000000, stats.totalChars + Math.min(value.length, 4000));
    if (/[?？]/.test(value)) stats.questionMessages = Math.min(stats.messages, stats.questionMessages + 1);
    if (/[\p{Extended_Pictographic}]/u.test(value)) stats.emojiMessages = Math.min(stats.messages, stats.emojiMessages + 1);
    stats.updatedAt = new Date().toISOString();
    saveUser(userId, record);
    return true;
}

function getUserSummary(userId) {
    const record = readUser(userId);
    return {
        consent: record.consent,
        memories: record.memories,
        projects: record.projects,
        stylePreferences: record.stylePreferences,
        styleObservations: record.styleObservations
    };
}

function getPromptContext(userId, query = '') {
    const record = readUser(userId);
    const lines = [];
    const stopWords = new Set(['avec', 'dans', 'pour', 'mais', 'mon', 'mes', 'nous', 'vous', 'elle', 'elles', 'est', 'suis', 'que', 'qui', 'quoi', 'comment', 'projet', 'continue', 'reprends']);
    const queryWords = new Set(String(query).toLocaleLowerCase('fr').match(/[\p{L}\p{N}]{3,}/gu)?.filter(word => !stopWords.has(word)) || []);
    const rank = (items, textFor) => items.map((item, index) => {
        const words = String(textFor(item)).toLocaleLowerCase('fr').match(/[\p{L}\p{N}]{3,}/gu) || [];
        return { item, index, score: words.reduce((count, word) => count + (queryWords.has(word) ? 1 : 0), 0) };
    }).sort((a, b) => b.score - a.score || b.index - a.index);
    const memories = rank(record.memories, item => item.content);
    const selectedMemories = queryWords.size && memories[0]?.score
        ? memories.filter(item => item.score > 0).slice(0, 5)
        : memories.slice(0, 3);
    for (const { item } of selectedMemories) lines.push(`Souvenir déclaré par l’utilisateur : ${String(item.content).slice(0, 300)}`);
    const projectNotes = record.projects.flatMap(project => project.notes.map(note => ({ project, note })));
    const projects = rank(projectNotes, item => `${item.project.name} ${item.note.content}`);
    const selectedProjects = queryWords.size && projects[0]?.score
        ? projects.filter(item => item.score > 0).slice(0, 4)
        : projects.slice(0, 2);
    for (const { item } of selectedProjects) lines.push(`Note du projet « ${item.project.name} » : ${String(item.note.content).slice(0, 300)}`);
    for (const item of record.stylePreferences.slice(-5)) lines.push(`Préférence de réponse déclarée : ${String(item.content).slice(0, 200)}`);
    const stats = record.styleObservations;
    if (record.consent.learning && stats.messages >= 10) {
        const avg = Math.round(stats.totalChars / stats.messages);
        const questions = Math.round((stats.questionMessages / stats.messages) * 100);
        const emojis = Math.round((stats.emojiMessages / stats.messages) * 100);
        lines.push(`Tendances stylistiques observées avec consentement (agrégées, non déclarées comme certaines) : messages de ${avg} caractères en moyenne, questions dans environ ${questions}% des messages, emojis dans environ ${emojis}%.`);
    }
    return lines.join('\n').slice(0, 1800);
}

function cloneBaseDanielProfile() {
    return {
        ...DANIEL_PROFILE,
        activities: [...DANIEL_PROFILE.activities],
        interests: [...DANIEL_PROFILE.interests],
        goals: [...DANIEL_PROFILE.goals],
        optional: Object.fromEntries(Object.entries(DANIEL_PROFILE.optional).map(([key, values]) => [key, [...values]]))
    };
}

function getDanielProfile() {
    const file = path.join(ensureDir(), 'daniel-profile.json');
    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (saved?.schemaVersion === SCHEMA_VERSION) return {
            ...DANIEL_PROFILE, ...saved,
            activities: Array.isArray(saved.activities) ? saved.activities.slice(0, 20).map(item => String(item).slice(0, 180)) : [...DANIEL_PROFILE.activities],
            interests: Array.isArray(saved.interests) ? saved.interests.slice(0, 30).map(item => String(item).slice(0, 180)) : [...DANIEL_PROFILE.interests],
            goals: Array.isArray(saved.goals) ? saved.goals.slice(0, 30).map(item => String(item).slice(0, 180)) : [...DANIEL_PROFILE.goals],
            optional: Object.fromEntries(Object.keys(DANIEL_PROFILE.optional).map(key => [
                key,
                Array.isArray(saved.optional?.[key]) ? saved.optional[key].slice(0, 30).map(item => String(item).slice(0, MAX_TEXT_LENGTH)) : []
            ]))
        };
    } catch (error) { if (error.code !== 'ENOENT') console.error('[assistantMemory] profil illisible:', error.message); }
    return cloneBaseDanielProfile();
}

function setDanielPhotoUrl(value) {
    const profile = getDanielProfile();
    const input = String(value || '').trim();
    if (!input) {
        profile.profilePhotoUrl = null;
    } else {
        if (input.length > 512) throw new TypeError('URL trop longue');
        let url;
        try { url = new URL(input); } catch { throw new TypeError('URL invalide'); }
        if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Utilise une URL HTTPS valide, sans identifiant ni mot de passe');
        profile.profilePhotoUrl = url.toString();
    }
    if (profile.profilePhotoPath) removeStoredDanielPhoto(profile.profilePhotoPath);
    profile.profilePhotoPath = null;
    profile.schemaVersion = SCHEMA_VERSION;
    writeAtomic(path.join(ensureDir(), 'daniel-profile.json'), profile);
    return profile;
}

function removeStoredDanielPhoto(relativePath) {
    const allowed = new Set(['daniel-profile-photo.jpg', 'daniel-profile-photo.png', 'daniel-profile-photo.webp']);
    if (!allowed.has(String(relativePath || ''))) return;
    try { fs.unlinkSync(path.join(ensureDir(), relativePath)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function saveDanielPhotoBuffer(buffer, mimeType = '') {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 5 * 1024 * 1024) throw new TypeError('Image invalide ou supérieure à 5 Mo');
    const signatures = [
        { ext: 'jpg', mime: 'image/jpeg', valid: buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
        { ext: 'png', mime: 'image/png', valid: buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
        { ext: 'webp', mime: 'image/webp', valid: buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
    ];
    const detected = signatures.find(item => item.valid);
    if (!detected) throw new TypeError('Seules les images JPEG, PNG ou WebP valides sont acceptées');
    const declared = String(mimeType || '').split(';')[0].toLowerCase();
    if (declared && declared !== detected.mime && !(detected.ext === 'jpg' && declared === 'image/jpg')) throw new TypeError('Le type déclaré ne correspond pas au contenu de l’image');
    const dir = ensureDir();
    const filename = `daniel-profile-photo.${detected.ext}`;
    for (const ext of ['jpg', 'png', 'webp']) if (ext !== detected.ext) removeStoredDanielPhoto(`daniel-profile-photo.${ext}`);
    writeAtomic(path.join(dir, filename), buffer);
    const profile = getDanielProfile();
    profile.profilePhotoUrl = null;
    profile.profilePhotoPath = filename;
    profile.schemaVersion = SCHEMA_VERSION;
    writeAtomic(path.join(dir, 'daniel-profile.json'), profile);
    return profile;
}

function removeDanielPhoto() {
    const profile = getDanielProfile();
    removeStoredDanielPhoto(profile.profilePhotoPath);
    profile.profilePhotoPath = null;
    profile.profilePhotoUrl = null;
    profile.schemaVersion = SCHEMA_VERSION;
    writeAtomic(path.join(ensureDir(), 'daniel-profile.json'), profile);
    return profile;
}

const DANIEL_PROFILE_LIST_FIELDS = new Set([...Object.keys(DANIEL_PROFILE.optional), 'activities', 'interests', 'goals']);
function updateDanielProfileList(field, text, action = 'add') {
    if (!DANIEL_PROFILE_LIST_FIELDS.has(field)) throw new TypeError('Champ de profil non autorisé');
    const value = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    if (!value) throw new TypeError('Indique une valeur');
    const profile = getDanielProfile();
    const isCoreList = ['activities', 'interests', 'goals'].includes(field);
    const current = isCoreList ? profile[field] : (profile.optional[field] || []);
    if (action === 'remove') {
        const needle = value.toLocaleLowerCase('fr');
        const updated = current.filter(item => !String(item).toLocaleLowerCase('fr').includes(needle));
        if (isCoreList) profile[field] = updated;
        else profile.optional[field] = updated;
    } else {
        if (!current.some(item => String(item).toLocaleLowerCase('fr') === value.toLocaleLowerCase('fr'))) current.push(value);
        if (isCoreList) profile[field] = current.slice(-30);
        else profile.optional[field] = current.slice(-30);
    }
    profile.schemaVersion = SCHEMA_VERSION;
    writeAtomic(path.join(ensureDir(), 'daniel-profile.json'), profile);
    return profile;
}

const DANIEL_PROFILE_SCALAR_FIELDS = new Set(['fullName', 'pseudonym', 'ageDeclared', 'city', 'institution', 'level']);
function updateDanielProfileField(field, value) {
    if (!DANIEL_PROFILE_SCALAR_FIELDS.has(field)) throw new TypeError('Champ de profil non autorisé');
    const profile = getDanielProfile();
    if (field === 'ageDeclared') {
        const age = Number(value);
        if (!Number.isInteger(age) || age < 10 || age > 120) throw new TypeError('L’âge doit être un nombre entier valide');
        profile.ageDeclared = age;
    } else {
        const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        if (!text) throw new TypeError('Indique une valeur');
        profile[field] = text;
    }
    profile.schemaVersion = SCHEMA_VERSION;
    writeAtomic(path.join(ensureDir(), 'daniel-profile.json'), profile);
    return profile;
}

function exportUser(userId) {
    return getUserSummary(userId);
}

module.exports = {
    SCHEMA_VERSION,
    DANIEL_PROFILE,
    getStorageDirectory: ensureDir,
    canonicalUserId,
    readUser,
    saveUser,
    setLearningConsent,
    addMemory,
    addStylePreference,
    addProjectNote,
    forget,
    resetUser,
    observeStyle,
    getUserSummary,
    getPromptContext,
    getDanielProfile,
    setDanielPhotoUrl,
    saveDanielPhotoBuffer,
    removeDanielPhoto,
    updateDanielProfileList,
    updateDanielProfileField,
    exportUser
};
