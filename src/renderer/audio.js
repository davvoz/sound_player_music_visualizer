// Audio analysis for the visualizations: log-spaced spectrum bands, waveform,
// bass/mid/treble levels and beat detection.

const BANDS = 64;
const WAVE = 512;

export class AudioEngine {
  constructor(mediaEl) {
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.source = this.ctx.createMediaElementSource(mediaEl);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.7;
    this.analyser.minDecibels = -88;
    this.analyser.maxDecibels = -22;
    // Volume is applied after the analyser, so visualizations react the same at any volume.
    this.gain = this.ctx.createGain();
    this.source.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    this.freqBytes = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Float32Array(this.analyser.fftSize);
    this.bandEdges = this.#computeEdges();

    this.history = new Float32Array(48);
    this.histPos = 0;
    this.lastBeat = 0;

    this.data = {
      spec: new Float32Array(BANDS),
      wave: new Float32Array(WAVE),
      bass: 0, mid: 0, treb: 0, vol: 0,
      beat: false, pulse: 0,
      t: 0, dt: 1 / 60, k: 1,
    };
  }

  #computeEdges() {
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const maxBin = this.analyser.frequencyBinCount - 1;
    const edges = [];
    for (let i = 0; i <= BANDS; i++) {
      const f = 32 * Math.pow(16000 / 32, i / BANDS);
      edges.push(Math.min(maxBin, Math.max(1, Math.round(f / binHz))));
    }
    return edges;
  }

  setVolume(v) {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  update(dt) {
    const d = this.data;
    d.dt = dt;
    d.k = Math.min(dt * 60, 4);
    d.t += dt;

    this.analyser.getByteFrequencyData(this.freqBytes);
    this.analyser.getFloatTimeDomainData(this.timeData);

    const e = this.bandEdges;
    for (let i = 0; i < BANDS; i++) {
      const lo = e[i];
      const hi = Math.max(lo, e[i + 1] - 1);
      let m = 0;
      for (let b = lo; b <= hi; b++) if (this.freqBytes[b] > m) m = this.freqBytes[b];
      // compensate for the natural energy drop-off at high frequencies
      d.spec[i] = Math.min(1, (m / 255) * (0.9 + 0.45 * (i / BANDS)));
    }

    const step = this.timeData.length / WAVE;
    for (let i = 0; i < WAVE; i++) d.wave[i] = this.timeData[Math.floor(i * step)];

    const avg = (a, b) => {
      let s = 0;
      for (let i = a; i < b; i++) s += d.spec[i];
      return s / (b - a);
    };
    const bassNow = avg(0, 9);
    const follow = (cur, target) => cur + (target - cur) * (target > cur ? 0.55 : 0.12) * d.k;
    d.bass = follow(d.bass, bassNow);
    d.mid = follow(d.mid, avg(9, 34));
    d.treb = follow(d.treb, avg(34, BANDS));

    let rms = 0;
    for (let i = 0; i < WAVE; i++) rms += d.wave[i] * d.wave[i];
    d.vol = follow(d.vol, Math.min(1, Math.sqrt(rms / WAVE) * 3));

    // Beat: bass energy clearly above its average over roughly the last second.
    let histAvg = 0;
    for (let i = 0; i < this.history.length; i++) histAvg += this.history[i];
    histAvg /= this.history.length;
    this.history[this.histPos] = bassNow;
    this.histPos = (this.histPos + 1) % this.history.length;

    d.beat = bassNow > histAvg * 1.25 + 0.03 && bassNow > 0.3 && d.t - this.lastBeat > 0.28;
    if (d.beat) this.lastBeat = d.t;
    d.pulse = d.beat ? 1 : d.pulse * Math.exp(-dt * 5);
  }
}
