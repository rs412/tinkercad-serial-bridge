'use strict';

const el = id => document.getElementById(id);

const baseUrlInput = el('baseUrl');
const uploadIntervalInput = el('uploadInterval');
const cmdIntervalInput = el('cmdInterval');
const lineFilterInput = el('lineFilter');
const enableToggle = el('enableToggle');
const monitorSelectorInput = el('monitorSelector');
const inputSelectorInput = el('inputSelector');
const sendSelectorInput = el('sendSelector');
const manualCmdInput = el('manualCmd');
const saveBtn = el('saveBtn');
const testBtn = el('testBtn');
const sendCmdBtn = el('sendCmdBtn');
const toast = el('toast');

const DEFAULT_CONFIG = {
    baseUrl: 'http://localhost:8080',
    enabled: true,
    uploadInterval: 800,
    cmdInterval: 2000,
    lineFilter: '',
    monitorSelector: '',
    inputSelector: '',
    sendSelector: ''
};

let toastTimer = null;

function showToast(msg, isError) {
    toast.textContent = msg || '';
    toast.className = isError ? 'toast error' : 'toast';
    if (toastTimer) clearTimeout(toastTimer);
    if (msg) {
        toastTimer = setTimeout(() => { toast.textContent = ''; }, 2600);
    }
}

function normalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return DEFAULT_CONFIG.baseUrl;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s.replace(/\/+$/, '');
}

function clampInt(v, min, max, fallback) {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/* ------------------------------------------------------------ 配置读写 */

async function loadConfig() {
    const stored = await chrome.storage.local.get({ bridgeConfig: null });
    const c = Object.assign({}, DEFAULT_CONFIG, stored.bridgeConfig || {});
    baseUrlInput.value = c.baseUrl;
    uploadIntervalInput.value = c.uploadInterval;
    cmdIntervalInput.value = c.cmdInterval;
    lineFilterInput.value = c.lineFilter;
    enableToggle.checked = Boolean(c.enabled);
    monitorSelectorInput.value = c.monitorSelector;
    inputSelectorInput.value = c.inputSelector;
    sendSelectorInput.value = c.sendSelector;
}

function collectConfig() {
    return {
        baseUrl: normalizeUrl(baseUrlInput.value),
        enabled: enableToggle.checked,
        uploadInterval: clampInt(uploadIntervalInput.value, 100, 60000, 800),
        cmdInterval: clampInt(cmdIntervalInput.value, 100, 60000, 2000),
        lineFilter: String(lineFilterInput.value || '').trim(),
        monitorSelector: String(monitorSelectorInput.value || '').trim(),
        inputSelector: String(inputSelectorInput.value || '').trim(),
        sendSelector: String(sendSelectorInput.value || '').trim()
    };
}

/** 非 localhost 的地址需要用户授权，必须在用户手势中申请 */
async function ensurePermission(url) {
    let origin;
    try { origin = new URL(url).origin; } catch (e) { return true; }
    if (/^(https?):\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    const has = await chrome.permissions.contains({ origins: [origin + '/*'] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [origin + '/*'] });
}

async function saveConfig() {
    const cfg = collectConfig();
    baseUrlInput.value = cfg.baseUrl;
    uploadIntervalInput.value = cfg.uploadInterval;
    cmdIntervalInput.value = cfg.cmdInterval;

    const granted = await ensurePermission(cfg.baseUrl);
    if (!granted) {
        showToast('未授权访问该地址，已保留 localhost 配置', true);
        return;
    }

    saveBtn.disabled = true;
    try {
        await chrome.runtime.sendMessage({ type: 'bridge:save', cfg });
        showToast('已保存并立即生效');
        refreshStatus(true);
    } catch (e) {
        showToast('保存失败：' + (e.message || e), true);
    }
    saveBtn.disabled = false;
}

/* -------------------------------------------------------------- 状态刷新 */

function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 1500) return '刚刚';
    if (diff < 60000) return Math.floor(diff / 1000) + 's 前';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min 前';
    return Math.floor(diff / 3600000) + 'h 前';
}

function setDot(node, cls) {
    node.className = 'dot' + (cls ? ' ' + cls : '');
}

async function refreshStatus(askBackground) {
    let status = null;
    if (askBackground) {
        try {
            const res = await chrome.runtime.sendMessage({ type: 'bridge:diag' });
            if (res && res.status) status = res.status;
            if (res && res.page) {
                const p = res.page;
                if (p.error) {
                    el('stDom').textContent = '无法探测';
                } else {
                    const mode = p.transport === 'direct' ? '页面直连' : '服务层';
                    el('stDom').textContent =
                        `监视器${p.hasMonitor ? '✓' : '✗'} 输入${p.hasInput ? '✓' : '✗'} 发送${p.hasSendButton ? '✓' : '✗'} · ${mode}`;
                }
            }
        } catch (e) { /* background 未就绪 */ }
    }
    if (!status) {
        const stored = await chrome.storage.local.get({ bridgeStatus: null });
        status = stored.bridgeStatus;
    }
    if (!status) {
        setDot(el('globalDot'), '');
        el('stServer').textContent = '未知';
        el('stPage').textContent = '未连接';
        return;
    }

    const liveTabs = (status.tabs || []).filter(t => Date.now() - t.lastSeen < 15000);
    const serverState = status.server === 'ok' ? 'ok' : (status.server === 'error' ? 'error' : '');
    setDot(el('globalDot'), serverState === 'ok' ? (liveTabs.length ? 'ok' : 'warn') : serverState);

    let serverText;
    if (status.server === 'ok') {
        serverText = '在线 · ' + (status.serverDetail || '');
    } else if (status.server === 'error') {
        serverText = '离线 · ' + (status.lastError || status.serverDetail || '连接失败');
    } else {
        serverText = '未知（还没访问过）';
    }
    el('stServer').textContent = serverText;

    el('stPage').textContent = liveTabs.length
        ? `已连接 ${liveTabs.length} 个标签页`
        : '未连接（请打开 Tinkercad 仿真）';

    el('stUp').textContent = status.lastUploadAt
        ? timeAgo(status.lastUploadAt) + ' · ' + (status.lastUploadText || '')
        : '—';
    el('stDown').textContent = status.lastCmdAt
        ? timeAgo(status.lastCmdAt) + ' · ' + (status.lastCmdText || '')
        : '—';
    el('stCount').textContent = `${status.uploadCount || 0} / ${status.cmdCount || 0}`;
}

/* ---------------------------------------------------------------- 事件 */

saveBtn.addEventListener('click', saveConfig);

testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.textContent = '测试中…';
    try {
        const res = await chrome.runtime.sendMessage({ type: 'bridge:test' });
        if (res && res.ok) showToast(`连接正常 (${res.ms}ms) ${res.detail || ''}`);
        else showToast('连接失败：' + ((res && res.error) || '未知错误'), true);
    } catch (e) {
        showToast('连接失败：' + (e.message || e), true);
    }
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
    refreshStatus(true);
});

sendCmdBtn.addEventListener('click', async () => {
    const cmd = String(manualCmdInput.value || '').trim();
    if (!cmd) { showToast('请输入要下发的指令', true); return; }
    sendCmdBtn.disabled = true;
    try {
        const res = await chrome.runtime.sendMessage({ type: 'bridge:sendCmd', cmd });
        if (res && res.ok) { showToast('已加入服务端队列'); manualCmdInput.value = ''; }
        else showToast('发送失败：' + ((res && res.error) || '未知错误'), true);
    } catch (e) {
        showToast('发送失败：' + (e.message || e), true);
    }
    sendCmdBtn.disabled = false;
});

loadConfig();
refreshStatus(true);
setInterval(() => refreshStatus(false), 900);
setInterval(() => refreshStatus(true), 3000);
