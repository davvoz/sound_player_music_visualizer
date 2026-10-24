'use strict';

// Formats Chromium (and therefore Electron) can decode natively.
// WMA/WMV/AVI are not supported by the engine, so they are not associated.
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'weba'];
const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv'];
const PLAYLIST_EXT = ['m3u', 'm3u8'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

const MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  mov: 'video/quicktime', ogv: 'video/ogg',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml',
};

const extOf = (p) => {
  const m = /\.([^.\\/]+)$/.exec(p);
  return m ? m[1].toLowerCase() : '';
};

module.exports = { AUDIO_EXT, VIDEO_EXT, PLAYLIST_EXT, IMAGE_EXT, MIME, extOf };
