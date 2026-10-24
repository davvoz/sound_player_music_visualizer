'use strict';

// Checks GitHub Releases for a newer version and offers to download and install it.
// Automatic checks stay silent unless an update is found; manual checks always report the outcome.

const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
// An update downloaded but not installed right away is installed when the player is closed.
autoUpdater.autoInstallOnAppQuit = true;

let win = null;
let settings = null;
let manual = false;
let busy = false;

const plain = (notes) => {
  const text = (Array.isArray(notes) ? notes.map((n) => n.note).join('\n') : notes || '')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
};

async function onAvailable(info) {
  if (!manual && settings.read().skippedVersion === info.version) { busy = false; return; }
  const notes = plain(info.releaseNotes);
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Update available',
    message: `Aurora Player ${info.version} is available`,
    detail: `You have version ${app.getVersion()}. Download and install it now?${notes ? `\n\nWhat's new:\n${notes}` : ''}`,
    buttons: ['Download', 'Later', 'Skip this version'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    win?.webContents.send('app:toast', 'Downloading update…');
    autoUpdater.downloadUpdate().catch(() => { /* reported by the "error" event */ });
    return;
  }
  if (response === 2) settings.write({ skippedVersion: info.version });
  busy = false;
}

async function onDownloaded(info) {
  win?.setProgressBar(-1);
  busy = false;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Update ready',
    message: `Aurora Player ${info.version} has been downloaded`,
    detail: 'Restart now to install it? Otherwise it will be installed when you close the player.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) autoUpdater.quitAndInstall(true, true);
}

function init(window, store) {
  win = window;
  settings = store;
  autoUpdater.on('update-available', onAvailable);
  autoUpdater.on('update-not-available', () => {
    busy = false;
    if (manual) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Aurora Player',
        message: "You're up to date",
        detail: `Aurora Player ${app.getVersion()} is the latest version.`,
      });
    }
  });
  autoUpdater.on('download-progress', (p) => win?.setProgressBar(p.percent / 100));
  autoUpdater.on('update-downloaded', onDownloaded);
  autoUpdater.on('error', (err) => {
    busy = false;
    win?.setProgressBar(-1);
    if (manual) dialog.showErrorBox('Aurora Player', `Couldn't check for updates:\n${err.message}`);
  });
}

function check(isManual = false) {
  if (!app.isPackaged) {
    if (isManual) {
      dialog.showMessageBox(win, { type: 'info', title: 'Aurora Player', message: 'Updates are only available in the installed app.' });
    }
    return;
  }
  if (busy) return;
  busy = true;
  manual = isManual;
  autoUpdater.checkForUpdates().catch(() => { /* reported by the "error" event */ });
}

module.exports = { init, check };
