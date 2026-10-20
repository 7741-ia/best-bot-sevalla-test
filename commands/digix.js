const { askAssistantReply } = require('../lib/chatAiRouter');
const { requestDigix, requestDigixText, requestDigixImage, requestDigixMedia } = require('../lib/digixApi');

function getRawText(message) {
    return message.message?.conversation?.trim() ||
        message.message?.extendedTextMessage?.text?.trim() ||
        message.message?.imageMessage?.caption?.trim() ||
        message.message?.videoMessage?.caption?.trim() ||
        '';
}

function getQuotedText(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return '';

    return (
        quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        quoted.imageMessage?.caption ||
        quoted.videoMessage?.caption ||
        quoted.documentMessage?.caption ||
        ''
    ).trim();
}

function splitPipeValues(text) {
    return String(text || '')
        .split('|')
        .map((part) => part.trim());
}

function resolveInput(text, message) {
    const value = String(text || '').trim();
    return value || getQuotedText(message);
}

function parseTranslateArgs(text) {
    const pipeValues = splitPipeValues(text);
    if (pipeValues.length > 1) {
        return {
            input: pipeValues[0] || '',
            to: pipeValues[1] || '',
            from: pipeValues[2] || 'auto'
        };
    }

    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
        return null;
    }

    const to = parts.pop();
    const from = parts.length > 1 ? parts.pop() : 'auto';
    return {
        input: parts.join(' '),
        to,
        from
    };
}

function parseCurrencyArgs(text) {
    const pipeValues = splitPipeValues(text);
    if (pipeValues.length > 1) {
        return {
            amount: pipeValues[0] || '',
            from: pipeValues[1] || '',
            to: pipeValues[2] || ''
        };
    }

    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 3) {
        return null;
    }

    return {
        amount: parts[0],
        from: parts[1],
        to: parts[2]
    };
}

function formatCodeBlock(code, language = 'html') {
    const cleaned = String(code || '').trim();
    if (!cleaned) return '';
    if (cleaned.startsWith('```')) return cleaned;
    return `\`\`\`${language}\n${cleaned}\n\`\`\``;
}

function formatTinfo(data, username) {
    const profile = data?.donnees?.profil || {};
    const stats = data?.donnees?.statistiques || {};
    const statEntries = Object.entries(stats)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

    return [
        `TikTok info for ${data?.utilisateur || username || 'unknown'}`,
        `Name: ${profile.nom || 'N/A'}`,
        `Username: ${profile.username || profile.nom || username || 'N/A'}`,
        `Verified: ${profile.verifie || 'N/A'}`,
        `Private: ${profile.prive || 'N/A'}`,
        `Joined: ${profile.date_inscription || 'N/A'}`,
        `Bio: ${data?.donnees?.bio || 'N/A'}`,
        statEntries ? `Stats:\n${statEntries}` : 'Stats: N/A'
    ].join('\n');
}

function formatInbox(payload) {
    const messages = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.messages)
            ? payload.messages
            : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.donnees)
                    ? payload.donnees
                    : [];

    if (!messages.length) {
        return 'Inbox empty.';
    }

    return messages.slice(0, 10).map((item, index) => {
        const subject = item?.subject || item?.objet || item?.title || 'No subject';
        const from = item?.from || item?.from_email || item?.email || item?.sender || 'Unknown sender';
        const date = item?.date || item?.received_at || item?.time || item?.created_at || 'Unknown date';
        const id = item?.id || item?.mail_id || item?.message_id || 'N/A';
        return [
            `${index + 1}. ${subject}`,
            `From: ${from}`,
            `Date: ${date}`,
            `ID: ${id}`
        ].join('\n');
    }).join('\n\n');
}

function buildHelp() {
    return [
        '*DIGIX COMMANDS*',
        '',
        'AI',
        '.digix ai <question>',
        '.digix copilot <question>',
        '.digix groq <question>',
        '.digix chatgptfree <question>',
        '.digix webcopilot <question>',
        '.digix venice <question>',
        '.digix codegen <description> | <language>',
        '.digix viralpost <platform> | <topic> | <style>',
        '.digix hackai <question>',
        '',
        'IMAGE',
        '.digix imagine <prompt>',
        '.digix image pornhub <text1> | <text2>',
        '',
        'CANVAS',
        '.digix canvas bonk <avatar1> | <avatar2>',
        '.digix canvas burn <avatar>',
        '.digix canvas horny <avatar>',
        '.digix canvas jo <image>',
        '.digix canvas fbpost <text> | <image> | <name> | <avatar> | <verified> | <time> | <likes> | <comments> | <shares> | <theme>',
        '.digix canvas greetings <type> | <avatar> | <guildIcon> | <bg> | <username> | <guildName> | <memberCount>',
        '.digix canvas greetings2 <type> | <avatar> | <username> | <bg> | <groupname> | <member>',
        '.digix canvas greetings3 <type> | <avatar> | <username> | <bg>',
        '.digix canvas welcard <name> | <author> | <server> | <thumbnail> | <color> | <brightness>',
        '.digix canvas xnxx <image> | <title>',
        '.digix canvas hacker <text>',
        '.digix canvas tvnews <headline> | <bg> | <ticker>',
        '.digix canvas snews <headline> | <name> | <pfp> | <bg>',
        '.digix canvas welcome <username> | <avatar_url> | <title> | <subtitle> | <footer> | <theme> | <bg_image>',
        '.digix canvas x <text> | <name> | <username> | <avatar_url> | <time> | <date> | <views> | <reposts> | <likes> | <bookmarks> | <verified> | <theme>',
        '.digix canvas patrick <avatar>',
        '',
        'RANDOM',
        '.digix random bluearchive',
        '.digix random cosplay',
        '.digix random loli',
        '',
        'DOWNLOAD',
        '.digix download fbdl <url>',
        '.digix download fbdlv2 <url>',
        '.digix download sp-dl <url>',
        '.digix download spdlv2 <url>',
        '.digix download thrdsdl <url>',
        '.digix download tikdl <url>',
        '.digix download xdl <url>',
        '.digix download xdlv2 <url>',
        '',
        'SEARCH',
        '.digix search lyrics <artist> | <song>',
        '.digix search lyricsv2 <title>',
        '.digix search tinfo <username>',
        '.digix search weather <city>',
        '',
        'TOOLS',
        '.digix tools translate <text> | <to> | <from>',
        '.digix tools pastebin <text>',
        '.digix tools currency <amount> | <from> | <to>',
        '.digix tools carbon <code> | <theme> | <bgColor> | <language>',
        '',
        'TEMPMAIL',
        '.digix tempmail gen',
        '.digix tempmail inbox <login> | <domaine>',
        '.digix tempmail read <login> | <domaine> | <id>'
    ].join('\n');
}

async function sendText(sock, chatId, message, text) {
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function sendImage(sock, chatId, message, buffer, caption = '') {
    await sock.sendMessage(chatId, {
        image: buffer,
        caption
    }, { quoted: message });
}

async function sendVideoByUrl(sock, chatId, message, url, caption = '') {
    await sock.sendMessage(chatId, {
        video: { url },
        mimetype: 'video/mp4',
        caption
    }, { quoted: message });
}

async function sendAudioByUrl(sock, chatId, message, url, caption = '') {
    await sock.sendMessage(chatId, {
        audio: { url },
        mimetype: 'audio/mpeg',
        fileName: 'digix-audio.mp3'
    }, { quoted: message });
}

function isAudioUrl(url) {
    return /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(String(url || ''));
}

function isImageUrl(url) {
    return /\.(png|jpe?g|webp|gif)$/i.test(String(url || ''));
}

function formatTranslate(data) {
    const original = data?.original || {};
    const translated = data?.traduit || {};
    return [
        `From: ${original.langue || 'N/A'}`,
        `Text: ${original.texte || 'N/A'}`,
        `To: ${translated.langue || 'N/A'}`,
        `Translation: ${translated.texte || 'N/A'}`,
        data?.message ? `Note: ${data.message}` : ''
    ].filter(Boolean).join('\n');
}

function formatCurrency(data) {
    const conversion = data?.conversion || {};
    return [
        `Amount: ${conversion.montant_initial || 'N/A'} ${conversion.devise_source || ''}`.trim(),
        `Result: ${conversion.montant_final || 'N/A'} ${conversion.devise_cible || ''}`.trim(),
        `Rate: ${conversion.taux_change || 'N/A'}`,
        data?.message ? `Note: ${data.message}` : ''
    ].filter(Boolean).join('\n');
}

function formatPastebin(data) {
    const pasteUrl = data?.donnees?.url_paste || data?.url_paste || data?.paste_url || '';
    const rawUrl = data?.donnees?.url_brute || data?.url_brute || data?.raw_url || '';
    return [
        pasteUrl ? `Paste: ${pasteUrl}` : '',
        rawUrl ? `Raw: ${rawUrl}` : '',
        data?.message ? `Note: ${data.message}` : ''
    ].filter(Boolean).join('\n');
}

function formatTempMail(data) {
    const email = data?.donnees?.email || data?.data?.email || data?.email || '';
    const login = data?.donnees?.login || data?.data?.login || data?.login || '';
    const domaine = data?.donnees?.domaine || data?.data?.domaine || data?.domaine || '';
    return [
        email ? `Email: ${email}` : '',
        login ? `Login: ${login}` : '',
        domaine ? `Domain: ${domaine}` : '',
        data?.message ? `Note: ${data.message}` : ''
    ].filter(Boolean).join('\n');
}

async function handleCanvas(sock, chatId, message, canvasSub, canvasArgs) {
    switch (canvasSub) {
        case 'bonk': {
            const values = splitPipeValues(canvasArgs);
            const fallbackValues = values.length > 1 ? values : canvasArgs.split(/\s+/).filter(Boolean);
            const avatar1 = fallbackValues[0];
            const avatar2 = fallbackValues[1];
            if (!avatar1 || !avatar2) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas bonk <avatar1> | <avatar2>');
                return;
            }

            const { buffer } = await requestDigixImage('/canvas/bonk', { avatar1, avatar2 }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'hacker': {
            const text = resolveInput(canvasArgs, message);
            if (!text) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas hacker <text>');
                return;
            }

            const { buffer } = await requestDigixImage('/canvas/hacker', { text }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'tvnews': {
            const values = splitPipeValues(canvasArgs);
            const headline = values[0];
            const bg = values[1];
            const ticker = values[2] || '';
            if (!headline || !bg) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas tvnews <headline> | <bg> | <ticker>');
                return;
            }

            const { buffer } = await requestDigixImage('/canvas/tvnews', { headline, bg, ticker }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'snews': {
            const values = splitPipeValues(canvasArgs);
            const headline = values[0];
            const name = values[1];
            const pfp = values[2];
            const bg = values[3];
            if (!headline || !name || !pfp || !bg) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas snews <headline> | <name> | <pfp> | <bg>');
                return;
            }

            const { buffer } = await requestDigixImage('/canvas/snews', { headline, name, pfp, bg }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'welcome': {
            const values = splitPipeValues(canvasArgs);
            const username = values[0];
            const avatar_url = values[1];
            const title = values[2];
            const subtitle = values[3];
            const footer = values[4];
            const theme = values[5] || '#6366f1';
            const bg_image = values[6] || '';
            if (!username || !avatar_url || !title || !subtitle || !footer) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas welcome <username> | <avatar_url> | <title> | <subtitle> | <footer> | <theme> | <bg_image>');
                return;
            }

            const { buffer } = await requestDigixImage('/canvas/welcome', {
                username,
                avatar_url,
                title,
                subtitle,
                footer,
                theme,
                bg_image
            }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'x': {
            const values = splitPipeValues(canvasArgs);
            if (values.length < 4) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas x <text> | <name> | <username> | <avatar_url> | <time> | <date> | <views> | <reposts> | <likes> | <bookmarks> | <verified> | <theme>');
                return;
            }

            const [text, name, username, avatar_url, time = '', date = '', views = '', reposts = '', likes = '', bookmarks = '', verified = 'true', theme = 'dark'] = values;
            const { buffer } = await requestDigixImage('/canvas/x', {
                text,
                name,
                username,
                avatar_url,
                time,
                date,
                views,
                reposts,
                likes,
                bookmarks,
                verified,
                theme
            }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'patrick': {
            const avatar = resolveInput(canvasArgs, message);
            if (!avatar) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas patrick <avatar>');
                return;
            }

            const { buffer } = await requestDigixImage('/canvas/patrick', { avatar }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'burn':
        case 'horny': {
            const avatar = resolveInput(canvasArgs, message);
            if (!avatar) {
                await sendText(sock, chatId, message, `Utilisation : .digix canvas ${canvasSub} <avatar>`);
                return;
            }
            const { buffer } = await requestDigixImage(`/canvas/${canvasSub}`, { avatar }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'jo': {
            const image = resolveInput(canvasArgs, message);
            if (!image) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas jo <image>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/jo', { image }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'xnxx': {
            const values = splitPipeValues(canvasArgs);
            const image = values[0];
            const title = values[1];
            if (!image || !title) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas xnxx <image> | <title>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/xnxx', { image, title }, { timeout: 30000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'fbpost': {
            const v = splitPipeValues(canvasArgs);
            const [text, image = '', name = '', avatar = '', verified = 'true', time = '', likes = '', comments = '', shares = '', theme = 'light'] = v;
            if (!text) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas fbpost <text> | <image> | <name> | <avatar> | <verified> | <time> | <likes> | <comments> | <shares> | <theme>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/fbpost', { text, image, name, avatar, verified, time, likes, comments, shares, theme }, { timeout: 60000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'greetings': {
            const v = splitPipeValues(canvasArgs);
            const [type, avatar, guildIcon, bg, username, guildName, memberCount] = v;
            if (!type || !avatar || !guildIcon || !bg || !username || !guildName || !memberCount) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas greetings <type> | <avatar> | <guildIcon> | <bg> | <username> | <guildName> | <memberCount>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/greetings', { type, avatar, guildIcon, bg, username, guildName, memberCount }, { timeout: 60000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'greetings2': {
            const v = splitPipeValues(canvasArgs);
            const [type, avatar, username, bg, groupname = '', member] = v;
            if (!type || !avatar || !username || !bg || !member) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas greetings2 <type> | <avatar> | <username> | <bg> | <groupname> | <member>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/greetings2', { type, avatar, username, bg, groupname, member }, { timeout: 60000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'greetings3': {
            const v = splitPipeValues(canvasArgs);
            const [type, avatar, username, bg = ''] = v;
            if (!type || !avatar || !username) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas greetings3 <type> | <avatar> | <username> | <bg>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/greetings3', { type, avatar, username, bg }, { timeout: 60000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        case 'welcard': {
            const v = splitPipeValues(canvasArgs);
            const [name, author, server, thumbnail, color = '#6366f1', brightness = '0.5'] = v;
            if (!name || !author || !server || !thumbnail) {
                await sendText(sock, chatId, message, 'Utilisation : .digix canvas welcard <name> | <author> | <server> | <thumbnail> | <color> | <brightness>');
                return;
            }
            const { buffer } = await requestDigixImage('/canvas/welcard', { name, author, server, thumbnail, color, brightness }, { timeout: 60000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        default:
            await sendText(sock, chatId, message, 'Utilisation : .digix canvas bonk|burn|horny|jo|xnxx|fbpost|greetings|greetings2|greetings3|welcard|hacker|tvnews|snews|welcome|x|patrick');
    }
}

async function handleDownload(sock, chatId, message, downloadSub, downloadUrl) {
    if (!downloadUrl) {
        await sendText(sock, chatId, message, `Utilisation : .digix download ${downloadSub} <url>`);
        return;
    }

    const validUrl = String(downloadUrl).trim();
    if (!/^https?:\/\//i.test(validUrl)) {
        await sendText(sock, chatId, message, 'Indique un lien http ou https valide.');
        return;
    }

    const endpoint = `/downloader/${downloadSub}`;
    const { url } = await requestDigixMedia(endpoint, { url: validUrl }, { timeout: 60000 });

    if (isAudioUrl(url) || downloadSub === 'sp-dl' || downloadSub === 'spdlv2') {
        await sendAudioByUrl(sock, chatId, message, url, `Digix ${downloadSub}`);
        return;
    }

    if (isImageUrl(url)) {
        await sock.sendMessage(chatId, {
            image: { url },
            caption: `Digix ${downloadSub}`
        }, { quoted: message });
        return;
    }

    await sendVideoByUrl(sock, chatId, message, url, `Digix ${downloadSub}`);
}

async function handleSearch(sock, chatId, message, searchSub, queryText) {
    switch (searchSub) {
        case 'lyrics': {
            const values = splitPipeValues(queryText);
            if (values[0] && values[1]) {
                const data = await requestDigix('/search/lyrics', {
                    artist: values[0],
                    song: values[1]
                }, { timeout: 30000 });

                const lyrics = data?.paroles || data?.lyrics || data?.result || data?.message || '';
                await sendText(sock, chatId, message, String(lyrics || 'No lyrics found.'));
                return;
            }

            const fallbackTitle = resolveInput(queryText, message);
            if (!fallbackTitle) {
                await sendText(sock, chatId, message, 'Utilisation : .digix search lyrics <artist> | <song>');
                return;
            }

            const text = await requestDigixText('/search/lyricsv2', { title: fallbackTitle }, { timeout: 30000 });
            await sendText(sock, chatId, message, text);
            return;
        }
        case 'lyricsv2': {
            const title = resolveInput(queryText, message);
            if (!title) {
                await sendText(sock, chatId, message, 'Utilisation : .digix search lyricsv2 <title>');
                return;
            }

            const text = await requestDigixText('/search/lyricsv2', { title }, { timeout: 30000 });
            await sendText(sock, chatId, message, text);
            return;
        }
        case 'tinfo': {
            const username = resolveInput(queryText, message);
            if (!username) {
                await sendText(sock, chatId, message, 'Utilisation : .digix search tinfo <username>');
                return;
            }

            const data = await requestDigix('/search/tinfo', { username }, { timeout: 30000 });
            await sendText(sock, chatId, message, formatTinfo(data, username));
            return;
        }
        case 'weather': {
            const city = resolveInput(queryText, message);
            if (!city) {
                await sendText(sock, chatId, message, 'Utilisation : .digix search weather <city>');
                return;
            }

            const data = await requestDigix('/search/wther', { city }, { timeout: 30000 });
            await sendText(sock, chatId, message, [
                `City: ${data?.ville || city}`,
                `Temperature: ${data?.temperature || 'N/A'}`,
                `Condition: ${data?.condition || 'N/A'}`,
                `Humidity: ${data?.humidite || 'N/A'}`,
                `Wind: ${data?.vent || 'N/A'}`
            ].join('\n'));
            return;
        }
        default:
            await sendText(sock, chatId, message, 'Utilisation : .digix search lyrics|lyricsv2|tinfo|weather');
    }
}

async function handleTools(sock, chatId, message, toolSub, toolText) {
    switch (toolSub) {
        case 'translate': {
            const parsed = parseTranslateArgs(toolText);
            if (!parsed || !parsed.input || !parsed.to) {
                await sendText(sock, chatId, message, 'Utilisation : .digix tools translate <text> | <to> | <from>');
                return;
            }

            const data = await requestDigix('/tools/translate', {
                text: parsed.input,
                to: parsed.to,
                from: parsed.from || 'auto'
            }, { timeout: 30000 });

            await sendText(sock, chatId, message, formatTranslate(data));
            return;
        }
        case 'pastebin': {
            const text = resolveInput(toolText, message);
            if (!text) {
                await sendText(sock, chatId, message, 'Utilisation : .digix tools pastebin <text>');
                return;
            }

            const data = await requestDigix('/tools/pastebin', { text }, { timeout: 30000 });
            await sendText(sock, chatId, message, formatPastebin(data));
            return;
        }
        case 'currency': {
            const parsed = parseCurrencyArgs(toolText);
            if (!parsed || !parsed.amount || !parsed.from || !parsed.to) {
                await sendText(sock, chatId, message, 'Utilisation : .digix tools currency <amount> | <from> | <to>');
                return;
            }

            const data = await requestDigix('/tools/currency', {
                amount: parsed.amount,
                from: parsed.from,
                to: parsed.to
            }, { timeout: 30000 });

            await sendText(sock, chatId, message, formatCurrency(data));
            return;
        }
        case 'carbon': {
            const values = splitPipeValues(toolText);
            const code = values[0];
            const theme = values[1] || 'dracula';
            const bgColor = values[2] || '#1a1a1a';
            const language = values[3] || 'javascript';
            if (!code) {
                await sendText(sock, chatId, message, 'Utilisation : .digix tools carbon <code> | <theme> | <bgColor> | <language>');
                return;
            }

            const { buffer } = await requestDigixImage('/tools/carbon', {
                code,
                theme,
                bgColor,
                language
            }, { timeout: 60000 });
            await sendImage(sock, chatId, message, buffer);
            return;
        }
        default:
            await sendText(sock, chatId, message, 'Utilisation : .digix tools translate|pastebin|currency|carbon');
    }
}

async function handleTempMail(sock, chatId, message, tempSub, tempText) {
    switch (tempSub) {
        case 'gen': {
            const data = await requestDigix('/tempmail/gen', {}, { timeout: 30000 });
            await sendText(sock, chatId, message, formatTempMail(data));
            return;
        }
        case 'inbox': {
            const values = splitPipeValues(tempText);
            const login = values[0] || '';
            const domaine = values[1] || '';
            if (!login || !domaine) {
                await sendText(sock, chatId, message, 'Utilisation : .digix tempmail inbox <login> | <domaine>');
                return;
            }

            const data = await requestDigix('/tempmail/inbox', { login, domaine }, { timeout: 30000 });
            await sendText(sock, chatId, message, formatInbox(data));
            return;
        }
        case 'read': {
            const values = splitPipeValues(tempText);
            const login = values[0] || '';
            const domaine = values[1] || '';
            const id = values[2] || '';
            if (!login || !domaine || !id) {
                await sendText(sock, chatId, message, 'Utilisation : .digix tempmail read <login> | <domaine> | <id>');
                return;
            }

            const data = await requestDigix('/tempmail/Read', { login, domaine, id }, { timeout: 30000 });
            const text = [
                data?.message ? `Note: ${data.message}` : '',
                data?.donnees?.body || data?.body || data?.content || data?.text || data?.message || JSON.stringify(data, null, 2)
            ].filter(Boolean).join('\n\n');
            await sendText(sock, chatId, message, text);
            return;
        }
        default:
            await sendText(sock, chatId, message, 'Utilisation : .digix tempmail gen|inbox|read');
    }
}

async function digixCommand(sock, chatId, message) {
    try {
        const rawText = getRawText(message);
        const parts = rawText.trim().split(/\s+/);
        const sub = (parts[1] || '').toLowerCase();
        const restText = parts.slice(2).join(' ').trim();

        if (!sub || sub === 'help' || sub === 'menu' || sub === 'status') {
            await sendText(sock, chatId, message, buildHelp());
            return;
        }

        await sock.sendMessage(chatId, {
            react: { text: '⚡', key: message.key }
        });

        switch (sub) {
            case 'ai':
            case 'chat':
            case 'ask': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix ai <question>');
                    return;
                }

                const answer = await askAssistantReply(query, {
                    personaName: 'Digix Assistant',
                    creatorName: 'DigiX',
                    extraInstructions: 'Reply naturally and keep it useful.'
                });

                await sendText(sock, chatId, message, answer || 'No answer available right now.');
                return;
            }
            case 'copilot': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix copilot <question>');
                    return;
                }

                const answer = await requestDigixText('/ia/copilot', {
                    message: query,
                    model: 'default'
                }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'groq': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix groq <question>');
                    return;
                }

                const answer = await requestDigixText('/ia/groq', { question: query }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'chatgptfree':
            case 'chatgpt': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix chatgptfree <question>');
                    return;
                }

                const answer = await requestDigixText('/ia/chatgptfree', {
                    prompt: query,
                    model: 'chatgpt4'
                }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'webcopilot': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix webcopilot <question>');
                    return;
                }

                const answer = await requestDigixText('/ia/webcopilot', { question: query }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'venice': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix venice <question>');
                    return;
                }

                const answer = await requestDigixText('/ia/venice', {
                    question: query,
                    systemPrompt: 'You are a helpful WhatsApp assistant. Reply naturally and avoid saying that the owner is unavailable.'
                }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'hackai': {
                const query = resolveInput(restText, message);
                if (!query) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix hackai <question>');
                    return;
                }
                const answer = await requestDigixText('/ia/hackai', { question: query }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'random': {
                const sub = (restText.trim().split(/\s+/)[0] || '').toLowerCase();
                if (!['bluearchive', 'cosplay', 'loli'].includes(sub)) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix random <bluearchive|cosplay|loli>');
                    return;
                }
                try {
                    const { buffer, mimeType } = await requestDigixImage(`/random/${sub}`, {}, { timeout: 45000 });
                    if (mimeType && mimeType.startsWith('video/')) {
                        await sock.sendMessage(chatId, { video: buffer, mimetype: mimeType }, { quoted: message });
                    } else {
                        await sendImage(sock, chatId, message, buffer, `Random ${sub}`);
                    }
                } catch {
                    const { url } = await requestDigixMedia(`/random/${sub}`, {}, { timeout: 45000 });
                    if (/\.(mp4|webm|mov)$/i.test(url)) {
                        await sendVideoByUrl(sock, chatId, message, url, `Random ${sub}`);
                    } else {
                        await sock.sendMessage(chatId, { image: { url }, caption: `Random ${sub}` }, { quoted: message });
                    }
                }
                return;
            }
            case 'image': {
                const parts2 = restText.trim().split(/\s+/);
                const sub = (parts2[0] || '').toLowerCase();
                const args = parts2.slice(1).join(' ').trim();
                if (sub === 'pornhub') {
                    const v = splitPipeValues(args);
                    const text1 = v[0], text2 = v[1];
                    if (!text1 || !text2) {
                        await sendText(sock, chatId, message, 'Utilisation : .digix image pornhub <text1> | <text2>');
                        return;
                    }
                    const { buffer } = await requestDigixImage('/image/pornhub', { text1, text2 }, { timeout: 30000 });
                    await sendImage(sock, chatId, message, buffer);
                    return;
                }
                await sendText(sock, chatId, message, 'Utilisation : .digix image pornhub <text1> | <text2>');
                return;
            }
            case 'codegen': {
                const values = splitPipeValues(restText);
                const description = resolveInput(values[0] || restText, message);
                const language = values[1] || 'html';
                if (!description) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix codegen <description> | <language>');
                    return;
                }

                const code = await requestDigixText('/ia/codegen', {
                    description,
                    langage: language
                }, { timeout: 60000 });

                await sendText(sock, chatId, message, formatCodeBlock(code, language));
                return;
            }
            case 'imagine':
            case 'image': {
                const prompt = resolveInput(restText, message);
                if (!prompt) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix imagine <prompt>');
                    return;
                }

                const { buffer } = await requestDigixImage('/ia/imagine', {
                    prompt,
                    width: 1024,
                    height: 1024,
                    model: 'flux'
                }, { timeout: 60000 });

                await sendImage(sock, chatId, message, buffer, `Prompt: ${prompt}`);
                return;
            }
            case 'viralpost': {
                const values = splitPipeValues(restText);
                const platform = values[0];
                const topic = values[1];
                const style = values[2];
                if (!platform || !topic || !style) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix viralpost <platform> | <topic> | <style>');
                    return;
                }

                const answer = await requestDigixText('/ia/viralpost', {
                    platform,
                    topic,
                    style
                }, { timeout: 30000 });
                await sendText(sock, chatId, message, answer);
                return;
            }
            case 'canvas': {
                const canvasParts = restText.trim().split(/\s+/);
                const canvasSub = (canvasParts[0] || '').toLowerCase();
                const canvasArgs = canvasParts.slice(1).join(' ').trim();
                if (!canvasSub) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix canvas bonk|hacker|tvnews|snews|welcome|x|patrick');
                    return;
                }
                await handleCanvas(sock, chatId, message, canvasSub, canvasArgs);
                return;
            }
            case 'download': {
                const downloadParts = restText.trim().split(/\s+/);
                const downloadSub = (downloadParts[0] || '').toLowerCase();
                const downloadUrl = downloadParts.slice(1).join(' ').trim() || resolveInput(restText.replace(downloadSub, '').trim(), message);
                if (!downloadSub) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix download <fbdl|fbdlv2|sp-dl|spdlv2|thrdsdl|tikdl|xdl|xdlv2> <url>');
                    return;
                }

                if (!['fbdl', 'fbdlv2', 'sp-dl', 'spdlv2', 'thrdsdl', 'tikdl', 'xdl', 'xdlv2'].includes(downloadSub)) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix download <fbdl|fbdlv2|sp-dl|spdlv2|thrdsdl|tikdl|xdl|xdlv2> <url>');
                    return;
                }

                await handleDownload(sock, chatId, message, downloadSub, downloadUrl);
                return;
            }
            case 'search': {
                const searchParts = restText.trim().split(/\s+/);
                const searchSub = (searchParts[0] || '').toLowerCase();
                const searchText = searchParts.slice(1).join(' ').trim();
                if (!searchSub) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix search lyrics|lyricsv2|tinfo|weather');
                    return;
                }

                await handleSearch(sock, chatId, message, searchSub, searchText);
                return;
            }
            case 'tools': {
                const toolParts = restText.trim().split(/\s+/);
                const toolSub = (toolParts[0] || '').toLowerCase();
                const toolText = toolParts.slice(1).join(' ').trim();
                if (!toolSub) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix tools translate|pastebin|currency|carbon');
                    return;
                }

                await handleTools(sock, chatId, message, toolSub, toolText);
                return;
            }
            case 'tempmail': {
                const tempParts = restText.trim().split(/\s+/);
                const tempSub = (tempParts[0] || '').toLowerCase();
                const tempText = tempParts.slice(1).join(' ').trim();
                if (!tempSub) {
                    await sendText(sock, chatId, message, 'Utilisation : .digix tempmail gen|inbox|read');
                    return;
                }

                await handleTempMail(sock, chatId, message, tempSub, tempText);
                return;
            }
            default:
                await sendText(sock, chatId, message, buildHelp());
        }
    } catch (error) {
        console.error('Digix command error:', error);
        await sendText(sock, chatId, message, `Digix error: ${error.message || 'unknown error'}`);
    }
}

module.exports = digixCommand;
