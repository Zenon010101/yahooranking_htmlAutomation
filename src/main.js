'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_ROOT, assertFiles, backupList } = require('./lib/file-ops');
const { CATEGORIES } = require('./lib/categories');
const { createPreview, updateHtml, restoreBackup } = require('./lib/workflow');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let busy = false;
let latestPreview = null;
let currentLog = null;
let lastError = null;

function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (typeof parsed.root === 'string' && parsed.root.length) return { root: parsed.root };
  } catch { }
  return { root: DEFAULT_ROOT };
}
function saveSettings(root) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ root }, null, 2), 'utf8');
}
function post(channel, data) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data); }
function log(message) {
  const line = `[${new Date().toLocaleString()}] ${message}`;
  if (currentLog) {
    try { fs.appendFileSync(currentLog, line + '\n', 'utf8'); } catch { }
  }
  post('job:log', line);
}
function progress(stage) { post('job:progress', stage); }
function startLog(action) {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  currentLog = path.join(dir, `${action}_${iso}.log`);
  fs.writeFileSync(currentLog, `${action.toUpperCase()} started ${new Date().toISOString()}\n`, 'utf8');
}

async function status() {
  const { root } = loadSettings();
  try {
    const paths = await assertFiles(root, { ignoreExcelLock: true });
    const backups = await backupList(paths.rep);
    const stats = await Promise.all([fsp.stat(paths.workbook), fsp.stat(paths.html)]);
    return {
      root, connected: true, backupCount: backups.length,
      nextBackup: `rankspnew (${backups.reduce((max, x) => Math.max(max, x.number), 0) + 1}).html`,
      backups: backups.slice(0, 50),
      workbookModified: stats[0].mtime.toISOString(), htmlModified: stats[1].mtime.toISOString(),
      error: null,
    };
  } catch (e) { return { root, connected: false, error: e.message, backups: [], backupCount: 0 }; }
}

async function runJob(action, execute) {
  if (busy) throw new Error('A ranking operation is already running.');
  busy = true;
  post('job:busy', true);
  startLog(action);
  lastError = null;
  try {
    log(`MODE: ${action.toUpperCase()}`);
    const result = await execute();
    log(`COMPLETE: ${action.toUpperCase()}`);
    return { ok: true, result, logPath: currentLog };
  } catch (e) {
    lastError = e.message;
    log(`ERROR: ${e.stack || e.message}`);
    return { ok: false, error: e.message, logPath: currentLog };
  } finally {
    busy = false;
    post('job:busy', false);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1230, height: 850, minWidth: 930, minHeight: 660,
    backgroundColor: '#f4f6fa',
    title: 'Yahoo Ranking Assistant',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.whenReady().then(() => {
  process.env.YR_SCRIPT_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'Extract-CODE.ps1')
    : path.join(__dirname, '..', 'scripts', 'Extract-CODE.ps1');

  ipcMain.handle('app:init', async () => ({
    version: app.getVersion(),
    status: await status(),
    categories: CATEGORIES.map(c => ({ key: c.key, name: c.name, formula: c.formula, value: c.value })),
  }));
  ipcMain.handle('app:status', status);
  ipcMain.handle('app:select-root', async () => {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: 'Select the folder containing rankspnew.html and YAHOO-RANKING COPYPASTE.xlsx',
      properties: ['openDirectory'],
    });
    if (selected.canceled || !selected.filePaths?.length) return null;
    return selected.filePaths[0];
  });
  ipcMain.handle('app:set-root', async (_e, root) => {
    if (busy) throw new Error('Cannot change the ranking path while processing.');
    if (typeof root !== 'string' || root.length > 1000 || !path.isAbsolute(root.trim())) throw new Error('Enter a valid absolute ranking folder path.');
    saveSettings(root.trim());
    return status();
  });
  ipcMain.handle('job:preview', () => runJob('preview', async () => {
    latestPreview = null;
    const result = await createPreview({ root: loadSettings().root, appData: app.getPath('userData'), log, progress });
    latestPreview = result.previewPath;
    return result;
  }));
  ipcMain.handle('job:update', () => runJob('update', () => updateHtml({
    root: loadSettings().root, appData: app.getPath('userData'), log, progress,
  })));
  ipcMain.handle('job:restore', (_e, name) => runJob('restore', async () => {
    if (typeof name !== 'string' || !/^rankspnew\s*\(\d+\)\.html$/i.test(name)) throw new Error('Invalid backup selection.');
    return restoreBackup({ root: loadSettings().root, backupName: name, log, progress });
  }));
  ipcMain.handle('app:open-preview', async () => {
    if (!latestPreview) throw new Error('Generate a preview first.');
    return shell.openPath(latestPreview);
  });
  ipcMain.handle('app:open-html', async () => shell.openPath(path.join(loadSettings().root, 'rankspnew.html')));
  ipcMain.handle('app:open-rep', async () => shell.openPath(path.join(loadSettings().root, '[REP]')));
  ipcMain.handle('app:open-logs', async () => {
    const logs = path.join(app.getPath('userData'), 'logs');
    await fsp.mkdir(logs, { recursive: true });
    return shell.openPath(logs);
  });
  createWindow();
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
