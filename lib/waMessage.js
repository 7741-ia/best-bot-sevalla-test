function unwrapMessageContent(messageBody) {
    let current = messageBody || {};
    for (let depth = 0; depth < 8; depth += 1) {
        const nested = current.ephemeralMessage?.message ||
            current.viewOnceMessage?.message ||
            current.viewOnceMessageV2?.message ||
            current.viewOnceMessageV2Extension?.message ||
            current.documentWithCaptionMessage?.message;
        if (!nested || nested === current) break;
        current = nested;
    }
    return current;
}

module.exports = { unwrapMessageContent };
