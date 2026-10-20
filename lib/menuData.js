const settings = require('../settings');

const commandSections = [
    {
        id: 'general',
        number: 1,
        title: 'GÉNÉRAL',
        aliases: ['1', 'general', 'gen', 'base'],
        commands: [
            '.help', '.menu', '.ping', '.alive', '.owner', '.jid', '.groupinfo', '.staff',
            '.tts <texte>', '.joke', '.vibe', '.insul <1-9> [@user]', '.insult <1-9> [@user]', '/calc <expression>', '/split <texte>', '/random choix 1, choix 2', '/password [longueur]', '/vcard <nom> <numero>', '.quote', '.fact', '.weather <ville>', '.news',
            '.api help', '.knightapi', '.country <pays>', '.pokemon <nom>', '.crypto <nom>', '.nasa', '.recipe <plat>', '.address <adresse>', '.currency 100 EUR USD', '.short <url>',
            '.attp <texte>', '.lyrics <musique>', '.trt <texte> <langue>',
            '.ss <lien>', '.url', '.mod', '.mod2'
        ]
    },
    {
        id: 'admin',
        number: 2,
        title: 'ADMINISTRATION',
        aliases: ['2', 'admin', 'admins', 'moderation', 'modo'],
        commands: [
            '.ban @user', '.unban @user', '.promote @user', '.demote @user', '.kick @user',
            '.mute <minutes>', '.unmute', '.warn @user', '.warnings @user', '.delete',
            '.clear', '.tag <message>', '.tagall', '.tagnotadmin', '.hidetag <message>',
            '.antilink', '.antimedia <on/off>', '.antimedia set <warn/delete/kick>', '.antispam <on/off/get/set/limit/window/repeat>', '.heuresgroupe <set/status/off>', '.antibadword', '.antitag <on/off>', '.antitag set <warn/delete/kick>', '.antistatus <on/off>', '.antistatus set <warn/delete/kick>', '.antiviewonce <on/off>', '.chatbot on', '.chatbot off', '.chatbot mode all|mention', '.ask <q>', '.smart <q>', '.antistatustag <on/off>', '.resetlink',
            '.welcome <on/off>', '.goodbye <on/off>', '.setgdesc <texte>', '.setgname <texte>',
            '.setgpp'
        ]
    },
    {
        id: 'owner',
        number: 3,
        title: 'PROPRIÉTAIRE',
        aliases: ['3', 'owner', 'proprio', 'proprietaire', 'owneronly'],
        commands: [
            '.mode <public/private>', '.mode online', '.mode offline', '.mode normal', '.settings', '.setpp', '.update', '.clearsession',
            '.cleartmp', '.antidelete', '.antimedia <on/off>', '.antimedia set <warn/delete/kick>', '.antistatus <on/off>', '.antistatus set <warn/delete/kick>', '.antiviewonce <on/off>', '.statusdl [@user/numero/latest]', '.schedulemsg YYYY-MM-DD HH:MM | cible | message', '.autoreact <on/off>', '.autostatus <on/off>',
            '.autostatus react <on/off>', '.autostatus sticker <on/off>', '.autotyping <on/off>', '.autorecording <on/off>', '.resetchats', '.broadcast <message>', '.autoread <on/off>', '.vv', '.vv2',
            '.anticall <on/off>', '.pmblocker <on/off/status>', '.pmblocker setmsg <texte>', '.premium add @user', '.premium del @user', '.premium list',
            '.mention <on/off>', '.setmention', '.chatbot dm on (tous les DM)', '.chatbot dm off', '.chatbot setmsg <texte>', '.chatbot setoffline <texte>', '.chatbot online (répond même si en ligne)', '.chatbot offline (répond si absent)', '.sudo add', '.sudo del', '.sudo list'
        ]
    },
    {
        id: 'media',
        number: 4,
        title: 'MÉDIA',
        aliases: ['4', 'media', 'medias', 'sticker', 'stickers', 'image'],
        commands: [
            '.sticker', '/sticker', '/toimg', '.simage', '.blur', '.crop', '.removebg', '.remini',
            '.meme', '.take <packname>', '.tgsticker <lien>',
            '.igs <lien>', '.instagram <lien>', '.facebook <lien>', '.tiktok <lien>', '.twitter <lien>', '.pinterest <lien>', '.img <mots>', '.apk <application>', '.tempmail', '.qr <texte>',
            '.play <musique>', '.song <musique>', '.spotify <recherche>', '.video <musique>', '.ytmp4 <lien>'
        ]
    },
    {
        id: 'ai',
        number: 5,
        title: 'IA (INTELLIGENCE ARTIFICIELLE)',
        aliases: ['5', 'ai', 'ia', 'creative', 'create', 'creation'],
        commands: [
            '.ask <question>', '.smart <question>', '.chatbot ask <question>', '.gpt <question>', '.chat <question>', '.gemini <question>', '.imagine <prompt>', '.flux <prompt>',
            '.sora <prompt>', '.metallic <texte>', '.ice <texte>', '.snow <texte>',
            '.impressive <texte>', '.matrix <texte>', '.light <texte>', '.neon <texte>',
            '.devil <texte>', '.purple <texte>', '.thunder <texte>', '.leaves <texte>',
            '.1917 <texte>', '.arena <texte>', '.hacker <texte>', '.sand <texte>',
            '.blackpink <texte>', '.glitch <texte>', '.fire <texte>'
        ]
    },
    {
        id: 'digix',
        number: 6,
        title: 'OUTILS DIGIX',
        aliases: ['6', 'digix', 'dx', 'api', 'apis', 'tools'],
        commands: [
            '.digix ai <question>', '.digix copilot <question>', '.digix groq <question>',
            '.digix chatgptfree <question>', '.digix webcopilot <question>', '.digix venice <question>',
            '.digix codegen <description> | <langue>', '.digix viralpost <plateforme> | <sujet> | <style>',
            '.digix imagine <prompt>', '.digix canvas bonk|hacker|tvnews|snews|welcome|x|patrick',
            '.digix download fbdl|fbdlv2|sp-dl|spdlv2|thrdsdl|tikdl|xdl|xdlv2',
            '.digix search lyrics|lyricsv2|tinfo|weather', '.digix tools translate|pastebin|currency|carbon',
            '.digix tempmail gen|inbox|read'
        ]
    },
    {
        id: 'fun',
        number: 7,
        title: 'DIVERTISSEMENT',
        aliases: ['7', 'fun', 'games', 'jeux', 'game'],
        commands: [
            '.tictactoe @user', '.poll Question | Opt1 | Opt2', '.sondage ...',
            '.quiz', '.quiz score', '.tod', '.tod truth', '.tod dare',
            '.wyr', '.compliment <1-9> @user', '.ship @user', '.wasted @user'
        ]
    },
    {
        id: 'extra',
        number: 8,
        title: 'EXTRA / DIVERS',
        aliases: ['8', 'extra', 'autres', 'misc'],
        commands: [
            '.tweet', '.ytcomment', '.namecard', '.jail', '.triggered',
            '.git', '.github', '.sc', '.script', '.repo'
        ]
    },
    {
        id: 'premium',
        number: 9,
        title: 'PREMIUM (VIP)',
        aliases: ['9', 'premium', 'vip', 'pro'],
        commands: [
            '.vipcard [note]'
        ]
    },
    {
        id: 'cinema',
        number: 10,
        title: 'CINÉMA',
        aliases: ['10', 'cinema', 'cinéma', 'movies', 'movie', 'films', 'cine'],
        commands: [
            '.movie <titre> — rechercher',
            '.movieinfo <titre|numéro> — détails',
            '.moviedl <titre|numéro> — liens fournis par l’API',
            '.moviepage <numéro|next|prev> — naviguer'
        ]
    }
];

function getMenuStats() {
    const totalCommands = commandSections.reduce((sum, section) => sum + section.commands.length, 0);
    return { totalCommands, totalSections: commandSections.length };
}

function getBotName() {
    return settings.botName || 'BestBot';
}

function getOwnerName() {
    return settings.botOwner || 'Best King';
}

function getVersion() {
    return settings.version || '3.3';
}

function findSection(query) {
    if (!query) return null;
    const normalized = String(query).trim().toLowerCase();
    return commandSections.find((section) =>
        section.id === normalized ||
        section.title.toLowerCase() === normalized ||
        section.aliases.includes(normalized)
    ) || null;
}

function formatSectionCard(section) {
    return [
        `╭─〔 ${String(section.number).padStart(2, '0')} ${section.title} 〕─╮`,
        `│ ${section.commands.length} commandes`,
        `│ .menu ${section.id}`,
        '╰────────────────────╯'
    ].join('\n');
}

function formatCommandList(section) {
    return section.commands
        .map((command, index) => `${String(index + 1).padStart(2, '0')} › ${command}`)
        .join('\n');
}

function getSectionIndex(section) {
    return commandSections.findIndex((item) => item.id === section.id);
}

function normalizeSectionIndex(index) {
    const parsed = Number.parseInt(index, 10);
    const safeIndex = Number.isFinite(parsed) ? parsed : 0;
    return ((safeIndex % commandSections.length) + commandSections.length) % commandSections.length;
}

function buildMenuCarouselPayload(index = 0) {
    const currentIndex = normalizeSectionIndex(index);
    const section = commandSections[currentIndex];
    const previousIndex = normalizeSectionIndex(currentIndex - 1);
    const nextIndex = normalizeSectionIndex(currentIndex + 1);

    return {
        text: [
            `✦ ${getBotName().toUpperCase()} OS · ${getVersion()} ✦`,
            '',
            `◈ MODULE ${String(currentIndex + 1).padStart(2, '0')} / ${String(commandSections.length).padStart(2, '0')}`,
            '',
            `${section.title}`,
            `${section.commands.length} COMMANDES`,
            '',
            'Choisissez un module :'
        ].join('\n'),
        footer: `${getOwnerName()} · ${getBotName()}`,
        buttons: [
            { buttonId: `.menu carousel ${previousIndex}`, buttonText: { displayText: '◀ PRÉCÉDENT' }, type: 1 },
            { buttonId: `.menu ${section.id}`, buttonText: { displayText: '◈ OUVRIR' }, type: 1 },
            { buttonId: `.menu carousel ${nextIndex}`, buttonText: { displayText: 'SUIVANT ▶' }, type: 1 }
        ],
        headerType: 1
    };
}

function buildSectionMenuPayload(section) {
    const index = getSectionIndex(section);
    return {
        text: [
            `✦ ${getBotName().toUpperCase()} / ${section.title} ✦`,
            '',
            `◈ MODULE ${String(section.number).padStart(2, '0')} / ${String(commandSections.length).padStart(2, '0')}`,
            '',
            `${section.commands.length} COMMANDES`,
            '──────────────────',
            '',
            formatCommandList(section),
            '',
            '──────────────────'
        ].join('\n'),
        footer: `${getOwnerName()} · ${getBotName()}`,
        buttons: [
            { buttonId: '.menu', buttonText: { displayText: '◀ TOUTES LES CATÉGORIES' }, type: 1 }
        ],
        headerType: 1
    };
}

function buildMenuPayload(query = '') {
    const parts = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return buildMenuButtonsPayload();
    if (parts[0]?.toLowerCase() === 'carousel') {
        return buildMenuCarouselPayload(parts[1]);
    }
    const section = findSection(parts.join(' '));
    return section ? buildSectionMenuPayload(section) : buildMenuButtonsPayload();
}

function buildMenuMessage(query = '') {
    return buildMenuPayload(query).text;
}

function buildMenuListPayload() {
    return {
        text: `✦ ${getBotName().toUpperCase()} OS · ${getVersion()} ✦\nMODULES / ${String(commandSections.length).padStart(2, '0')}\nChoisis une catégorie pour afficher ses commandes.`,
        footer: `${getOwnerName()} · ${getBotName()}`,
        title: 'NAVIGATEUR DE MODULES',
        buttonText: 'OUVRIR LES MODULES',
        sections: [
            {
                title: 'CATÉGORIES',
                rows: commandSections.map((section) => ({
                    title: `${String(section.number).padStart(2, '0')} · ${section.title}`,
                    description: `${section.commands.length} commandes · .menu ${section.id}`,
                    rowId: `.menu ${section.id}`
                }))
            }
        ]
    };
}

function buildAllCategoriesPayload() {
    const { totalCommands, totalSections } = getMenuStats();
    const lines = commandSections.map((section) =>
        `${String(section.number).padStart(2, '0')} › *${section.title}* (${section.commands.length})\n      ↳ .menu ${section.id}`
    );
    return {
        text: [
            `✦ ${getBotName().toUpperCase()} OS · ${getVersion()} ✦`,
            '',
            `◈ ${totalSections} CATÉGORIES · ${totalCommands} COMMANDES`,
            '──────────────────',
            '',
            lines.join('\n\n'),
            '',
            '──────────────────',
            'Tape *.menu <catégorie>* ou *.menu <numéro>* pour voir les commandes.',
            `${getOwnerName()} · ${getBotName()}`
        ].join('\n')
    };
}

function buildMenuButtonsPayload() {
    return buildAllCategoriesPayload();
}

module.exports = {
    commandSections,
    getMenuStats,
    findSection,
    buildMenuMessage,
    buildMenuPayload,
    buildMenuCarouselPayload,
    buildSectionMenuPayload,
    buildMenuListPayload,
    buildMenuButtonsPayload,
    buildAllCategoriesPayload
};
