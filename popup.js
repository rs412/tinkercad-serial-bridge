const baseUrlInput = document.getElementById('baseUrl');
const enableToggle = document.getElementById('enableToggle');
const saveBtn = document.getElementById('saveBtn');

// 默认配置
const DEFAULT_CONFIG = {
    baseUrl: 'http://localhost:8080',
    enabled: true
};

// 页面加载读取配置
async function loadConfig() {
    const config = await chrome.storage.local.get(DEFAULT_CONFIG);
    baseUrlInput.value = config.baseUrl;
    enableToggle.checked = config.enabled;
}

// 保存配置
async function saveConfig() {
    const baseUrl = baseUrlInput.value.trim() || DEFAULT_CONFIG.baseUrl;
    const enabled = enableToggle.checked;

    await chrome.storage.local.set({ baseUrl, enabled });
    saveBtn.textContent = 'Saved ✓';
    setTimeout(() => {
        saveBtn.textContent = 'Save Settings';
    }, 1000);
}

saveBtn.addEventListener('click', saveConfig);
loadConfig();