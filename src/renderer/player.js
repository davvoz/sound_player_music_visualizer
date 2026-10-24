import { AudioEngine } from './audio.js';
import { Visualizer } from './visualizer.js';
import { PRESETS, PRESET_GROUPS } from './presets.js';

const api = window.api;
const $ = (s) => document.querySelector(s);
const appEl = $('#app');
const media = $('#media');
const list = $('#pl-list');

const store = {
  get(k, d) {
    try { const v = localStorage.getItem(`aurora.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(`aurora.${k}`, JSON.stringify(v)); } catch { /* ignore */ }
  },
};

const state = {
  items: [],
  index: -1,
  selected: -1,
  shuffle: store.get('shuffle', false),
  repeat: store.get('repeat', 'off'),
  volume: store.get('volume', 0.8),
  muted: false,
  vizPerTrack: store.get('vizPerTrack', false),
  played: new Set(),
  history: [],
  errorsInRow: 0,
};

const audio = new AudioEngine(media);
let viz = null;
try {
  viz = new Visualizer($('#viz'), PRESETS);
  viz.select(store.get('preset', 'alchemy-random'));
} catch (err) {
  console.error(err);
}

// ---------------------------------------------------------------- helpers

const mediaUrl = (p) => `app://local/media?p=${encodeURIComponent(p)}`;
const baseName = (p) => p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
const current = () => state.items[state.index] || null;

function fmt(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function display(it) {
  if (it.title) return { title: it.title, artist: it.artist || '', album: it.album || '' };
  const name = it.name.replace(/^\d{1,3}[\s.\-_]+(?=\D)/, '');
  const m = /^(.+?)\s+-\s+(.+)$/.exec(name);
  return m ? { title: m[2], artist: m[1], album: '' } : { title: name, artist: it.artist || '', album: '' };
}

let toastTimer = 0;
function toast(text, ms = 2200) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

let infoTimer = 0;
function showInfoOverlay() {
  const it = current();
  if (!it) return;
  const d = display(it);
  $('#info-overlay .info-title').textContent = d.title;
  $('#info-overlay .info-sub').textContent = [d.artist, d.album].filter(Boolean).join(' — ');
  const el = $('#info-overlay');
  el.classList.add('show');
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

// ---------------------------------------------------------------- metadata

function ensureMeta(it) {
  if (!it.metaPromise) {
    it.metaPromise = api.metadata(it.path).catch(() => null).then((m) => {
      if (m) Object.assign(it, { title: m.title, artist: m.artist, album: m.album });
      updateRow(it);
      if (it === current()) updateNowPlaying();
      return m;
    });
  }
  return it.metaPromise;
}

const metaQueue = [];
let metaBusy = false;
async function pumpMeta() {
  if (metaBusy) return;
  metaBusy = true;
  while (metaQueue.length) {
    const it = metaQueue.shift();
    if (state.items.includes(it)) await ensureMeta(it);
  }
  metaBusy = false;
}

function setCover(src) {
  $('#cover-thumb').style.backgroundImage = src ? `url("${src}")` : '';
  let img = null;
  if (src) {
    img = new Image();
    img.src = src;
  }
  viz?.setTrack({ cover: img });
}

// ---------------------------------------------------------------- playlist

function addFiles(paths, { append = false } = {}) {
  if (!paths || !paths.length) return;
  const items = paths.map((p) => ({ path: p, name: baseName(p) }));
  if (append && state.items.length) {
    const start = state.items.length;
    state.items.push(...items);
    renderPlaylist();
    toast(`${items.length} ${items.length === 1 ? 'item' : 'items'} added to the playlist`);
    if (state.index < 0 || (media.paused && media.ended)) playIndex(start);
  } else {
    state.items = items;
    state.index = -1;
    state.selected = -1;
    state.played.clear();
    state.history = [];
    renderPlaylist();
    if (state.shuffle && items.length > 1) playIndex(Math.floor(Math.random() * items.length));
    else playIndex(0);
  }
  metaQueue.push(...items);
  pumpMeta();
}

function row(it, i) {
  const li = document.createElement('li');
  li.draggable = true;
  li.dataset.index = i;
  if (i === state.index) li.classList.add('current');
  if (i === state.selected) li.classList.add('selected');
  if (it.error) li.classList.add('error');
  const d = display(it);
  li.innerHTML = '<span class="pl-idx"></span><div class="pl-text"><div class="pl-name"></div><div class="pl-artist"></div></div><button class="pl-rm" title="Remove">✕</button>';
  li.querySelector('.pl-idx').textContent = i + 1;
  li.querySelector('.pl-name').textContent = d.title;
  li.querySelector('.pl-artist').textContent = d.artist;
  li.title = it.path;
  return li;
}

function renderPlaylist() {
  const frag = document.createDocumentFragment();
  state.items.forEach((it, i) => frag.appendChild(row(it, i)));
  list.textContent = '';
  list.appendChild(frag);
  const n = state.items.length;
  $('#pl-count').textContent = n ? `${n} ${n === 1 ? 'item' : 'items'}` : '';
  appEl.classList.toggle('empty', n === 0);
}

function updateRow(it) {
  const i = state.items.indexOf(it);
  if (i >= 0 && list.children[i]) list.children[i].replaceWith(row(it, i));
}

function highlightCurrent() {
  for (const li of list.children) {
    const i = Number(li.dataset.index);
    li.classList.toggle('current', i === state.index);
    li.classList.toggle('selected', i === state.selected);
  }
  // no scrollIntoView: it would also scroll the ancestors and shift the visualization area
  const li = list.children[state.index];
  if (!li) return;
  const top = li.offsetTop;
  const bottom = top + li.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

function removeIndex(i) {
  if (i < 0 || i >= state.items.length) return;
  const [it] = state.items.splice(i, 1);
  state.played.delete(it);
  state.history = state.history.filter((x) => x !== it);
  if (state.selected >= state.items.length) state.selected = state.items.length - 1;
  if (i < state.index) state.index--;
  else if (i === state.index) {
    const wasPlaying = !media.paused;
    if (state.items.length === 0) { clearPlaylist(); return; }
    state.index = Math.min(i, state.items.length - 1);
    renderPlaylist();
    playIndex(state.index, { autoplay: wasPlaying });
    return;
  }
  renderPlaylist();
}

function moveItem(from, to) {
  if (from === to || from < 0 || to < 0) return;
  const cur = current();
  const [it] = state.items.splice(from, 1);
  state.items.splice(to > from ? to - 1 : to, 0, it);
  state.index = state.items.indexOf(cur);
  state.selected = state.items.indexOf(it);
  renderPlaylist();
}

function clearPlaylist() {
  media.pause();
  media.removeAttribute('src');
  media.load();
  state.items = [];
  state.index = -1;
  state.selected = -1;
  state.played.clear();
  state.history = [];
  appEl.classList.remove('video', 'playing');
  renderPlaylist();
  updateNowPlaying();
}

// ---------------------------------------------------------------- playback

function playIndex(i, { autoplay = true } = {}) {
  if (i < 0 || i >= state.items.length) return;
  state.index = i;
  const it = state.items[i];
  state.played.add(it);
  if (state.history[state.history.length - 1] !== it) state.history.push(it);
  if (state.history.length > 500) state.history.shift();

  appEl.classList.remove('video');
  media.src = mediaUrl(it.path);
  if (autoplay) {
    audio.resume();
    media.play().catch(() => { /* errors are reported by the "error" event */ });
  }
  if (state.vizPerTrack && viz) randomViz();

  setCover(null);
  ensureMeta(it).then(() => { if (it === current()) showInfoOverlay(); });
  api.metadata(it.path).then((m) => { if (it === current() && m) setCover(m.cover); }).catch(() => {});
  updateNowPlaying();
  highlightCurrent();
  showInfoOverlay();
}

function nextIndex(auto) {
  const n = state.items.length;
  if (!n) return -1;
  if (auto && state.repeat === 'one') return state.index;
  if (state.shuffle) {
    let pool = state.items.filter((it) => !state.played.has(it));
    if (!pool.length) {
      if (auto && state.repeat === 'off') return -1;
      state.played.clear();
      pool = state.items.filter((it) => it !== current());
      if (!pool.length) pool = state.items;
    }
    return state.items.indexOf(pool[Math.floor(Math.random() * pool.length)]);
  }
  if (state.index + 1 < n) return state.index + 1;
  return state.repeat === 'all' || !auto ? 0 : -1;
}

function next(auto = false) {
  const i = nextIndex(auto);
  if (i < 0) {
    stop();
    state.played.clear();
    return;
  }
  playIndex(i);
}

function prev() {
  if (media.currentTime > 3) { media.currentTime = 0; return; }
  if (state.shuffle && state.history.length > 1) {
    state.history.pop();
    const it = state.history.pop();
    playIndex(state.items.indexOf(it));
    return;
  }
  const n = state.items.length;
  if (!n) return;
  playIndex(state.index > 0 ? state.index - 1 : state.repeat === 'all' ? n - 1 : 0);
}

function stop() {
  media.pause();
  if (media.src) media.currentTime = 0;
  appEl.classList.remove('playing');
}

function togglePlay() {
  if (!state.items.length) { openFiles(); return; }
  if (state.index < 0) { playIndex(0); return; }
  if (media.paused) {
    audio.resume();
    media.play().catch(() => {});
  } else {
    media.pause();
  }
}

function seekBy(sec) {
  if (Number.isFinite(media.duration)) media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + sec));
}

function updateNowPlaying() {
  const it = current();
  if (!it) {
    $('#meta-title').textContent = 'No track';
    $('#meta-artist').textContent = '';
    api.setTitle('Aurora Player');
    viz?.setTrack({ title: '', artist: '', album: '' });
    setCover(null);
    return;
  }
  const d = display(it);
  $('#meta-title').textContent = d.title;
  $('#meta-artist').textContent = [d.artist, d.album].filter(Boolean).join(' — ');
  api.setTitle(`${d.title}${d.artist ? ` — ${d.artist}` : ''} - Aurora Player`);
  viz?.setTrack(d);
}

media.addEventListener('loadedmetadata', () => {
  appEl.classList.toggle('video', media.videoWidth > 0);
});
media.addEventListener('playing', () => {
  state.errorsInRow = 0;
  const it = current();
  if (it?.error) { it.error = false; updateRow(it); }
});
media.addEventListener('play', () => appEl.classList.add('playing'));
media.addEventListener('pause', () => appEl.classList.remove('playing'));
media.addEventListener('ended', () => next(true));
media.addEventListener('error', () => {
  const it = current();
  if (!it || !media.getAttribute('src')) return;
  it.error = true;
  updateRow(it);
  toast(`Can't play "${it.name}": unsupported format or damaged file`, 3500);
  state.errorsInRow++;
  if (state.errorsInRow < state.items.length) setTimeout(() => next(true), 700);
  else stop();
});

// ---------------------------------------------------------------- visualizations

const vizLabel = (p) => `${p.group}: ${p.name}`;

function setViz(id, announce = true) {
  if (!viz) return;
  const p = viz.select(id);
  store.set('preset', p.id);
  $('#viz-name').textContent = vizLabel(p);
  if (announce) toast(vizLabel(p));
}

function stepViz(dir) {
  if (!viz) return;
  const i = PRESETS.findIndex((p) => p.id === viz.current.id);
  setViz(PRESETS[(i + dir + PRESETS.length) % PRESETS.length].id);
}

function randomViz() {
  const pool = PRESETS.filter((p) => p.id !== 'album-art' && p.id !== viz.current.id);
  setViz(pool[Math.floor(Math.random() * pool.length)].id);
}

function showMenu() {
  api.contextMenu({
    groups: PRESET_GROUPS,
    current: viz?.current.id,
    playing: !media.paused,
    shuffle: state.shuffle,
    repeat: state.repeat,
    playlist: appEl.classList.contains('show-playlist'),
    vizPerTrack: state.vizPerTrack,
  });
}

// ---------------------------------------------------------------- commands and options

async function openFiles(folder = false) {
  const files = await api.openDialog(folder);
  if (files.length) addFiles(files);
}

function setShuffle(on) {
  state.shuffle = on;
  store.set('shuffle', on);
  $('#btn-shuffle').classList.toggle('on', on);
  state.played.clear();
  if (current()) state.played.add(current());
}

function setRepeat(mode) {
  state.repeat = mode;
  store.set('repeat', mode);
  const b = $('#btn-repeat');
  b.classList.toggle('on', mode !== 'off');
  b.classList.toggle('one', mode === 'one');
  b.title = { off: 'Repeat: off', all: 'Repeat: whole playlist', one: 'Repeat: current track' }[mode];
}

function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  store.set('volume', state.volume);
  const el = $('#volume');
  el.value = state.volume;
  el.style.setProperty('--v', `${state.volume * 100}%`);
  if (state.volume > 0 && state.muted) state.muted = false;
  applyVolume();
}

function applyVolume() {
  // perceptual curve: a linear slider sounds more natural with quadratic attenuation
  audio.setVolume(state.muted ? 0 : state.volume * state.volume);
  appEl.classList.toggle('muted', state.muted || state.volume === 0);
}

function toggleMute() {
  state.muted = !state.muted;
  applyVolume();
}

function togglePlaylist(force) {
  const on = appEl.classList.toggle('show-playlist', force);
  $('#btn-playlist').classList.toggle('active', on);
  store.set('playlist', on);
  if (on) highlightCurrent();
}

api.onMenu((cmd, arg) => {
  switch (cmd) {
    case 'playpause': togglePlay(); break;
    case 'stop': stop(); break;
    case 'prev': prev(); break;
    case 'next': next(); break;
    case 'viz': setViz(arg); break;
    case 'viz-next': stepViz(1); break;
    case 'viz-prev': stepViz(-1); break;
    case 'viz-per-track': state.vizPerTrack = !state.vizPerTrack; store.set('vizPerTrack', state.vizPerTrack); break;
    case 'open': openFiles(); break;
    case 'open-folder': openFiles(true); break;
    case 'playlist': togglePlaylist(); break;
    case 'fullscreen': api.toggleFullscreen(); break;
    case 'shuffle': setShuffle(!state.shuffle); break;
    case 'repeat': setRepeat(arg); break;
    default: break;
  }
});

api.onFiles((files, append) => addFiles(files, { append }));
api.onFullscreen((on) => appEl.classList.toggle('fullscreen', on));
api.onToast((text) => toast(text, 3500));

// ---------------------------------------------------------------- UI wiring

const on = (sel, ev, fn) => $(sel).addEventListener(ev, fn);

// Buttons never take focus, so Space doesn't "click" the last button pressed.
document.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

on('#btn-play', 'click', togglePlay);
on('#btn-stop', 'click', stop);
on('#btn-prev', 'click', prev);
on('#btn-next', 'click', () => next());
on('#btn-shuffle', 'click', () => setShuffle(!state.shuffle));
on('#btn-repeat', 'click', () => setRepeat({ off: 'all', all: 'one', one: 'off' }[state.repeat]));
on('#btn-mute', 'click', toggleMute);
on('#volume', 'input', (e) => setVolume(Number(e.target.value)));
on('#volume', 'change', (e) => e.target.blur());
on('#volume', 'wheel', (e) => { e.preventDefault(); setVolume(state.volume + (e.deltaY < 0 ? 0.05 : -0.05)); });
on('#btn-full', 'click', () => api.toggleFullscreen());
on('#btn-open', 'click', () => openFiles());
on('#btn-playlist', 'click', () => togglePlaylist());
on('#btn-viz-menu', 'click', showMenu);
on('#viz-name', 'click', showMenu);
on('#viz-prev', 'click', () => stepViz(-1));
on('#viz-next', 'click', () => stepViz(1));
on('#empty-open', 'click', () => openFiles());
on('#empty-folder', 'click', () => openFiles(true));
on('#empty-default', 'click', () => api.setDefault());
on('#pl-add', 'click', async () => addFiles(await api.openDialog(false), { append: true }));
on('#pl-clear', 'click', clearPlaylist);

$('#stage').addEventListener('dblclick', (e) => { if (!e.target.closest('#playlist, #empty')) api.toggleFullscreen(); });
$('#stage').addEventListener('click', (e) => {
  if (appEl.classList.contains('show-playlist') && !e.target.closest('#playlist')) togglePlaylist(false);
});
window.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#controls input')) return;
  e.preventDefault();
  showMenu();
});

// playlist: selection, double-click, removal, reordering
list.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const i = Number(li.dataset.index);
  if (e.target.closest('.pl-rm')) { removeIndex(i); return; }
  state.selected = i;
  highlightCurrent();
});
list.addEventListener('dblclick', (e) => {
  const li = e.target.closest('li');
  if (li && !e.target.closest('.pl-rm')) playIndex(Number(li.dataset.index));
});

let dragFrom = -1;
list.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  dragFrom = Number(li.dataset.index);
  e.dataTransfer.setData('application/x-aurora-item', String(dragFrom));
  e.dataTransfer.effectAllowed = 'move';
});
list.addEventListener('dragover', (e) => {
  if (dragFrom < 0) return;
  e.preventDefault();
  for (const li of list.querySelectorAll('.drag-over')) li.classList.remove('drag-over');
  e.target.closest('li')?.classList.add('drag-over');
});
list.addEventListener('drop', (e) => {
  if (dragFrom < 0) return;
  e.preventDefault();
  e.stopPropagation();
  const li = e.target.closest('li');
  moveItem(dragFrom, li ? Number(li.dataset.index) : state.items.length);
  dragFrom = -1;
});
list.addEventListener('dragend', () => {
  dragFrom = -1;
  for (const li of list.querySelectorAll('.drag-over')) li.classList.remove('drag-over');
});

// files and folders dragged from File Explorer
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  appEl.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; appEl.classList.remove('dragging'); }
});
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  appEl.classList.remove('dragging');
  if (!hasFiles(e)) return;
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  const files = await api.expand(paths);
  if (!files.length) { toast('No supported media files'); return; }
  addFiles(files, { append: e.ctrlKey || !!e.target.closest('#playlist') });
});

// seek bar
const seek = $('#seek');
let seeking = false;
const seekRatio = (e) => {
  const r = seek.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
};
seek.addEventListener('pointerdown', (e) => {
  if (!Number.isFinite(media.duration)) return;
  seeking = true;
  seek.classList.add('dragging');
  seek.setPointerCapture(e.pointerId);
  media.currentTime = seekRatio(e) * media.duration;
});
seek.addEventListener('pointermove', (e) => {
  const ratio = seekRatio(e);
  const tip = $('#seek-tip');
  tip.style.left = `${ratio * 100}%`;
  tip.textContent = fmt(ratio * (media.duration || 0));
  if (seeking) media.currentTime = ratio * media.duration;
});
seek.addEventListener('pointerup', () => { seeking = false; seek.classList.remove('dragging'); });

// keyboard (Windows Media Player style shortcuts)
document.addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const ctrl = e.ctrlKey;
  if (k === ' ' || (ctrl && k === 'p')) togglePlay();
  else if (ctrl && k === 'f') next();
  else if (ctrl && k === 'b') prev();
  else if (ctrl && k === 's') stop();
  else if (ctrl && k === 'o') openFiles();
  else if (k === 'ArrowRight') seekBy(ctrl ? 30 : 5);
  else if (k === 'ArrowLeft') seekBy(ctrl ? -30 : -5);
  else if (k === 'ArrowUp') setVolume(state.volume + 0.05);
  else if (k === 'ArrowDown') setVolume(state.volume - 0.05);
  else if (k === 'F11' || (k === 'Enter' && e.altKey)) api.toggleFullscreen();
  else if (k === 'Escape') api.exitFullscreen();
  else if (k === 'v') stepViz(e.shiftKey ? -1 : 1);
  else if (k === 'm') toggleMute();
  else if (k === 'l') togglePlaylist();
  else if (k === 'Delete' && state.selected >= 0) removeIndex(state.selected);
  else return;
  e.preventDefault();
});

// in full screen the controls hide while the mouse is idle
let idleTimer = 0;
const wake = () => {
  appEl.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (appEl.classList.contains('fullscreen') && !media.paused && !$('#controls').matches(':hover')) appEl.classList.add('idle');
  }, 2500);
};
window.addEventListener('mousemove', wake);
window.addEventListener('mousedown', wake);

// ---------------------------------------------------------------- render loop

let lastTime = '';
function updateTime() {
  const dur = media.duration;
  const cur = media.currentTime;
  const ok = Number.isFinite(dur) && dur > 0;
  if (!seeking) {
    const pct = ok ? `${(cur / dur) * 100}%` : '0%';
    $('#seek-fill').style.width = pct;
    $('#seek-thumb').style.left = pct;
  }
  const buffered = ok && media.buffered.length ? media.buffered.end(media.buffered.length - 1) / dur : 0;
  $('#seek-buffer').style.width = `${buffered * 100}%`;
  const t = `${fmt(cur)} / ${ok ? fmt(dur) : '00:00'}`;
  if (t !== lastTime) { $('#time').textContent = t; lastTime = t; }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
  last = now;
  audio.update(dt);
  if (viz && !appEl.classList.contains('video')) viz.render(audio.data);
  updateTime();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- startup

setShuffle(state.shuffle);
setRepeat(state.repeat);
setVolume(state.volume);
if (viz) setViz(viz.current.id, false);
else $('#viz-name').textContent = 'Visualizations unavailable (WebGL2)';
togglePlaylist(store.get('playlist', false));
renderPlaylist();
updateNowPlaying();
requestAnimationFrame(frame);
api.ready();
