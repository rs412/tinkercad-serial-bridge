# tinkercad\-serial\-bridge

A lightweight Manifest V3 browser extension for bidirectional serial data communication with Tinkercad Arduino simulation\.

Supports custom server address and one\-click start/stop, with automatic configuration saving\.

---

## ✨ Features

- **Bidirectional Serial Communication**: Real\-time data interaction with Tinkercad Arduino simulation serial port

- **Custom Server Address**: Modify connection address freely according to usage scenarios

- **One\-Click Switch**: Instantly enable or disable communication function

- **Persistent Configuration**: Settings auto\-save and will not be lost after restart

- **Lightweight \& Stable**: Pure memory operation, no redundant cache

---

## 📦 Version

**v26\.6\.15**

---

## 📁 Project Structure

```Plain Text
tinkercad-serial-bridge/
├── manifest.json     # Extension core configuration
├── content.js        # Communication core logic
├── popup.html        # Settings popup UI
├── popup.js          # Configuration save/read logic
└── icon.png          # Extension icon

```

---

## 🔧 Installation Steps

1. Download or clone the project folder locally

2. Open Chrome / Edge extension management page

3. Turn on **Developer mode**

4. Click **Load unpacked**, select the project folder to complete installation

---

## ⚙️ Usage Guide

### 1\. Extension Configuration

Click the extension icon to open the settings panel:

- **Server URL**: Fill in the communication service address \(default: `http://localhost:8080`\)

- **Enable Bridge**: Toggle the switch to turn the communication function on or off

- Click **Save Settings** to take effect permanently

### 2\. Normal Use

Open and run your Tinkercad Arduino simulation\. When the extension is enabled, it will automatically perform bidirectional serial data transmission to realize linkage control of simulation equipment\.

---

## ✅ Advantages

- Simple operation, zero learning cost

- Flexible address configuration for different environments

- Smooth and stable operation

- Standard native browser extension, safe and reliable

---

## 📄 License

Open source for learning and personal use\.
