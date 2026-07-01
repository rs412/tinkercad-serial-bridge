# Tinkercad Serial Bridge

一款轻量 MV3 浏览器插件，专为 Tinkercad Arduino 仿真实现双向串口数据通信。

支持自定义通信地址、一键启停功能，配置自动保存，简洁易用。

---

## ✨ 功能特性

- **双向串口通信**：与 Tinkercad 仿真串口实时双向数据交互

- **自定义地址**：可根据使用场景自由修改通信服务地址

- **一键启停**：随时开启或关闭桥接通信功能

- **配置持久化**：所有设置自动保存，重启浏览器不丢失

- **轻量稳定**：纯内存运行，无冗余缓存，运行流畅

---

## 📁 项目结构

```Plain Text
tinkercad-serial-bridge/
├── manifest.json     # 插件核心配置
├── content.js        # 通信核心逻辑
├── popup.html        # 配置弹窗页面
├── popup.js          # 配置读写保存逻辑
└── icon.png          # 插件图标
```

---

## 🔧 安装教程

1. 将项目文件夹下载/克隆到本地

2. 打开 Chrome / Edge 浏览器扩展管理页面

3. 开启页面「开发者模式」

4. 点击「加载已解压的扩展程序」，选中项目文件夹即可安装

---

## ⚙️ 使用方法

### 1\. 插件参数配置

点击浏览器插件图标，打开配置面板：

<img width="238" height="133" alt="image" src="https://github.com/user-attachments/assets/ffebd002-0490-4de3-b7f6-9ddcc767f1e3" />

- **Server URL（服务地址）**：填写通信服务地址，默认本地地址 `http://localhost:8080`

- **Enable Bridge（启用桥接）**：开关控制通信功能开启/关闭

- 点击「Save Settings」保存配置，立即生效

### 2\. 正常使用

打开 Tinkercad 中的 Arduino 仿真项目并运行，开启插件桥接功能后，即可自动完成双向串口数据传输，实现仿真设备的联动控制。

---

## ✅ Author Info
  Developer: rs412
  
  Email: redshift@yeah.net
  
  Github: https://github.com/rs412/tinkercad-serial-bridge
