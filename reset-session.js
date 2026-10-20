'use strict';

const fs = require('fs');
const path = require('path');

const { getWhatsAppAuthDirectory, resolveWhatsAppAuthDirectory } = require('./lib/whatsappAuthStorage');
const options = { cwd: __dirname };
let sessionPath = resolveWhatsAppAuthDirectory(options);

if (!process.argv.includes('--confirm')) {
    console.error('Réinitialisation annulée. Relance avec --confirm pour déplacer la session WhatsApp vers une sauvegarde; aucun fichier ne sera supprimé.');
    process.exitCode = 2;
} else {
    sessionPath = getWhatsAppAuthDirectory(options);
    if (!fs.existsSync(sessionPath)) {
        console.log('Aucun dossier de session WhatsApp à déplacer.');
        process.exit(0);
    }
    const backupDirectory = path.dirname(sessionPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    let backupPath = path.join(backupDirectory, `whatsapp-session.backup.${stamp}`);
    let suffix = 1;
    while (fs.existsSync(backupPath)) {
        backupPath = path.join(backupDirectory, `whatsapp-session.backup.${stamp}.${suffix++}`);
    }
    fs.renameSync(sessionPath, backupPath);
    console.log(`Ancienne session déplacée vers ${path.basename(backupPath)}; elle n’a pas été supprimée.`);
}
