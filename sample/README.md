# Tinkercad LED 远程控制示例

这是 **tinkercad-serial-bridge 浏览器插件** 的实战演示案例。

实现效果：通过插件串口桥接能力，**使用网页远程控制 Tinkercad Arduino 仿真的 LED 亮灭**，完成双向串口数据通信交互。

## 📁 案例文件说明

- **led.js**：Node.js 中转服务，负责收发指令、状态存储、跨域处理，对接插件与前端页面

- **led.html**：前端控制页面，提供一键切换 LED 状态，实时同步仿真上报的数据。由 `led.js` 直接 serve，访问 `http://localhost:8080/led.html` 即可打开

- **LED.ino**：Tinkercad Arduino 仿真程序，接收串口控制指令，定时上报设备运行状态

## 🧩 运行依赖

- 已安装并配置好 **tinkercad-serial-bridge** 浏览器插件

- 环境支持运行 Node.js

- 可正常访问 Tinkercad 在线仿真平台

## 🚀 完整运行步骤

### 1. 启动服务程序

在项目目录打开终端，执行以下命令启动服务：

```bash
node led.js
# 指定端口：PORT=9000 node led.js
```

服务默认监听：`http://localhost:8080`

### 2. 启用插件桥接功能

点击插件图标打开配置面板，完成设置：

- 服务地址填写：`http://localhost:8080`

- 开启 **启用桥接** 开关

- 点击保存设置，面板上「中转服务」应显示在线

### 3. 运行 Tinkercad 仿真

将 `LED.ino` 代码复制到 Tinkercad Arduino 项目中，启动仿真运行。

### 4. 网页远程控制仿真设备

打开浏览器访问 **`http://localhost:8080/led.html`** 即可使用控制页面（由 `led.js` 直接 serve，不需要额外起静态文件服务器）：

- 点击页面按钮，远程切换 Tinkercad 仿真 LED 亮灭状态

- 页面自动轮询获取设备状态，实时同步仿真运行数据

- 页面下方会显示服务端返回的最近串口日志

## 🔌 服务接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/send?out=<line>` | 上行一条串口输出（原样中转） |
| GET | `/cmd` | 插件取出一条待发指令 |
| POST | `/cmd` | 指令入队，支持纯文本或 `{"cmd":"..."}` |
| GET | `/getLog` | 最新一条串口输出（旧前端兼容） |
| GET | `/log?n=50&since=0` | JSON 环形日志 |
| GET | `/health` | 健康检查 |
| GET | `/`、`/led.html` | LED 控制页面（由 led.js 直接 serve） |
| POST | `/reset` | 清空队列与日志 |

## ❓ 常见问题

- **页面一直显示 bridge service unreachable**：服务未启动，或插件里填的地址端口与实际不一致
- **LED 状态不同步**：确认 Tinkercad 仿真正在运行、插件面板「元素检测」三项全为 ✓
- **指令能发出但仿真没反应**：检查 `LED.ino` 的波特率是否为 9600，且串口监视器已打开
