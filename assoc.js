'use strict';

// Registers Aurora Player with Windows (HKCU only, no administrator rights needed).
// Windows 10/11 does not let an app make itself the default: this makes it available under
// "Open with" and Settings > Default apps, where the user confirms the choice.

const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { AUDIO_EXT, VIDEO_EXT, PLAYLIST_EXT } = require('./formats');

const APP_KEY = 'AuroraPlayer';
const APP_NAME = 'Aurora Player';
// Bump whenever the registered keys or labels change, so existing installs re-register.
const VERSION = 2;
const HK = 'HKEY_CURRENT_USER\\Software';

const KINDS = [
  { progId: 'AuroraPlayer.Audio', label: 'Audio file (Aurora Player)', exts: AUDIO_EXT },
  { progId: 'AuroraPlayer.Video', label: 'Video file (Aurora Player)', exts: VIDEO_EXT },
  { progId: 'AuroraPlayer.Playlist', label: 'Playlist (Aurora Player)', exts: PLAYLIST_EXT },
];

const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function command(extra) {
  const exe = `"${process.execPath}"`;
  const base = app.isPackaged ? exe : `${exe} "${app.getAppPath()}"`;
  return `${base}${extra} "%1"`;
}

function regFile(lines) {
  const file = path.join(os.tmpdir(), `aurora-assoc-${process.pid}-${Date.now()}.reg`);
  // regedit expects UTF-16LE with a BOM.
  fs.writeFileSync(file, Buffer.from(String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n', 'utf16le'));
  return new Promise((resolve, reject) => {
    execFile('reg.exe', ['import', file], { windowsHide: true }, (err, _out, stderr) => {
      fs.rm(file, { force: true }, () => {});
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve();
    });
  });
}

function register() {
  const icon = q(`"${process.execPath}",0`);
  const lines = ['Windows Registry Editor Version 5.00', ''];
  const key = (k, values = []) => {
    lines.push(`[${k}]`);
    for (const [n, v] of values) lines.push(`${n === '' ? '@' : q(n)}=${v}`);
    lines.push('');
  };

  for (const { progId, label, exts } of KINDS) {
    const base = `${HK}\\Classes\\${progId}`;
    key(base, [['', q(label)], ['FriendlyTypeName', q(label)]]);
    key(`${base}\\DefaultIcon`, [['', icon]]);
    key(`${base}\\shell`, [['', q('open')]]);
    key(`${base}\\shell\\open`, [['', q('Play with Aurora Player')]]);
    key(`${base}\\shell\\open\\command`, [['', q(command(''))]]);
    key(`${base}\\shell\\enqueue`, [['', q('Add to Aurora Player playlist')]]);
    key(`${base}\\shell\\enqueue\\command`, [['', q(command(' --enqueue'))]]);
    for (const ext of exts) key(`${HK}\\Classes\\.${ext}\\OpenWithProgids`, [[progId, 'hex(0):']]);
  }

  const all = KINDS.flatMap((k) => k.exts.map((e) => [`.${e}`, q(k.progId)]));
  key(`${HK}\\${APP_KEY}\\Capabilities`, [
    ['ApplicationName', q(APP_NAME)],
    ['ApplicationDescription', q('Media player with audio-reactive visualizations in the style of Windows Media Player')],
    ['ApplicationIcon', icon],
  ]);
  key(`${HK}\\${APP_KEY}\\Capabilities\\FileAssociations`, all);
  key(`${HK}\\RegisteredApplications`, [[APP_KEY, q(`Software\\${APP_KEY}\\Capabilities`)]]);

  if (app.isPackaged) {
    const exeName = path.basename(process.execPath);
    key(`${HK}\\Classes\\Applications\\${exeName}`, [['FriendlyAppName', q(APP_NAME)]]);
    key(`${HK}\\Classes\\Applications\\${exeName}\\SupportedTypes`, all.map(([e]) => [e, q('')]));
  }
  return regFile(lines);
}

function unregister() {
  const lines = ['Windows Registry Editor Version 5.00', ''];
  for (const { progId, exts } of KINDS) {
    lines.push(`[-${HK}\\Classes\\${progId}]`, '');
    for (const ext of exts) lines.push(`[${HK}\\Classes\\.${ext}\\OpenWithProgids]`, `${q(progId)}=-`, '');
  }
  lines.push(`[-${HK}\\${APP_KEY}]`, '');
  lines.push(`[${HK}\\RegisteredApplications]`, `${q(APP_KEY)}=-`, '');
  if (app.isPackaged) lines.push(`[-${HK}\\Classes\\Applications\\${path.basename(process.execPath)}]`, '');
  return regFile(lines);
}

module.exports = { APP_KEY, VERSION, register, unregister };
