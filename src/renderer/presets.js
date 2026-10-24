// Visualizations recreated in the style of the classic Windows Media Player 9-12 presets.
// Each preset defines:
//   params(a, s, w, h)  -> feedback parameters (see DEFAULT_PARAMS in visualizer.js), per-frame values at 60 fps
//   draw(ctx, a, s, w, h, env) -> the current frame's shapes on the 2D canvas
// `a` holds the audio data (spec, wave, bass, mid, treb, vol, beat, pulse, t, dt, k), `s` the preset state.

const TAU = Math.PI * 2;
const R = Math.random;
const lerp = (x, y, t) => x + (y - x) * t;
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
const mirror = (t) => (t < 0.5 ? t * 2 : 2 - t * 2);
const lw = (m) => Math.max(1.5, m * 0.005);

function sample(arr, x) {
  const f = clamp(x) * (arr.length - 1);
  const i = Math.floor(f);
  return lerp(arr[i], arr[Math.min(i + 1, arr.length - 1)], f - i);
}

function circleWave(ctx, a, cx, cy, r, amp) {
  const n = 160;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r + sample(a.wave, mirror(t)) * amp;
    const x = cx + Math.cos(t * TAU) * rr;
    const y = cy + Math.sin(t * TAU) * rr;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function lineWave(ctx, a, x0, x1, y, amp) {
  const n = 200;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = lerp(x0, x1, t);
    const py = y - sample(a.wave, t) * amp;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------------------------------------------------------------- base shapes (used by Alchemy)

const SHAPES = [
  (ctx, a, w, h, hue, al) => {
    const m = Math.min(w, h);
    ctx.strokeStyle = hsl(hue, 100, 62, al);
    ctx.lineWidth = lw(m);
    circleWave(ctx, a, w / 2, h / 2, m * (0.15 + a.bass * 0.1), m * 0.16);
  },
  (ctx, a, w, h, hue, al) => {
    ctx.strokeStyle = hsl(hue, 100, 62, al);
    ctx.lineWidth = lw(Math.min(w, h));
    lineWave(ctx, a, w * 0.08, w * 0.92, h / 2, h * 0.28);
  },
  (ctx, a, w, h, hue, al) => {
    const m = Math.min(w, h);
    const n = 48;
    ctx.lineWidth = lw(m);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const v = sample(a.spec, mirror(t) * 0.8);
      const ang = t * TAU + a.t * 0.3;
      const r0 = m * 0.05;
      const r1 = r0 + m * (0.03 + v * 0.35);
      ctx.strokeStyle = hsl(hue + t * 90, 100, 62, al);
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(ang) * r0, h / 2 + Math.sin(ang) * r0);
      ctx.lineTo(w / 2 + Math.cos(ang) * r1, h / 2 + Math.sin(ang) * r1);
      ctx.stroke();
    }
  },
  (ctx, a, w, h, hue, al) => {
    const m = Math.min(w, h);
    for (let j = 0; j < 6; j++) {
      const ang = a.t * (0.8 + j * 0.05) + (j * TAU) / 6;
      const rr = m * (0.18 + sample(a.spec, j / 6 * 0.6) * 0.15);
      ctx.fillStyle = hsl(hue + j * 40, 100, 65, al);
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(ang) * rr, h / 2 + Math.sin(ang) * rr, m * (0.008 + a.bass * 0.018), 0, TAU);
      ctx.fill();
    }
  },
  (ctx, a, w, h, hue, al) => {
    const m = Math.min(w, h);
    const n = 44;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const ang = t * TAU * 2.5 + a.t * 0.9;
      const r = t * m * 0.42;
      ctx.fillStyle = hsl(hue + t * 140, 100, 60, al);
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(ang) * r, h / 2 + Math.sin(ang) * r, m * (0.003 + sample(a.spec, t * 0.8) * 0.022), 0, TAU);
      ctx.fill();
    }
  },
  (ctx, a, w, h, hue, al) => {
    const m = Math.min(w, h);
    ctx.strokeStyle = hsl(hue, 100, 65, al);
    ctx.lineWidth = lw(m) * 0.8;
    ctx.beginPath();
    for (let i = 0; i < 512; i += 2) {
      const x = w / 2 + a.wave[i] * m * 0.5;
      const y = h / 2 + a.wave[(i + 96) % 512] * m * 0.5;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  },
];

// ---------------------------------------------------------------- Alchemy

function gene() {
  return {
    zoom: lerp(0.975, 1.035, R()),
    rot: lerp(-0.025, 0.025, R()),
    twirl: R() < 0.4 ? lerp(-0.05, 0.05, R()) : 0,
    rippleAmp: R() < 0.35 ? lerp(0.001, 0.005, R()) : 0,
    rippleFreq: lerp(15, 60, R()),
    noiseAmp: R() < 0.3 ? lerp(0.003, 0.012, R()) : 0,
    noiseScale: lerp(2, 8, R()),
    sx: R() < 0.2 ? lerp(-0.004, 0.004, R()) : 0,
    sy: R() < 0.3 ? lerp(-0.005, 0.005, R()) : 0,
    decay: lerp(0.93, 0.975, R()),
    hue: lerp(0.001, 0.015, R()),
    blur: lerp(0, 1.2, R()),
    kaleido: R() < 0.3 ? [4, 6, 8, 10][Math.floor(R() * 4)] : 0,
    mirror: R() < 0.15 ? 1 : 0,
    shape: Math.floor(R() * SHAPES.length),
    react: lerp(0.6, 1.5, R()),
    hueBase: R() * 360,
  };
}

const MORPH = 3.5;

const alchemy = {
  id: 'alchemy-random', group: 'Alchemy', name: 'Random',
  init(s) {
    s.cur = gene();
    s.next = gene();
    s.tm = 0;
    s.hold = 10 + R() * 12;
    s.mix = 0;
  },
  params(a, s) {
    s.tm += a.dt;
    if (s.tm > s.hold + MORPH) {
      s.cur = s.next;
      s.next = gene();
      s.tm = 0;
      s.hold = 10 + R() * 12;
    }
    const x = clamp((s.tm - s.hold) / MORPH);
    s.mix = x * x * (3 - 2 * x);
    const L = (k) => lerp(s.cur[k], s.next[k], s.mix);
    const D = (k) => (s.mix < 0.5 ? s.cur[k] : s.next[k]);
    const react = L('react');
    return {
      zoom: L('zoom') + a.bass * 0.03 * react,
      rot: L('rot') * (1 + a.mid * react),
      twirl: L('twirl') * (1 + a.bass * react),
      rippleAmp: L('rippleAmp') + a.pulse * 0.003 * react,
      rippleFreq: L('rippleFreq'),
      noiseAmp: L('noiseAmp'),
      noiseScale: L('noiseScale'),
      shift: [L('sx'), L('sy')],
      decay: L('decay'),
      hue: L('hue'),
      blur: L('blur'),
      kaleido: D('kaleido'),
      krot: a.t * 0.05,
      mirror: D('mirror'),
      edge: 1,
    };
  },
  draw(ctx, a, s, w, h) {
    ctx.globalCompositeOperation = 'lighter';
    const hue = lerp(s.cur.hueBase, s.next.hueBase, s.mix) + a.t * 20;
    if (s.mix < 1) SHAPES[s.cur.shape](ctx, a, w, h, hue, 1 - s.mix);
    if (s.mix > 0) SHAPES[s.next.shape](ctx, a, w, h, hue + 120, s.mix);
  },
};

// ---------------------------------------------------------------- Album Art

const albumArt = {
  id: 'album-art', group: 'Album Art', name: 'Album Cover',
  draw(ctx, a, s, w, h, env) {
    const m = Math.min(w, h);
    const bg = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#1b2c4a');
    bg.addColorStop(1, '#000000');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const size = m * 0.56 * (1 + a.pulse * 0.012);
    const cx = w / 2;
    const cy = h * 0.43 + Math.sin(a.t * 0.5) * m * 0.006;
    glow(ctx, cx, cy, size * (0.8 + a.bass * 0.25), `rgba(90,160,255,${0.12 + a.bass * 0.25})`);

    const img = env.cover;
    if (img && img.complete && img.naturalWidth) {
      const sw = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sw) / 2, sw, sw, cx - size / 2, cy - size / 2, size, size);
    } else {
      const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
      g.addColorStop(0, '#2b5fb8');
      g.addColorStop(1, '#0c1d3d');
      ctx.fillStyle = g;
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `${size * 0.5}px "Segoe UI Symbol", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♫', cx, cy);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - size / 2 + 0.5, cy - size / 2 + 0.5, size - 1, size - 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(m * 0.045)}px "Segoe UI", sans-serif`;
    ctx.fillText(env.title || '', cx, cy + size / 2 + m * 0.04, w * 0.9);
    ctx.fillStyle = 'rgba(200,215,235,0.8)';
    ctx.font = `${Math.round(m * 0.032)}px "Segoe UI", sans-serif`;
    ctx.fillText([env.artist, env.album].filter(Boolean).join(' — '), cx, cy + size / 2 + m * 0.1, w * 0.9);
  },
};

// ---------------------------------------------------------------- Ambience

const water = {
  id: 'ambience-water', group: 'Ambience', name: 'Water',
  init(s) { s.rings = []; },
  params: (a) => ({
    decay: 0.978, zoom: 0.997, rippleAmp: 0.0022 + a.pulse * 0.007, rippleFreq: 42, rippleSpeed: 5,
    blur: 1, tint: [0.95, 0.985, 1.02], hue: 0.0008, edge: 1,
  }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    ctx.lineWidth = lw(m) * 0.9;
    ctx.strokeStyle = hsl(200 + 20 * Math.sin(a.t * 0.2), 90, 72, 0.85);
    circleWave(ctx, a, w / 2, h / 2, m * (0.2 + a.bass * 0.06), m * 0.14);
    if (a.beat) s.rings.push({ x: w / 2 + (R() - 0.5) * w * 0.6, y: h / 2 + (R() - 0.5) * h * 0.6, r: m * 0.02, life: 1 });
    s.rings = s.rings.filter((r) => {
      r.r += m * 0.008 * a.k;
      r.life -= 0.025 * a.k;
      if (r.life <= 0) return false;
      ctx.strokeStyle = hsl(190, 100, 85, r.life * 0.8);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
      return true;
    });
  },
};

const anon = {
  id: 'ambience-anon', group: 'Ambience', name: 'Anon',
  params: (a) => ({
    decay: 0.955, zoom: 1.016 + a.bass * 0.03, rot: 0.012 * Math.sin(a.t * 0.11) + a.mid * 0.012,
    hue: 0.012, blur: 0.4, edge: 0,
  }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r0 = m * (0.06 + a.vol * 0.08);
    const spin = a.t * 0.6;
    ctx.strokeStyle = hsl(a.t * 47, 100, 62);
    ctx.lineWidth = lw(m);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const ang = t * TAU + spin;
      const rr = r0 * (1 + 0.6 * Math.sin(ang * 5 - spin * 2)) + sample(a.wave, mirror(t)) * m * 0.1;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  },
};

const swirl = {
  id: 'ambience-swirl', group: 'Ambience', name: 'Swirl',
  params: (a) => ({ decay: 0.97, twirl: 0.03 + a.bass * 0.05, zoom: 0.994, hue: 0.004, blur: 0.8, edge: 1 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const hue = a.t * 30;
    ctx.strokeStyle = hsl(hue, 100, 65);
    ctx.lineWidth = lw(m);
    lineWave(ctx, a, w * 0.15, w * 0.85, h / 2, h * 0.22);
    for (let j = 0; j < 2; j++) {
      const ang = a.t * 1.3 + j * Math.PI;
      ctx.fillStyle = hsl(hue + 180, 100, 70);
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(ang) * m * 0.3, h / 2 + Math.sin(ang) * m * 0.3, m * 0.012 * (1 + a.bass * 1.5), 0, TAU);
      ctx.fill();
    }
  },
};

const warp = {
  id: 'ambience-warp', group: 'Ambience', name: 'Warp',
  params: (a) => ({ decay: 0.9, zoom: 1.035 + a.bass * 0.07 + a.pulse * 0.03, rot: 0.004, hue: 0.003, edge: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.globalCompositeOperation = 'lighter';
    const count = Math.floor((4 + a.treb * 30 + a.vol * 20) * a.k);
    for (let i = 0; i < count; i++) {
      const ang = R() * TAU;
      const r = R() * m * 0.25;
      const sz = Math.max(1, m * 0.003 * (0.5 + R()));
      ctx.fillStyle = hsl(200 + R() * 60 + a.t * 10, 80, 80, 0.9);
      ctx.fillRect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, sz, sz);
    }
    ctx.strokeStyle = hsl(a.t * 20 + 180, 100, 70, 0.7);
    ctx.lineWidth = lw(m) * 0.7;
    circleWave(ctx, a, cx, cy, m * 0.05, m * 0.05);
  },
};

const blizzard = {
  id: 'ambience-blizzard', group: 'Ambience', name: 'Blizzard',
  init(s) { s.p = []; },
  params: (a) => ({ decay: 0.86, zoom: 1.006, blur: 0.5, rot: 0.002 + a.mid * 0.004, tint: [0.97, 0.99, 1], edge: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    let spawn = (2 + a.vol * 20 + a.pulse * 35) * a.k;
    while (spawn-- > 0 && s.p.length < 1500) {
      const ang = R() * TAU;
      const sp = m * (0.002 + R() * 0.01);
      s.p.push({ x: cx + Math.cos(ang) * m * 0.02, y: cy + Math.sin(ang) * m * 0.02, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, z: 0.4 + R() * 0.6 });
    }
    const boost = (0.5 + a.vol * 2 + a.bass) * a.k;
    ctx.fillStyle = '#eaf4ff';
    ctx.beginPath();
    s.p = s.p.filter((p) => {
      p.x += p.vx * boost;
      p.y += p.vy * boost;
      if (p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) return false;
      const d = Math.hypot(p.x - cx, p.y - cy) / m;
      const r = Math.max(0.8, m * 0.005 * p.z * (0.3 + d));
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, TAU);
      return true;
    });
    ctx.fill();
  },
};

const bubble = {
  id: 'ambience-bubble', group: 'Ambience', name: 'Bubble',
  init(s) { s.b = []; },
  params: () => ({ decay: 0.82, shift: [0, 0.0015], blur: 0.7, edge: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    if ((a.beat || R() < (0.03 + a.vol * 0.15) * a.k) && s.b.length < 80) {
      s.b.push({ x: R() * w, y: h + m * 0.1, r: m * (0.02 + R() * 0.07), vy: m * (0.002 + R() * 0.004), hue: 160 + R() * 140, ph: R() * TAU });
    }
    ctx.lineWidth = Math.max(1.2, m * 0.003);
    s.b = s.b.filter((b) => {
      b.y -= b.vy * a.k * (1 + a.vol * 2);
      b.ph += 0.05 * a.k;
      const r = b.r * (1 + a.bass * 0.35);
      if (b.y + r < 0) return false;
      const x = b.x + Math.sin(b.ph) * m * 0.02;
      ctx.beginPath();
      ctx.arc(x, b.y, r, 0, TAU);
      ctx.fillStyle = hsl(b.hue, 90, 60, 0.08);
      ctx.fill();
      ctx.strokeStyle = hsl(b.hue + a.t * 10, 90, 70, 0.9);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, b.y - r * 0.3, r * 0.35, Math.PI * 1.1, Math.PI * 1.6);
      ctx.stroke();
      return true;
    });
  },
};

const falloff = {
  id: 'ambience-falloff', group: 'Ambience', name: 'Falloff',
  params: (a) => ({ decay: 0.968, shift: [0, -0.005 - a.vol * 0.006], hue: 0.007, blur: 0.5, edge: 0 }),
  draw(ctx, a, s, w, h) {
    ctx.strokeStyle = hsl(a.t * 35, 100, 65);
    ctx.lineWidth = lw(Math.min(w, h));
    lineWave(ctx, a, 0, w, h * 0.14, h * 0.12);
  },
};

// ---------------------------------------------------------------- Bars and Waves

const bars = {
  id: 'bars', group: 'Bars and Waves', name: 'Bars',
  init(s) { s.peak = new Float32Array(48); s.vel = new Float32Array(48); },
  draw(ctx, a, s, w, h) {
    const n = 40;
    const gap = Math.max(1, w * 0.0045);
    const bw = (w - gap * (n + 1)) / n;
    const base = h * 0.9;
    const maxH = h * 0.78;
    const cap = Math.max(2, h * 0.008);
    const g = ctx.createLinearGradient(0, base, 0, base - maxH);
    g.addColorStop(0, '#08206b');
    g.addColorStop(0.4, '#1c6cf0');
    g.addColorStop(0.75, '#58c8ff');
    g.addColorStop(1, '#e6fbff');
    for (let i = 0; i < n; i++) {
      const v = Math.pow(sample(a.spec, (i / (n - 1)) * 0.9), 1.15);
      const bh = v * maxH;
      const x = gap + i * (bw + gap);
      ctx.fillStyle = g;
      ctx.fillRect(x, base - bh, bw, bh);
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x, base + gap, bw, Math.min(bh * 0.25, h - base));
      ctx.globalAlpha = 1;
      if (bh >= s.peak[i]) { s.peak[i] = bh; s.vel[i] = 0; }
      else { s.vel[i] += h * 0.00035 * a.k; s.peak[i] = Math.max(0, s.peak[i] - s.vel[i] * a.k); }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, base - s.peak[i] - cap - gap, bw, cap);
    }
  },
};

const oceanMist = {
  id: 'ocean-mist', group: 'Bars and Waves', name: 'Ocean Mist',
  params: (a) => ({
    decay: 0.972, shift: [0, 0.0028 + a.vol * 0.003], zoom: 1.001, blur: 1.2, noiseAmp: 0.004, noiseScale: 3,
    hue: 0.0012, tint: [0.98, 1, 1.01], edge: 1,
  }),
  draw(ctx, a, s, w, h) {
    // spectrum outline only: the rising, fading feedback is what creates the "mist"
    const hue = 195 + 35 * Math.sin(a.t * 0.06);
    const amp = h * 0.34;
    const n = 120;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const y = h * 0.97 - sample(a.spec, Math.abs(x - 0.5) * 2 * 0.85) * amp;
      if (i) ctx.lineTo(x * w, y); else ctx.moveTo(x * w, y);
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = hsl(hue + 20, 90, 55, 0.1);
    ctx.lineWidth = h * 0.03;
    ctx.stroke();
    ctx.strokeStyle = hsl(hue - 15, 100, 80, 0.55);
    ctx.lineWidth = Math.max(1.5, h * 0.004);
    ctx.stroke();
  },
};

const fireStorm = {
  id: 'fire-storm', group: 'Bars and Waves', name: 'Fire Storm',
  params: (a) => ({
    decay: 0.958, shift: [0, 0.006 + a.bass * 0.006], noiseAmp: 0.02, noiseScale: 6, blur: 2,
    tint: [1, 0.935, 0.78], edge: 0,
  }),
  draw(ctx, a, s, w, h) {
    const n = 64;
    const bw = w / n;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const v = sample(a.spec, Math.abs(i / (n - 1) - 0.5) * 2 * 0.8);
      const bh = h * (0.02 + v * 0.3);
      const g = ctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, 'rgba(255,255,220,0.95)');
      g.addColorStop(0.5, 'rgba(255,200,60,0.8)');
      g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(i * bw, h - bh, bw + 1, bh);
    }
    const sparks = Math.floor((a.treb * 12 + a.pulse * 10) * a.k);
    ctx.fillStyle = 'rgba(255,220,120,0.9)';
    for (let i = 0; i < sparks; i++) ctx.fillRect(R() * w, h - R() * h * 0.35, 2, 2);
  },
};

const scope = {
  id: 'scope', group: 'Bars and Waves', name: 'Scope',
  params: () => ({ decay: 0.8, blur: 0.5 }),
  draw(ctx, a, s, w, h) {
    const hue = a.t * 25;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, hsl(hue + i * 60, 100, 60));
    const lineW = Math.max(1.5, h * 0.005);
    ctx.strokeStyle = g;
    ctx.fillStyle = g;
    ctx.lineWidth = lineW;
    ctx.lineJoin = 'round';
    const n = 256;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h / 2 - a.wave[i * 2] * h * 0.38;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < n; i += 4) {
      const x = (i / (n - 1)) * w;
      const y = h / 2 - a.wave[i * 2] * h * 0.38;
      ctx.moveTo(x + lineW * 1.3, y);
      ctx.arc(x, y, lineW * 1.3, 0, TAU);
    }
    ctx.fill();
  },
};

// ---------------------------------------------------------------- Battery

const kaleidovision = {
  id: 'battery-kaleidovision', group: 'Battery', name: 'Kaleidovision',
  params: (a) => ({
    decay: 0.955, zoom: 1.01 + a.bass * 0.025, rot: 0.012, twirl: 0.012, hue: 0.01, blur: 0.5, edge: 1,
    kaleido: 8, krot: a.t * 0.07,
  }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 6; j++) {
      const ang = a.t * (0.4 + j * 0.07) + j * 1.3;
      const rr = m * (0.08 + 0.22 * (0.5 + 0.5 * Math.sin(a.t * 0.3 + j)));
      const v = sample(a.spec, (j / 6) * 0.7);
      glow(ctx, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, m * (0.015 + v * 0.07), hsl(a.t * 30 + j * 60, 100, 60, 0.9));
    }
    const ang = a.t * 0.5;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    ctx.strokeStyle = hsl(a.t * 30 + 180, 100, 70, 0.9);
    ctx.lineWidth = lw(m);
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const d = t * m * 0.48;
      const o = sample(a.wave, t) * m * 0.08;
      const x = cx + Math.cos(ang) * d + nx * o;
      const y = cy + Math.sin(ang) * d + ny * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  },
};

const eventHorizon = {
  id: 'battery-event-horizon', group: 'Battery', name: 'Event Horizon',
  params: (a) => ({ decay: 0.975, zoom: 0.968 - a.bass * 0.02, rot: 0.022 + a.mid * 0.03, hue: 0.003, blur: 0.8, edge: 0, add: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    ctx.lineWidth = Math.max(2, m * 0.006);
    ctx.strokeStyle = hsl(30 + 20 * Math.sin(a.t * 0.3), 100, 58 + a.pulse * 25);
    circleWave(ctx, a, w / 2, h / 2, m * 0.42, m * 0.08);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, m * (0.045 + a.bass * 0.02), 0, TAU);
    ctx.fill();
  },
};

const freakyCircles = {
  id: 'battery-freaky-circles', group: 'Battery', name: 'Dance of the Freaky Circles',
  params: () => ({ decay: 0.93, hue: 0.006, blur: 0.5, zoom: 1.002, edge: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const t = a.t;
    ctx.lineWidth = lw(m);
    for (let j = 0; j < 7; j++) {
      const x = w / 2 + Math.sin(t * (0.5 + j * 0.11) + j * 1.7) * w * 0.33;
      const y = h / 2 + Math.cos(t * (0.7 + j * 0.09) + j * 2.3) * h * 0.32;
      const r = m * (0.025 + sample(a.spec, (j / 7) * 0.8) * 0.11);
      ctx.strokeStyle = hsl(j * 51 + t * 40, 100, 62);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    }
  },
};

// ---------------------------------------------------------------- Spikes

const cosmicRays = {
  id: 'spikes-cosmic-rays', group: 'Spikes', name: 'Cosmic Rays',
  params: (a) => ({ decay: 0.72, zoom: 1.012 + a.bass * 0.01, blur: 0.6, edge: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const n = 90;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1.5, m * 0.0055);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const v = sample(a.spec, mirror(t) * 0.85);
      const ang = t * TAU + a.t * 0.15;
      const r0 = m * 0.035;
      const r1 = r0 + m * (0.02 + v * 0.45);
      ctx.strokeStyle = i % 2 ? hsl(200 + a.t * 20, 100, 65) : hsl(320 + a.t * 20, 100, 65);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }
    glow(ctx, cx, cy, m * (0.06 + a.bass * 0.07), 'rgba(255,255,255,0.9)');
  },
};

const fireworks = {
  id: 'spikes-fireworks', group: 'Spikes', name: 'Fireworks',
  init(s) { s.p = []; s.idle = 0; },
  params: () => ({ decay: 0.9, blur: 0.8, shift: [0, -0.0006], edge: 0 }),
  draw(ctx, a, s, w, h) {
    const m = Math.min(w, h);
    s.idle += a.dt;
    if ((a.beat || s.idle > 1.6) && s.p.length < 2500) {
      s.idle = 0;
      const x = w * (0.15 + R() * 0.7);
      const y = h * (0.15 + R() * 0.5);
      const hue = R() * 360;
      const n = 70 + Math.floor(a.bass * 140);
      for (let i = 0; i < n; i++) {
        const ang = R() * TAU;
        const sp = m * (0.003 + R() * 0.011) * (0.7 + a.bass);
        s.p.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, hue: hue + (R() - 0.5) * 40 });
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    const grav = m * 0.00012 * a.k;
    const drag = Math.pow(0.985, a.k);
    const size = Math.max(1.5, m * 0.004);
    s.p = s.p.filter((p) => {
      p.vx *= drag;
      p.vy = p.vy * drag + grav;
      p.x += p.vx * a.k;
      p.y += p.vy * a.k;
      p.life -= 0.011 * a.k;
      if (p.life <= 0) return false;
      ctx.fillStyle = hsl(p.hue, 100, 55 + p.life * 30, p.life);
      ctx.fillRect(p.x, p.y, size, size);
      return true;
    });
  },
};

export const PRESETS = [
  alchemy,
  albumArt,
  anon, blizzard, bubble, falloff, swirl, warp, water,
  bars, fireStorm, oceanMist, scope,
  freakyCircles, eventHorizon, kaleidovision,
  cosmicRays, fireworks,
];

export const PRESET_GROUPS = PRESETS.reduce((groups, p) => {
  let g = groups.find((x) => x.name === p.group);
  if (!g) groups.push((g = { name: p.group, items: [] }));
  g.items.push({ id: p.id, name: p.name });
  return groups;
}, []);
