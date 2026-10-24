'use strict';

const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const assoc = require('./assoc');
const updater = require('./updater');
const { AUDIO_EXT, VIDEO_EXT, PLAYLIST_EXT, IMAGE_EXT, MIME, extOf } = require('./formats');

const MEDIA_EXT = new Set([...AUDIO_EXT, ...VIDEO_EXT]);
const SERVABLE_EXT = new Set([...AUDIO_EXT, ...VIDEO_EXT, ...IMAGE_EXT]);
const UI_ROOT = path.join(__dirname, 'src');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

// Files opened from File Explorer must start playing immediately, without a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

let win = null;
let rendererReady = false;
const pending = [];
let lastExternalOpen = 0;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    handleArgv(argv);
  });
  app.whenReady().then(start);
}

app.on('window-all-closed', () => app.quit());

// ---------------------------------------------------------------- settings

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')); } catch { return {}; }
}

function writeSettings(patch) {
  const s = { ...readSettings(), ...patch };
  try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- incoming files

function argvFiles(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  return args.filter((a) => a && !a.startsWith('--'));
}

function handleArgv(argv) {
  const enqueue = argv.includes('--enqueue');
  const files = expandPaths(argvFiles(argv));
  if (!files.length) return;
  // With a multiple selection, Explorer launches one process per file:
  // files arriving in a burst are queued instead of replacing the playlist.
  const now = Date.now();
  const append = enqueue || now - lastExternalOpen < 1500;
  lastExternalOpen = now;
  deliver(files, append);
}

function deliver(files, append) {
  if (!files.length) return;
  if (win && rendererReady) win.webContents.send('files:open', files, append);
  else pending.push({ files, append });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function walkDir(dir, out, depth) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => collator.compare(a.name, b.name));
  for (const e of entries) {
    if (out.length >= 5000) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4) walkDir(full, out, depth + 1); }
    else if (MEDIA_EXT.has(extOf(e.name))) out.push(full);
  }
}

function readPlaylist(file) {
  const out = [];
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  const base = path.dirname(file);
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^file:\/\//i.test(line)) line = decodeURIComponent(line.replace(/^file:\/\/\/?/i, ''));
    const p = path.resolve(base, line);
    if (MEDIA_EXT.has(extOf(p)) && fs.existsSync(p)) out.push(p);
  }
  return out;
}

function expandPaths(paths) {
  const out = [];
  for (const raw of paths) {
    const p = path.resolve(raw);
    if (!app.isPackaged && p === path.resolve(app.getAppPath())) continue;
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walkDir(p, out, 0);
    else if (PLAYLIST_EXT.includes(extOf(p))) out.push(...readPlaylist(p));
    else if (MEDIA_EXT.has(extOf(p))) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- app:// protocol

async function serveFile(request, file) {
  let st;
  try { st = await fs.promises.stat(file); } catch { return new Response('Not found', { status: 404 }); }
  if (!st.isFile()) return new Response('Not found', { status: 404 });

  const type = MIME[extOf(file)] || 'application/octet-stream';
  const size = st.size;
  const range = request.headers.get('range');
  // no-store: after an app update, stale UI files must not be served from cache
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };

  // Range requests let the <video>/<audio> element seek.
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = 0;
    let end = size - 1;
    if (m) {
      if (m[1]) { start = parseInt(m[1], 10); if (m[2]) end = parseInt(m[2], 10); }
      else if (m[2]) start = Math.max(0, size - parseInt(m[2], 10));
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = fs.createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) },
  });
}

function registerProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/media') {
      const file = url.searchParams.get('p') || '';
      if (!path.isAbsolute(file) || !SERVABLE_EXT.has(extOf(file))) return new Response('Forbidden', { status: 403 });
      return serveFile(request, file);
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(UI_ROOT, rel));
    if (!file.startsWith(UI_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    return serveFile(request, file);
  });
}

// ---------------------------------------------------------------- window

function createWindow() {
  const s = readSettings();
  const bounds = s.bounds || { width: 1120, height: 720 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#000000',
    title: 'Aurora Player',
    icon: path.join(UI_ROOT, 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0d12', symbolColor: '#c9d4e2', height: 34 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  if (s.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  const saveBounds = () => {
    if (!win || win.isFullScreen()) return;
    writeSettings({ maximized: win.isMaximized(), bounds: win.isMaximized() ? readSettings().bounds : win.getBounds() });
  };
  win.on('close', saveBounds);
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false));
  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  // A file dropped outside the handled areas must not navigate the window away.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadURL('app://local/index.html');
}

async function askDefaultOnFirstRun() {
  const s = readSettings();
  if (s.askedDefault) return;
  writeSettings({ askedDefault: true });
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Aurora Player',
    message: 'Do you want to use Aurora Player as your default player for music and video?',
    detail: 'Windows will open the "Default apps" page: just click "Set default" '
      + '(or choose Aurora Player for the formats you prefer).',
    buttons: ['Yes, set it', 'Not now'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await setAsDefault(false);
}

async function setAsDefault(explain = true) {
  try {
    await assoc.register();
    writeSettings({ registeredExe: process.execPath, assocVersion: assoc.VERSION, assocRemoved: false });
  } catch (err) {
    dialog.showErrorBox('Aurora Player', `Registration failed:\n${err.message}`);
    return;
  }
  if (explain) {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Aurora Player',
      message: 'Aurora Player is registered with Windows.',
      detail: 'Windows does not let apps make themselves the default: on the page that opens, '
        + 'click "Set default" at the top, or choose Aurora Player for each format (.mp3, .mp4, ...).',
      buttons: ['Open Settings'],
    });
  }
  await shell.openExternal(`ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(assoc.APP_KEY)}`);
}

async function removeAssociations() {
  try {
    await assoc.unregister();
    writeSettings({ registeredExe: null, assocRemoved: true });
    dialog.showMessageBox(win, { type: 'info', title: 'Aurora Player', message: 'File associations removed.' });
  } catch (err) {
    dialog.showErrorBox('Aurora Player', `Operation failed:\n${err.message}`);
  }
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.on('renderer:ready', () => {
    rendererReady = true;
    while (pending.length) {
      const { files, append } = pending.shift();
      win.webContents.send('files:open', files, append);
    }
  });

  ipcMain.handle('dialog:open', async (_e, folder) => {
    const exts = [...AUDIO_EXT, ...VIDEO_EXT, ...PLAYLIST_EXT];
    const res = await dialog.showOpenDialog(win, folder
      ? { title: 'Open folder', properties: ['openDirectory', 'multiSelections'] }
      : {
        title: 'Open media files',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media files', extensions: exts },
          { name: 'Audio', extensions: AUDIO_EXT },
          { name: 'Video', extensions: VIDEO_EXT },
          { name: 'Playlist', extensions: PLAYLIST_EXT },
        ],
      });
    return res.canceled ? [] : expandPaths(res.filePaths);
  });

  ipcMain.handle('files:expand', (_e, paths) => expandPaths(Array.isArray(paths) ? paths : []));

  ipcMain.handle('meta:get', async (_e, file) => {
    const info = { title: null, artist: null, album: null, cover: null };
    try {
      const mm = require('music-metadata');
      const md = await mm.parseFile(file, { duration: false });
      const c = md.common;
      info.title = c.title || null;
      info.artist = c.artist || c.albumartist || null;
      info.album = c.album || null;
      const pic = c.picture && c.picture[0];
      if (pic) info.cover = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
    } catch { /* untagged or unreadable file */ }
    if (!info.cover) {
      const dir = path.dirname(file);
      for (const name of ['cover.jpg', 'folder.jpg', 'Folder.jpg', 'cover.png', 'front.jpg', 'AlbumArtSmall.jpg']) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) { info.cover = `app://local/media?p=${encodeURIComponent(p)}`; break; }
      }
    }
    return info;
  });

  ipcMain.on('win:fullscreen', () => win && win.setFullScreen(!win.isFullScreen()));
  ipcMain.on('win:exit-fullscreen', () => win && win.isFullScreen() && win.setFullScreen(false));
  ipcMain.on('win:title', (_e, title) => win && win.setTitle(title));

  ipcMain.on('menu:context', (e, d) => {
    const send = (cmd, arg) => e.sender.send('menu:command', cmd, arg);
    const template = [
      { label: d.playing ? 'Pause' : 'Play', accelerator: 'Space', click: () => send('playpause') },
      { label: 'Stop', click: () => send('stop') },
      { label: 'Previous', click: () => send('prev') },
      { label: 'Next', click: () => send('next') },
      { type: 'separator' },
      {
        label: 'Visualizations',
        submenu: d.groups.map((g) => ({
          label: g.name,
          submenu: g.items.map((it) => ({
            label: it.name, type: 'radio', checked: it.id === d.current, click: () => send('viz', it.id),
          })),
        })),
      },
      { label: 'Next visualization', accelerator: 'V', click: () => send('viz-next') },
      { label: 'Previous visualization', accelerator: 'Shift+V', click: () => send('viz-prev') },
      { label: 'Change visualization every track', type: 'checkbox', checked: d.vizPerTrack, click: () => send('viz-per-track') },
      { type: 'separator' },
      { label: 'Open files...', accelerator: 'Ctrl+O', click: () => send('open') },
      { label: 'Open folder...', click: () => send('open-folder') },
      { label: 'Playlist', type: 'checkbox', checked: d.playlist, accelerator: 'L', click: () => send('playlist') },
      { label: 'Full screen', type: 'checkbox', checked: win.isFullScreen(), accelerator: 'F11', click: () => send('fullscreen') },
      { label: 'Shuffle', type: 'checkbox', checked: d.shuffle, click: () => send('shuffle') },
      {
        label: 'Repeat',
        submenu: [['off', 'Off'], ['all', 'Whole playlist'], ['one', 'Current track']].map(([v, l]) => ({
          label: l, type: 'radio', checked: d.repeat === v, click: () => send('repeat', v),
        })),
      },
      { type: 'separator' },
      { label: 'Set as default player...', click: () => setAsDefault(true) },
      { label: 'Remove file associations', click: () => removeAssociations() },
      { type: 'separator' },
      { label: 'Check for updates...', click: () => updater.check(true) },
      { label: `Aurora Player ${app.getVersion()}`, enabled: false },
    ];
    Menu.buildFromTemplate(template).popup({ window: win });
  });

  ipcMain.on('assoc:set-default', () => setAsDefault(true));
}

// ---------------------------------------------------------------- startup

async function start() {
  Menu.setApplicationMenu(null);
  registerProtocol();
  registerIpc();
  createWindow();
  updater.init(win, { read: readSettings, write: writeSettings });
  handleArgv(process.argv);

  if (app.isPackaged) {
    // Registers the app under "Open with" / "Default apps" and keeps the executable path and labels up to date.
    const s = readSettings();
    if (!s.assocRemoved && (s.registeredExe !== process.execPath || s.assocVersion !== assoc.VERSION)) {
      assoc.register().then(() => writeSettings({ registeredExe: process.execPath, assocVersion: assoc.VERSION })).catch(() => {});
    }
    // One dialog at a time: the first-run question, then the update check.
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      await askDefaultOnFirstRun();
      updater.check(false);
    }, 800));
  }
}
