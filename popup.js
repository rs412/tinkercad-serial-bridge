const baseUrlInput = document.getElementById('baseUrl');
const uploadIntervalInput = document.getElementById('uploadInterval');
const cmdIntervalInput = document.getElementById('cmdInterval');
const enableToggle = document.getElementById('enableToggle');
const saveBtn = document.getElementById('saveBtn');

// 默认配置（保持原来默认值）
const DEFAULT_CONFIG = {
    baseUrl: 'http://localhost:8080',
    enabled: true,
    uploadInterval: 800,
    cmdInterval: 2000
};

// 页面加载读取配置并填充输入框
async function loadConfig() {
    const config = await chrome.storage.local.get(DEFAULT_CONFIG);
    baseUrlInput.value = config.baseUrl;
    uploadIntervalInput.value = config.uploadInterval;
    cmdIntervalInput.value = config.cmdInterval;
    enableToggle.checked = config.enabled;
}

// 保存配置到本地存储
async function saveConfig() {
    const baseUrl = baseUrlInput.value.trim() || DEFAULT_CONFIG.baseUrl;
    const uploadInterval = parseInt(uploadIntervalInput.value) || DEFAULT_CONFIG.uploadInterval;
    const cmdInterval = parseInt(cmdIntervalInput.value) || DEFAULT_CONFIG.cmdInterval;
    const enabled = enableToggle.checked;

    await chrome.storage.local.set({
        baseUrl,
        uploadInterval,
        cmdInterval,
        enabled
    });

    saveBtn.textContent = 'Saved ✓';
    setTimeout(() => {
        saveBtn.textContent = 'Save Settings';
    }, 1000);
}

saveBtn.addEventListener('click', saveConfig);
loadConfig();