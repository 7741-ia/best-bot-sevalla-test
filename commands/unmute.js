async function unmuteCommand(sock, chatId) {
    await sock.groupSettingUpdate(chatId, 'not_announcement'); // Unmute the group
    await sock.sendMessage(chatId, { text: 'Le groupe n’est plus en sourdine.' });
}

module.exports = unmuteCommand;
