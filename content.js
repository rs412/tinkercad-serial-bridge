'use strict';
let BASE_URL = "http://localhost:8080";
let UPLOAD_API = BASE_URL + "/send";
let DOWNLOAD_API = BASE_URL + "/cmd";
let enabled = true;
let uploadInterval = 800;
let cmdInterval = 2000;

let lastFullText = "";
let lastSendCmd = "";

let uploadTimer = null;
let cmdTimer = null;

// 仅读取配置变量，不重启定时器
async function loadConfigOnly() {
    const config = await chrome.storage.local.get({
        baseUrl: "http://localhost:8080",
        enabled: true,
        uploadInterval: 800,
        cmdInterval: 2000
    });
    BASE_URL = config.baseUrl.trim();
    enabled = config.enabled;
    uploadInterval = Number(config.uploadInterval);
    cmdInterval = Number(config.cmdInterval);
    UPLOAD_API = `${BASE_URL}/send`;
    DOWNLOAD_API = `${BASE_URL}/cmd`;
}

// 销毁旧定时器，新建（仅配置变更时调用）
function restartTimers() {
    if (uploadTimer) clearInterval(uploadTimer);
    if (cmdTimer) clearInterval(cmdTimer);
    uploadTimer = setInterval(uploadLatestLine, uploadInterval);
    cmdTimer = setInterval(getCommand, cmdInterval);
}

// 串口数据上传逻辑 完全未修改
function uploadLatestLine() {
    if (!enabled) return;
    const monitor = document.querySelector('div[class*="serial-monitor"]');
    if (!monitor) return;
    const currentFull = monitor.innerText;
    if (currentFull === lastFullText) return;
    lastFullText = currentFull;
    const lines = currentFull.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return;
    const latestLine = lines[lines.length - 1];
    fetch(`${UPLOAD_API}?out=${encodeURIComponent(latestLine)}`, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
    }).catch(() => {});
}

// 下发指令核心函数
function getCommand() {
    if (!enabled) return;
    fetch(DOWNLOAD_API, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
    })
    .then(res => res.text())
    .then(cmd => {
        cmd = cmd.trim();
        if (!cmd) return;
        lastSendCmd = cmd;
        const input = document.querySelector('input[class*="code_panel__serial__input"]');
        if (!input) return;
        input.value = cmd;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
        setTimeout(() => {
            const sendBtn = document.querySelector('a[data-event="serial-send"]');
            sendBtn && sendBtn.click();
        }, 300);
    })
    .catch(() => {});
}

(async function init() {
    // 1. 首次加载配置变量
    await loadConfigOnly();
    // 2. 初始化启动定时器
    restartTimers();

    // 仅当用户在弹窗保存配置（storage变化），才重载+重启定时器
    chrome.storage.onChanged.addListener(async () => {
        await loadConfigOnly();
        restartTimers();
    });

    // 每秒仅同步配置变量，不再销毁定时器
    setInterval(loadConfigOnly, 1000);
})();