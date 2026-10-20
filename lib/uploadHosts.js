// Hébergeurs de fichiers gratuits en secours pour .url (catbox, tmpfiles, uguu) — sans dépendance en plus.
const axios = require('axios');
const FormData = require('form-data');

async function catbox(buffer, fileName) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, fileName);
    const res = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders(), timeout: 60000 });
    const link = String(res.data || '').trim();
    if (!/^https?:\/\//i.test(link)) throw new Error(`catbox : ${link.slice(0, 60) || 'réponse vide'}`);
    return link;
}

async function tmpfiles(buffer, fileName) {
    const form = new FormData();
    form.append('file', buffer, fileName);
    const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, { headers: form.getHeaders(), timeout: 60000 });
    const url = res.data?.data?.url;
    if (!url) throw new Error('tmpfiles : réponse invalide');
    return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'); // lien de téléchargement direct
}

async function uguu(buffer, fileName) {
    const form = new FormData();
    form.append('files[]', buffer, fileName);
    const res = await axios.post('https://uguu.se/upload', form, { headers: form.getHeaders(), timeout: 60000 });
    const url = res.data?.files?.[0]?.url;
    if (!url) throw new Error('uguu : réponse invalide');
    return url;
}

async function uploadMedia(buffer, fileName = 'file.bin') {
    let lastError;
    for (const uploader of [catbox, tmpfiles, uguu]) {
        try {
            return await uploader(buffer, fileName);
        } catch (error) {
            lastError = error;
            console.error(`[upload] ${uploader.name} échoué :`, error.message);
        }
    }
    throw lastError || new Error('Aucun hébergeur disponible');
}

module.exports = { uploadMedia };
