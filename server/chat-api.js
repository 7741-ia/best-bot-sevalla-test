'use strict';

const http = require('http');
const { URL } = require('url');
const chatHandler = require('../api/chat');

const portValue = Number(process.env.CHAT_API_PORT || process.env.PORT || 8081);
const port = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535 ? portValue : 8081;
const MAX_BODY_BYTES = 16 * 1024;

function sendJson(response, statusCode, payload) {
    if (response.writableEnded) return;
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    if (requestUrl.pathname !== '/chat') {
        sendJson(response, 404, { status: false, error: 'Not Found' });
        return;
    }

    let body;
    if (request.method === 'POST') {
        const chunks = [];
        let received = 0;
        try {
            for await (const chunk of request) {
                received += chunk.length;
                if (received > MAX_BODY_BYTES) {
                    sendJson(response, 413, { status: false, error: 'Request too large' });
                    request.destroy();
                    return;
                }
                chunks.push(chunk);
            }
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
            sendJson(response, 400, { status: false, error: 'Invalid JSON body' });
            return;
        }
    }

    const adaptedRequest = {
        method: request.method,
        headers: request.headers,
        socket: request.socket,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        body
    };
    let statusCode = 200;
    const adaptedResponse = {
        status(code) { statusCode = code; return this; },
        json(payload) { sendJson(response, statusCode, payload); return this; }
    };

    try { await chatHandler(adaptedRequest, adaptedResponse); }
    catch { sendJson(response, 500, { status: false, error: 'Internal Server Error' }); }
});

server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.listen(port, '0.0.0.0', () => console.log(`[chat-api] listening on port ${port}`));
