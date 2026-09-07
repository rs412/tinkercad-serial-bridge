'use strict';

/**
 * background.js — 桥接服务层
 *
 * 职责：
 *   1. 统一网络出口（所有对中转服务的请求都在这里发出，content script 只管 DOM）
 *   2. 多标签页 leader 选举，避免多个 Tinkercad 标签页互相抢 /cmd 队列
 *   3. 聚合运行状态并持久化，供 popup 展示
 *   4. 保存配置、向所有已连接的 content script 广播配置变更
 */

const DEFAULTS = {
    baseUrl: 'http://localhost:8080',
    enabled: true,
    uploadInterval: 800,
    cmdInterval: 2000,
    lineFilter: '',
    monitorSelector: '',
    inputSelector: '',
    sendSelector: ''
};

const TAB_TTL = 15000;        // 超过 15s 没有心跳的标签页视为已关闭
const STATUS_THROTTLE = 800;  // 状态写盘节流

let cfg = { ...DEFAULTS };
let tabs = {};                // tabId -> { id, url, visible, lastSeen }
let leaderId = null;

const status = {
    updatedAt: 0,
    server: 'unknown',        // ok | error | unknown
    serverDetail: '',
    uploadCount: 0,
    lastUploadAt: 0,
    lastUploadText: '',
    cmdCount: 0,
    lastCmdAt: 0,
    lastCmdText: '',
    lastError: '',
    lastErrorAt: 0,
    tabs: [],
    leaderId: null
};

let lastStatusWrite = 0;

/* ------------------------------------------------------------------ 工具 */

function clone(v) {
    return JSON.parse(JSON.stringify(v));
}

function normalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return DEFAULTS.baseUrl;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s.replace(/\/+$/, '');
}

function clampInt(v, min, max, fallback) {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function sanitizeCfg(input) {
    const c = { ...DEFAULTS, ...(input || {}) };
    c.baseUrl = normalizeUrl(c.baseUrl);
    c.enabled = Boolean(c.enabled);
    c.uploadInterval = clampInt(c.uploadInterval, 100, 60000, DEFAULTS.uploadInterval);
    c.cmdInterval = clampInt(c.cmdInterval, 100, 60000, DEFAULTS.cmdInterval);
    c.lineFilter = String(c.lineFilter || '').trim();
    c.monitorSelector = String(c.monitorSelector || '').trim();
    c.inputSelector = String(c.inputSelector || '').trim();
    c.sendSelector = String(c.sendSelector || '').trim();
    return c;
}

function api(path) {
    return cfg.baseUrl + path;
}

function now() {
    return Date.now();
}

function noteError(msg) {
    status.lastError = String(msg || '').slice(0, 300);
    status.lastErrorAt = now();
}

/* ------------------------------------------------------- 状态持久化/广播 */

async function persistStatus(force) {
    status.updatedAt = now();
    status.tabs = Object.values(tabs).map(t => ({
        id: t.id, url: t.url, visible: t.visible, lastSeen: t.lastSeen
    }));
    status.leaderId = leaderId;
    if (!force && now() - lastStatusWrite < STATUS_THROTTLE) return;
    lastStatusWrite = now();
    try {
        await chrome.storage.local.set({ bridgeStatus: clone(status) });
    } catch (e) { /* 忽略写盘失败 */ }
}

function broadcastToTabs(message) {
    for (const id of Object.keys(tabs)) {
        chrome.tabs.sendMessage(Number(id), message).catch(() => {});
    }
}

/* ------------------------------------------------------------ leader 选举 */

function pruneTabs() {
    const deadline = now() - TAB_TTL;
    for (const id of Object.keys(tabs)) {
        if (tabs[id].lastSeen < deadline) delete tabs[id];
    }
    if (leaderId != null && !tabs[leaderId]) leaderId = null;
}

function electLeader() {
    const list = Object.values(tabs);
    if (!list.length) { leaderId = null; return; }
    const visible = list.filter(t => t.visible);
    const pool = visible.length ? visible : list;
    pool.sort((a, b) => b.lastSeen - a.lastSeen);
    leaderId = pool[0].id;
}

function isLeader(tabId) {
    pruneTabs();
    if (leaderId == null || !tabs[leaderId]) electLeader();
    return tabId != null && tabId === leaderId;
}

/* -------------------------------------------------------------- 网络请求 */

async function request(url, options) {
    const res = await fetch(url, Object.assign({
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
    }, options || {}));
    return res;
}

/**
 * 上行：把新增的串口行原样推给中转服务。
 * 行为与原版一致 —— 一行就是一个独立的 GET /send?out=<line>，不做任何 JSON 包装。
 * 失败时只在第一行报错就停止后续，避免在服务端持续不可达时堆积请求。
 */
async function uploadLines(lines) {
    if (!lines.length) return { sent: 0 };

    let sent = 0;
    let lastError = '';
    for (const line of lines) {
        try {
            const res = await request(`${api('/send')}?out=${encodeURIComponent(line)}`, { method: 'GET' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            sent++;
        } catch (e) {
            lastError = e.message;
            break;
        }
    }
    if (sent > 0) {
        status.server = 'ok';
        status.serverDetail = 'GET /send?out=';
        status.uploadCount += sent;
        status.lastUploadAt = now();
        status.lastUploadText = lines[sent - 1].slice(0, 200);
    } else if (lastError) {
        status.server = 'error';
        status.serverDetail = 'GET /send';
        noteError(lastError);
    }
    return { sent };
}

/** 下行：拉取一条待发指令。只有 leader 标签页能取到，避免多标签互抢。 */
async function pollCmd(tabId) {
    if (!isLeader(tabId)) return { cmd: '', skipped: true };
    try {
        const res = await request(api('/cmd'), { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const cmd = (await res.text()).trim();
        status.server = 'ok';
        status.serverDetail = 'GET /cmd';
        if (cmd) {
            status.cmdCount += 1;
            status.lastCmdAt = now();
            status.lastCmdText = cmd.slice(0, 200);
        }
        return { cmd };
    } catch (e) {
        status.server = 'error';
        status.serverDetail = 'GET /cmd';
        noteError(e.message);
        return { cmd: '' };
    }
}

/** 手动下发：把指令塞进服务端队列（与控件页 POST /cmd 走同一条路径）。 */
async function enqueueCmd(cmd) {
    const text = String(cmd || '').trim();
    if (!text) return { ok: false, error: 'empty' };
    try {
        const res = await request(api('/cmd'), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: text
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        status.server = 'ok';
        status.serverDetail = 'POST /cmd';
        return { ok: true };
    } catch (e) {
        status.server = 'error';
        noteError(e.message);
        return { ok: false, error: e.message };
    }
}

/** 连通性自检：优先 /health，老服务端回退到 /cmd。 */
async function testConnection() {
    const started = Date.now();
    try {
        let res = await request(api('/health'), { method: 'GET' });
        if (res.ok) {
            let body = '';
            try { body = (await res.text()).slice(0, 300); } catch (e) { /* 空响应 */ }
            status.server = 'ok';
            status.serverDetail = '/health ' + body;
            return { ok: true, ms: Date.now() - started, detail: '/health ' + body };
        }
        if (res.status !== 404 && res.status !== 405) {
            throw new Error('HTTP ' + res.status);
        }
    } catch (e) {
        noteError(e.message);
        return { ok: false, ms: Date.now() - started, error: e.message };
    }

    try {
        const res = await request(api('/cmd'), { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        status.server = 'ok';
        status.serverDetail = '/cmd (legacy)';
        return { ok: true, ms: Date.now() - started, detail: '/cmd (legacy server)' };
    } catch (e) {
        status.server = 'error';
        noteError(e.message);
        return { ok: false, ms: Date.now() - started, error: e.message };
    }
}

/* ---------------------------------------------------------------- 初始化 */

async function loadConfig() {
    const stored = await chrome.storage.local.get({ bridgeConfig: null });
    cfg = sanitizeCfg(stored.bridgeConfig || {});
}

async function saveConfig(input) {
    cfg = sanitizeCfg(input);
    await chrome.storage.local.set({ bridgeConfig: clone(cfg) });
    broadcastToTabs({ type: 'bridge:config', cfg: clone(cfg) });
    return clone(cfg);
}

async function handle(msg, sender) {
    switch (msg && msg.type) {
        case 'bridge:hello': {
            const tabId = sender.tab && sender.tab.id;
            if (tabId != null) {
                tabs[tabId] = {
                    id: tabId,
                    url: (sender.tab && sender.tab.url) || '',
                    visible: Boolean(msg.visible),
                    lastSeen: now()
                };
                pruneTabs();
                electLeader();
            }
            persistStatus(false);
            return { ok: true, cfg: clone(cfg), leader: tabId != null && tabId === leaderId };
        }

        case 'bridge:push': {
            const lines = Array.isArray(msg.lines) ? msg.lines : [];
            const r = await uploadLines(lines);
            persistStatus(true);
            return { ok: r.sent > 0, sent: r.sent };
        }

        case 'bridge:pollCmd': {
            const tabId = sender.tab && sender.tab.id;
            const r = await pollCmd(tabId);
            persistStatus(false);
            return { ok: true, cmd: r.cmd, skipped: Boolean(r.skipped) };
        }

        case 'bridge:report': {
            // 页面降级为直连时，用它把收发情况同步回来，保证状态面板准确
            if (msg.cmd) {
                status.cmdCount += 1;
                status.lastCmdAt = now();
                status.lastCmdText = String(msg.cmd).slice(0, 200);
            }
            const lines = Array.isArray(msg.lines) ? msg.lines : [];
            if (lines.length) {
                status.uploadCount += lines.length;
                status.lastUploadAt = now();
                status.lastUploadText = String(lines[lines.length - 1]).slice(0, 200);
            }
            persistStatus(true);
            return { ok: true };
        }

        case 'bridge:status':
            pruneTabs();
            electLeader();
            persistStatus(true);
            return { ok: true, cfg: clone(cfg), status: clone(status) };

        case 'bridge:save': {
            const next = await saveConfig(msg.cfg);
            persistStatus(true);
            return { ok: true, cfg: next };
        }

        case 'bridge:test': {
            const r = await testConnection();
            persistStatus(true);
            return r;
        }

        case 'bridge:sendCmd': {
            const r = await enqueueCmd(msg.cmd);
            persistStatus(true);
            return r;
        }

        case 'bridge:diag': {
            pruneTabs();
            electLeader();
            let page = null;
            if (leaderId != null) {
                try {
                    page = await chrome.tabs.sendMessage(leaderId, { type: 'bridge:diag' });
                } catch (e) {
                    page = { error: String(e.message || e) };
                }
            }
            persistStatus(true);
            return { ok: true, cfg: clone(cfg), status: clone(status), page };
        }

        default:
            return { ok: false, error: 'unknown message: ' + (msg && msg.type) };
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    Promise.resolve()
        .then(() => handle(msg, sender))
        .then(res => { try { sendResponse(res); } catch (e) { /* 端口已关闭 */ } })
        .catch(err => {
            noteError(err && err.message || err);
            try { sendResponse({ ok: false, error: String(err && err.message || err) }); } catch (e) { /* 端口已关闭 */ }
        });
    return true; // 保持消息通道，异步回包
});

chrome.runtime.onStartup.addListener(() => { loadConfig(); });
chrome.runtime.onInstalled.addListener(() => { loadConfig(); });
chrome.tabs.onRemoved.addListener(tabId => {
    delete tabs[tabId];
    if (leaderId === tabId) leaderId = null;
    persistStatus(true);
});

loadConfig();
