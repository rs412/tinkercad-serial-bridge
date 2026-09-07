'use strict';

/**
 * Tinkercad Serial Bridge — 中转服务（示例）
 *
 * 接口：
 *   GET  /                  打开 LED 控制页面（led.html）
 *   GET  /led.html          同上
 *   GET  /send?out=<line>   推一条串口输出（原样中转）
 *   GET  /cmd               取出一条待发指令，队列为空返回空字符串
 *   POST /cmd               把指令放入队列（兼容纯文本与 {"cmd":...}）
 *   GET  /getLog            返回最新一条串口输出（兼容旧前端）
 *   GET  /log?n=50&since=0  返回 JSON 环形日志
 *   GET  /health            健康检查
 *
 * 用法：PORT=8080 node led.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const MAX_QUEUE = 200;   // 指令队列上限，超出丢弃最旧的
const MAX_LOG = 500;     // 串口日志环形缓冲条数

const cmdQueue = [];
const logBuffer = [];
let seq = 0;
let latest = '';
const startedAt = Date.now();

/* ------------------------------------------------------------------ 工具 */

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
}

function json(res, code, obj) {
    cors(res);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
}

function text(res, code, body) {
    cors(res);
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(body);
}

function pushLine(line) {
    const clean = String(line).replace(/\r$/, '').trim();
    if (!clean) return;
    seq += 1;
    latest = clean;
    logBuffer.push({ seq, ts: Date.now(), text: clean });
    if (logBuffer.length > MAX_LOG) logBuffer.shift();
}

function enqueue(cmd) {
    const clean = String(cmd).trim();
    if (!clean) return false;
    cmdQueue.push({ id: seq + Math.random(), ts: Date.now(), cmd: clean });
    if (cmdQueue.length > MAX_QUEUE) cmdQueue.shift();
    return true;
}

/** 兼容三种写法：纯文本、{"cmd":"..."}、{"led":"on"} 这类自定义结构 */
function extractCmd(rawBody) {
    const body = String(rawBody || '').trim();
    if (!body) return '';
    if (body[0] === '{') {
        try {
            const obj = JSON.parse(body);
            if (obj && typeof obj.cmd === 'string') return obj.cmd.trim();
        } catch (e) { /* 不是合法 JSON，按纯文本处理 */ }
    }
    return body;
}

/* --------------------------------------------------------------- 服务 */

const server = http.createServer((req, res) => {
    cors(res);

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const query = urlObj.searchParams;
    const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 静态文件：serve 控制页面（led.html）
    if (req.method === 'GET' && (pathname === '/' || pathname === '/led.html')) {
        try {
            const html = fs.readFileSync(path.join(__dirname, 'led.html'));
            cors(res);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        } catch (e) {
            text(res, 500, 'Failed to read led.html: ' + e.message);
        }
        return;
    }

    // 静默吞掉 favicon 请求，避免控制台噪音
    if (req.method === 'GET' && pathname === '/favicon.ico') {
        cors(res);
        res.writeHead(204);
        res.end();
        return;
    }

    // 上行：原样中转，每一行就是一个独立的 GET 请求
    if (pathname === '/send' && req.method === 'GET') {
        if (query.get('out')) pushLine(query.get('out'));
        text(res, 200, 'ok');
        return;
    }

    // 上行：批量 POST 不再支持（与新版插件协议保持一致）
    if (pathname === '/send' && req.method === 'POST') {
        text(res, 405, 'POST /send no longer supported, use GET /send?out=<line>');
        return;
    }

    // 下行：插件取指令
    if (pathname === '/cmd' && req.method === 'GET') {
        const item = cmdQueue.length > 0 ? cmdQueue.shift() : null;
        text(res, 200, item ? item.cmd : '');
        return;
    }

    // 下行：控件页下发指令
    if (pathname === '/cmd' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const cmd = extractCmd(body);
            if (cmd) enqueue(cmd);
            text(res, 200, 'ok');
        });
        return;
    }

    // 状态：兼容旧前端，返回最新一行原始文本
    if (pathname === '/getLog' && req.method === 'GET') {
        text(res, 200, latest);
        return;
    }

    // 状态：结构化环形日志
    if (pathname === '/log' && req.method === 'GET') {
        const n = Math.min(MAX_LOG, Math.max(1, Number(query.get('n')) || 50));
        const since = Number(query.get('since')) || 0;
        const lines = logBuffer.filter(l => l.seq > since).slice(-n);
        json(res, 200, { seq, latest, lines });
        return;
    }

    // 队列与日志的手动维护
    if (pathname === '/reset' && req.method === 'POST') {
        cmdQueue.length = 0;
        logBuffer.length = 0;
        latest = '';
        text(res, 200, 'ok');
        return;
    }

    if (pathname === '/health' && req.method === 'GET') {
        json(res, 200, {
            ok: true,
            uptime: Math.floor((Date.now() - startedAt) / 1000),
            port: PORT,
            queue: cmdQueue.length,
            seq,
            latest
        });
        return;
    }

    text(res, 404, 'Not Found');
});

server.listen(PORT, () => {
    console.log(`Bridge service listening on http://localhost:${PORT}`);
    console.log(`  · 控制页面: http://localhost:${PORT}/led.html`);
    console.log(`  · 健康检查: http://localhost:${PORT}/health`);
});
