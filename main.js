const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ── 生成备用托盘图标（纯 Node.js，无依赖）────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createSolidPng(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array(size).fill(row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 切换窗口显示/隐藏 ─────────────────────────────────────────────────────────
function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ── 创建系统托盘 ──────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = nativeImage.createFromBuffer(createSolidPng(16, 250, 204, 20));
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('桌面便签');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏',
      click: toggleWindow,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

// ── 数据目录（打包后在 exe 旁边，开发时在项目 data 目录）─────────────────────
function getDataDir() {
  const dir = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'NotesData')
    : path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDataFilePath() {
  return path.join(getDataDir(), 'notes.json');
}

function readData() {
  try {
    const fp = getDataFilePath();
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    }
  } catch (e) {
    console.error('[main] readData error:', e);
  }
  return null;
}

function writeData(data) {
  try {
    fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[main] writeData error:', e);
    return false;
  }
}

// ── 校验窗口边界是否在屏幕范围内 ─────────────────────────────────────────────
function validateBounds(wb) {
  if (!wb || typeof wb.x !== 'number' || typeof wb.y !== 'number') return null;
  const displays = screen.getAllDisplays();
  const onScreen = displays.some(d => {
    const b = d.bounds;
    return wb.x >= b.x - wb.width / 2 &&
           wb.y >= b.y - wb.height / 2 &&
           wb.x < b.x + b.width &&
           wb.y < b.y + b.height;
  });
  return onScreen ? wb : null;
}

// ── 创建窗口 ─────────────────────────────────────────────────────────────────
function createWindow() {
  const saved = readData();
  const wb = validateBounds(saved?.settings?.windowBounds);
  const opacity = saved?.settings?.opacity ?? 0.93;
  const alwaysOnTop = saved?.settings?.alwaysOnTop ?? true;

  // 图标路径（assets/icon.ico 存在时使用，否则跳过）
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const iconOption = fs.existsSync(iconPath) ? { icon: iconPath } : {};

  mainWindow = new BrowserWindow({
    width: wb?.width || 760,
    height: wb?.height || 520,
    x: wb?.x,
    y: wb?.y,
    minWidth: 560,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop,
    skipTaskbar: true,
    ...iconOption,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setOpacity(Math.min(1, Math.max(0.1, opacity)));
  });

  // 关闭前保存窗口位置和大小
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const bounds = mainWindow.getBounds();
        const data = readData() || { version: '1.0.0', notes: [], settings: {} };
        data.settings = data.settings || {};
        data.settings.windowBounds = bounds;
        writeData(data);
      } catch (e) {}
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// 有托盘时不因所有窗口关闭而退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ── IPC 处理 ─────────────────────────────────────────────────────────────────
ipcMain.handle('load-data', () => readData());

ipcMain.handle('save-data', (_, data) => writeData(data));

ipcMain.handle('set-opacity', (_, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(Math.min(1, Math.max(0.1, value)));
  }
  return true;
});

ipcMain.handle('set-always-on-top', (_, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(value, 'floating');
  }
  return true;
});

ipcMain.handle('set-auto-start', (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return true;
});

ipcMain.handle('get-auto-start', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('window-minimize', () => {
  mainWindow?.hide();
});

ipcMain.handle('window-close', () => {
  isQuitting = true;
  app.quit();
});
