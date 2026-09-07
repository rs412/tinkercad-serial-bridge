# Tinkercad Serial Bridge

A Manifest V3 browser extension that gives Tinkercad Arduino simulation a bidirectional serial bridge: it forwards simulation serial output to a local or remote service, and writes external commands back into the simulation serial input\.

Supports custom server address, one\-click start/stop, live status, multi\-tab command arbitration and persistent configuration\.

---

## ✨ Features

- **Bidirectional serial communication** — serial output goes up, external commands come down in real time
- **Incremental upload** — only new lines are reported, so burst output is no longer truncated to the last line
- **Unified service layer** — all network calls live in `background.js`, avoiding page CORS limits and enabling retry and diagnostics
- **Live status panel** — service online/offline, connected tab count, last upload/download, DOM probe result
- **Multi\-tab arbitration** — with several Tinkercad tabs open, only one leader pulls commands, so the queue is never stolen
- **Selector fallbacks** — multiple built\-in selectors, same\-origin iframe scanning, and user\-supplied selectors so a Tinkercad redesign does not break the extension
- **Built\-in self\-check** — test connection and manual command injection to isolate service, network or DOM issues
- **Persistent configuration** — settings survive browser restarts

---

## 📁 Project Structure

```Plain Text
tinkercad-serial-bridge/
├── manifest.json     # Extension configuration
├── background.js     # Service layer: network, status aggregation, leader election
├── content.js        # Page layer: serial text diffing, command injection
├── popup.html        # Settings and status panel
├── popup.js          # Panel logic
├── icons/            # 16 / 48 / 128 icons
├── sample/           # Runnable demo (service + control page + Arduino sketch)
└── README.md
```

---

## 🔧 Installation

1. Download or clone the project folder locally

2. Open the Chrome / Edge extension management page

3. Turn on **Developer mode**

4. Click **Load unpacked** and select the project folder

> After editing the code, click **Reload** on the extension card to apply changes\.

---

## ⚙️ Usage

### 1\. Start the bridge service

```Bash
cd sample
node led.js
# or: PORT=9000 node led.js
```

### 2\. Configure the extension

Click the extension icon:

- **Server URL** — default `http://localhost:8080`; trailing slashes are stripped automatically, and non\-localhost origins trigger a permission request
- **Upload interval** — how often the serial monitor is read, default 800ms \(changes are also pushed immediately via MutationObserver\)
- **Command poll interval** — how often pending commands are pulled, default 2000ms
- **Line filter** — when set, only lines containing this string are uploaded; leave empty to upload everything
- **Enable bridge** — master switch
- **Advanced → custom selectors** — if a Tinkercad redesign breaks auto\-detection, supply CSS selectors for monitor / input / send button here

Click **Save Settings** to apply instantly — no page reload needed\.

### 3\. Run

Open and run your Tinkercad Arduino simulation\. The panel should show the tab as connected and all three DOM probes as ✓\.

### 4\. Troubleshooting

| Item | Healthy | What to check |
| --- | --- | --- |
| Bridge service | online · /health | Click **Test connection**; verify the service is running and the port is right |
| Tinkercad page | N tab\(s\) connected | Not connected means no simulation tab is open or the extension was not reloaded |
| DOM probe | monitor✓ input✓ send✓ | A ✗ means Tinkercad changed its markup — set custom selectors |
| Last upload | timestamp \+ content | Stuck at "—" usually means the line filter is too strict |
| Last download | timestamp \+ content | Stuck at "—" means the service queue is empty |

---

## 🔌 Service API

The extension speaks the following protocol\. `sample/led.js` implements all of it; you can substitute your own backend\.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/send?out=<line>` | Upload one serial line \(raw passthrough, one request per line\) |
| GET | `/cmd` | Take one pending command, empty string when queue is empty |
| POST | `/cmd` | Enqueue a command, accepts plain text or `{"cmd":"..."}` |
| GET | `/getLog` | Latest serial line \(legacy frontend\) |
| GET | `/log?n=50&since=0` | JSON ring log `{seq, latest, lines[]}` |
| GET | `/health` | Health check used by the extension self\-test |
| POST | `/reset` | Clear command queue and log |

---

## 📝 Changelog

### 26\.9\.7

- Added `background.js` service layer as the single network egress, enabling any server address
- Fixed React controlled input injection: use the native prototype setter and wait 300ms before clicking send so React can commit state \(this wait is exactly why the original version worked\)
- If the background becomes unreachable 3 times in a row, the page degrades to direct in\-page fetch, matching legacy behaviour, so the new service layer is never a single point of failure
- Serial upload is now incremental; lines are no longer dropped and top trimming is handled correctly
- Multi\-tab leader election prevents the `/cmd` queue from being stolen
- Element lookup gained fallback selectors, same\-origin iframe scanning and custom selector overrides
- MutationObserver pushes new output immediately instead of waiting for the poll tick
- New status panel: service/page status, last traffic, DOM probe, test connection, manual command
- Input validation \(URL normalization, interval clamping\) and on\-demand permission requests for non\-localhost origins
- Service gained a ring log, `/log`, `/health` and queue limits while keeping every legacy endpoint
- Real 16/48/128 icon sizes; screenshots and backups moved to `docs/`

### 26\.8\.13

- Custom server address, upload/poll intervals, one\-click enable

---

## ✅ Author Info

  Developer: rs412

  Email: redshift@yeah.net

  Github: https://github.com/rs412/
