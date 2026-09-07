'use strict';

/**
 * content.js — Tinkercad 页面 DOM 层
 *
 * 只负责三件事：
 *   1. 找到串口监视器，增量抓新增行，交给 background 上传
 *   2. 向 background 要指令，写进串口输入框并发送
 *   3. 心跳注册 + 响应配置广播
 *
 * 正常走 background.js 统一出口；若 background 连续不可达，自动降级为页面内直连，
 * 行为与旧版插件一致。
 */

const HEARTBEAT_MS = 2000;
const MUTATION_DEBOUNCE = 120;
const MAX_TRACKED_LINES = 400;

let cfg = {
    enabled: true,
    baseUrl: 'http://localhost:8080',
    uploadInterval: 800,
    cmdInterval: 2000,
    lineFilter: '',
    monitorSelector: '',
    inputSelector: '',
    sendSelector: ''
};

let lastLines = [];
let monitorEl = null;
let uploadTimer = null;
let cmdTimer = null;
let heartbeatTimer = null;
let debounceTimer = null;
let pushBusy = false;
let cmdBusy = false;
let lastInputEl = null;
let lastDeliveredCmd = '';

/* ------------------------------------------------------------ 元素查找 */

function* documents() {
    yield document;
    for (const frame of document.querySelectorAll('iframe')) {
        try {
            if (frame.contentDocument) yield frame.contentDocument;
        } catch (e) { /* 跨域 iframe，跳过 */ }
    }
}

function deepQuery(selector) {
    for (const doc of documents()) {
        try {
            const el = doc.querySelector(selector);
            if (el) return el;
        } catch (e) { /* 无效选择器 */ }
    }
    return null;
}

const MONITOR_SELECTORS = [
    '[class*="serial-monitor"]',
    '[class*="SerialMonitor"]',
    '[class*="serial_monitor"]',
    '[class*="serialMonitor"]',
    '[data-testid*="serial-monitor"]',
    '[class*="monitor"]'
];

const INPUT_SELECTORS = [
    'input[class*="code_panel__serial__input"]',
    'input[class*="serial__input"]',
    'input[class*="serial-input"]',
    'input[class*="SerialInput"]'
];

const SEND_SELECTORS = [
    'a[data-event="serial-send"]',
    'button[data-event="serial-send"]',
    '[data-event="serial-send"]',
    'button[class*="serial__send"]',
    'button[class*="serial-send"]'
];

function pickFrom(list, custom) {
    if (custom) {
        const el = deepQuery(custom);
        if (el) return el;
    }
    for (const sel of list) {
        const el = deepQuery(sel);
        if (el) return el;
    }
    return null;
}

/** 兜底：在任意文档里找 type=text 且看起来属于串口面板的 input */
function guessSerialInput() {
    for (const doc of documents()) {
        const inputs = doc.querySelectorAll('input');
        for (const input of inputs) {
            if (input.type && input.type !== 'text') continue;
            if (input.disabled || input.readOnly) continue;
            const hint = (input.className || '') + ' ' + (input.placeholder || '') + ' ' +
                (input.getAttribute('aria-label') || '');
            if (/serial/i.test(hint)) return input;
        }
    }
    return null;
}

function findMonitor() {
    if (monitorEl && monitorEl.isConnected) return monitorEl;
    monitorEl = pickFrom(MONITOR_SELECTORS, cfg.monitorSelector);
    return monitorEl;
}

function findSerialInput() {
    const el = pickFrom(INPUT_SELECTORS, cfg.inputSelector) || guessSerialInput();
    if (el) lastInputEl = el;
    return el;
}

function findSendButton() {
    return pickFrom(SEND_SELECTORS, cfg.sendSelector);
}

/* -------------------------------------------------------- 串口文本增量 */

function readLines(el) {
    const text = el.innerText || el.textContent || '';
    return text.split(/\r?\n/).map(s => s.replace(/\s+$/, '')).filter(s => s.length > 0);
}

/**
 * 计算相对上一次快照新增的行。
 * 串口监视器会从顶部裁剪旧内容，所以不能简单用 startsWith 判断，
 * 这里从最长可能的重叠开始回溯匹配尾部。
 */
function diffNewLines(prev, cur) {
    if (!prev.length) return cur;
    if (!cur.length) return [];
    const max = Math.min(prev.length, cur.length);
    for (let k = max; k > 0; k--) {
        let matched = true;
        for (let i = 0; i < k; i++) {
            if (prev[prev.length - k + i] !== cur[i]) { matched = false; break; }
        }
        if (matched) return cur.slice(k);
    }
    return cur;
}

function applyFilter(lines) {
    const f = cfg.lineFilter;
    if (!f) return lines;
    return lines.filter(line => line.includes(f));
}

/**
 * 与 background 的通信通道。
 * background 不可用时（扩展重载后旧脚本残留、服务层异常等）自动降级为页面内直连，
 * 行为与旧版插件完全一致，保证桥接不会因为新增的服务层而整体失效。
 */
const BG_FAIL_THRESHOLD = 3;
const REQUEST_TIMEOUT = 5000;

let bgFailCount = 0;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

async function askBackground(msg) {
    try {
        const res = await withTimeout(chrome.runtime.sendMessage(msg), REQUEST_TIMEOUT);
        bgFailCount = 0;
        return res;
    } catch (e) {
        bgFailCount += 1;
        return null;
    }
}

function useDirect() {
    return bgFailCount >= BG_FAIL_THRESHOLD;
}

/* ------------------------------------------------------------ 上行逻辑 */

async function pushLinesDirect(lines) {
    for (const line of lines) {
        try {
            const res = await fetch(`${cfg.baseUrl}/send?out=${encodeURIComponent(line)}`, {
                method: 'GET',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
        } catch (e) {
            break;
        }
    }
}

/** 直连模式下 background 看不到收发情况，补一条上报让状态面板保持准确 */
function reportToBackground(cmd, lines) {
    if (!useDirect()) return;
    askBackground({ type: 'bridge:report', cmd: cmd || '', lines: lines || [] });
}

async function pushLines(lines) {
    if (pushBusy || !lines.length) return;
    pushBusy = true;
    try {
        if (useDirect()) {
            await pushLinesDirect(lines);
            reportToBackground('', lines);
        } else {
            const res = await askBackground({ type: 'bridge:push', lines });
            if (!res) {
                await pushLinesDirect(lines);
                reportToBackground('', lines);
            }
        }
    } finally {
        pushBusy = false;
    }
}

function uploadTick() {
    if (!cfg.enabled) return;
    const monitor = findMonitor();
    if (!monitor) return;

    const current = readLines(monitor);
    if (!current.length) { lastLines = []; return; }

    let fresh = diffNewLines(lastLines, current);
    lastLines = current.slice(-MAX_TRACKED_LINES);

    if (!fresh.length) return;
    if (fresh.length > 200) fresh = fresh.slice(-200);
    fresh = applyFilter(fresh);
    if (!fresh.length) return;

    pushLines(fresh);
}

/* ------------------------------------------------------------ 下行逻辑 */

/** React 受控组件必须用原型上的原生 setter 赋值，否则 onChange 不会触发 */
function setNativeValue(el, value) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
}

const SEND_SETTLE_MS = 300;

function writeSerialInput(input, cmd) {
    setNativeValue(input, cmd);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    try { input.focus(); } catch (e) { /* 忽略 */ }
}

function pressEnter(input) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    }));
    input.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    }));
}

function clickSend(input) {
    const btn = findSendButton();
    if (btn) {
        btn.click();
        return;
    }
    // 找不到发送按钮（选择器变了）时退化为回车
    if (input && input.isConnected) pressEnter(input);
}

/**
 * 写入并发送指令。
 *
 * 关键点：写完输入框之后必须等一轮再点发送按钮。React 的 state 更新是批处理的，
 * dispatchEvent 返回时 onChange 里的 setState 还没提交，立刻点击会让 onClick
 * 读到旧值（通常是空串），表现就是"输入框有字但发不出去"。原版用 300ms 等待，
 * 这里保持一致。
 */
function deliverCommand(cmd) {
    const input = findSerialInput();
    if (!input) return false;

    writeSerialInput(input, cmd);

    setTimeout(() => {
        // 若 React 重渲染把输入框重置为空，补写一次并再等一轮
        if (input.isConnected && !input.value) {
            writeSerialInput(input, cmd);
            setTimeout(() => clickSend(input), SEND_SETTLE_MS);
        } else {
            clickSend(input);
        }
    }, SEND_SETTLE_MS);

    lastDeliveredCmd = cmd;
    return true;
}

async function fetchCmdDirect() {
    const res = await fetch(`${cfg.baseUrl}/cmd`, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (await res.text()).trim();
}

async function cmdTick() {
    if (!cfg.enabled || cmdBusy) return;
    cmdBusy = true;
    try {
        let cmd = '';
        if (useDirect()) {
            cmd = await fetchCmdDirect().catch(() => '');
        } else {
            const res = await askBackground({ type: 'bridge:pollCmd' });
            if (res) {
                cmd = res.cmd ? String(res.cmd).trim() : '';
            } else {
                cmd = await fetchCmdDirect().catch(() => '');
            }
        }
        if (cmd) {
            deliverCommand(cmd);
            reportToBackground(cmd, []);
        }
    } finally {
        cmdBusy = false;
    }
}

/* ---------------------------------------------------------- 心跳与配置 */

async function heartbeat() {
    const res = await askBackground({
        type: 'bridge:hello',
        visible: document.visibilityState === 'visible'
    });
    if (res && res.cfg) applyConfig(res.cfg);
}

function applyConfig(next) {
    if (!next) return;
    const intervalChanged =
        next.uploadInterval !== cfg.uploadInterval ||
        next.cmdInterval !== cfg.cmdInterval;
    cfg = Object.assign({}, cfg, next);
    monitorEl = null;
    if (intervalChanged) restartTimers();
}

/* ---------------------------------------------------------- 定时器管理 */

function clearTimer(timer) {
    if (timer) clearInterval(timer);
    return null;
}

function restartTimers() {
    uploadTimer = clearTimer(uploadTimer);
    cmdTimer = clearTimer(cmdTimer);
    uploadTimer = setInterval(uploadTick, Math.max(100, cfg.uploadInterval));
    cmdTimer = setInterval(cmdTick, Math.max(100, cfg.cmdInterval));
}

function scheduleDebouncedUpload() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        uploadTick();
    }, MUTATION_DEBOUNCE);
}

/* -------------------------------------------------------------- 消息监听 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'bridge:config') {
        applyConfig(msg.cfg);
        sendResponse({ ok: true });
    } else if (msg.type === 'bridge:diag') {
        sendResponse({
            ok: true,
            url: location.href,
            hasMonitor: Boolean(findMonitor()),
            hasInput: Boolean(findSerialInput()),
            hasSendButton: Boolean(findSendButton()),
            lastLines: lastLines.slice(-5),
            lastDeliveredCmd,
            transport: useDirect() ? 'direct' : 'background',
            bgFailCount
        });
    }
    return false;
});

/* ---------------------------------------------------------------- 启动 */

(async function init() {
    const res = await askBackground({
        type: 'bridge:hello',
        visible: document.visibilityState === 'visible'
    });
    if (res && res.cfg) cfg = Object.assign({}, cfg, res.cfg);

    restartTimers();
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);

    // 串口监视器内容变化时立即上报，不等下一个轮询周期
    // 先确认监视器存在，避免在整个 Tinkercad 页面上做无意义的 innerText 读取
    const observer = new MutationObserver(() => {
        if (!cfg.enabled) return;
        if (!findMonitor()) return;
        scheduleDebouncedUpload();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('visibilitychange', heartbeat);
    window.addEventListener('beforeunload', () => observer.disconnect());
})();
