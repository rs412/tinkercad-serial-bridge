'use strict';

let BASE_URL = "http://localhost:8080";
let UPLOAD_API = BASE_URL + "/send";
let DOWNLOAD_API = BASE_URL + "/cmd";
let enabled = true;

let lastFullText = "";
let lastSendCmd = "";

// 读取全部配置
async function loadConfig() {
    const config = await chrome.storage.local.get({
        baseUrl: "http://localhost:8080",
        enabled: true
    });
    BASE_URL = config.baseUrl.trim();
    enabled = config.enabled;
    UPLOAD_API = `${BASE_URL}/send`;
    DOWNLOAD_API = `${BASE_URL}/cmd`;
}

// 串口数据上传
function uploadLatestLine() {
    // 每次执行都判断开关状态
    if (!enabled) return;

    const monitor = document.querySelector('div[class*="serial-monitor"]');
    if (!monitor) return;
    const currentFull = monitor.innerText;
    if (currentFull === lastFullText) return;

    lastFullText = currentFull;
    const lines = currentFull.split(/\r?\n/).filter(line => line.trim());
    if(lines.length === 0) return;
    const latestLine = lines[lines.length - 1];

    fetch(`${UPLOAD_API}?out=${encodeURIComponent(latestLine)}`, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
    }).catch(() => {});
}

// 获取并下发指令
function getCommand() {
    // 每次执行都判断开关状态
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

// 初始化 + 定时重载配置
(async function init() {
    await loadConfig();

    // 监听存储变化，实时更新
    chrome.storage.onChanged.addListener(async (changes) => {
        await loadConfig();
    });

    // 原有业务轮询
    setInterval(uploadLatestLine, 800);
    setInterval(getCommand, 2000);

    // 每秒重新读取配置
    setInterval(loadConfig, 1000);
})();