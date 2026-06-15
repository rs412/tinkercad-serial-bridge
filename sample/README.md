# Tinkercad LED Remote Control Demo

这个例子是 **tinkercad\-serial\-bridge 浏览器插件** 的实战演示案例。

实现效果：通过插件串口桥接能力，**使用网页远程控制 Tinkercad Arduino 仿真的 LED 亮灭**，完成双向串口数据通信交互。

## 📁 案例文件说明

- **led\.js**：Node\.js 服务脚本，负责收发指令、状态存储、跨域处理，对接插件与前端页面

- **index\.html**：前端控制页面，提供一键切换 LED 状态功能，自动同步仿真设备最新状态

- **LED\.ino**：Tinkercad Arduino 仿真程序，接收串口控制指令，定时上报设备运行状态

## 🧩 运行依赖

- 已安装并配置好 **tinkercad\-serial\-bridge** 浏览器插件

- 环境支持运行 Node\.js

- 可正常访问 Tinkercad 在线仿真平台

## 🚀 完整运行步骤

### 1\. 启动服务程序

在项目目录打开终端，执行以下命令启动服务：

```Plain Text
node led.js
```

服务默认监听端口：`http://localhost:8080`

### 2\. 启用插件桥接功能

点击插件图标打开配置面板，完成设置：

- 服务地址默认填写：`http://localhost:8080`

- 开启 **Enable Bridge** 功能开关

- 点击保存设置，启用串口桥接

### 3\. 运行 Tinkercad 仿真

将 `LED.ino` 代码复制到 Tinkercad Arduino 项目中，启动仿真运行。

### 4\. 网页远程控制仿真设备

通过浏览器打开 `index.html` 页面，即可实现交互控制：

- 点击页面按钮，远程切换 Tinkercad 仿真 LED 亮灭状态

- 页面自动轮询获取设备状态，实时同步仿真运行数据
