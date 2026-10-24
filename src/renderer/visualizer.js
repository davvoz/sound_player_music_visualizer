// Visualization engine.
// Like the classic Windows Media Player plug-ins (Ambience, Battery, Alchemy) it uses a feedback buffer:
// each frame takes the previous image, warps it (zoom, rotation, swirl, ripples, turbulence),
// fades and recolors it; the current frame's audio-reactive shapes (2D canvas) are drawn on top.

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const WARP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPrev;
uniform sampler2D uOverlay;
uniform vec2 uRes;
uniform float uTime, uZoom, uRot, uTwirl, uRippleAmp, uRippleFreq, uRippleSpeed;
uniform float uNoiseAmp, uNoiseScale, uDecay, uHue, uBlur, uEdge, uAdd, uFloor, uPush;
uniform vec2 uShift, uCenter;
uniform vec3 uTint;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 hueRot(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float cs = cos(a), sn = sin(a);
  yiq.yz = mat2(cs, sn, -sn, cs) * yiq.yz;
  return toRGB * yiq;
}
void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5 - uCenter) * vec2(aspect, 1.0);
  float r = length(p);
  p /= uZoom;
  float a = uRot + uTwirl * max(0.0, 1.0 - r * 1.4);
  p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;
  vec2 dir = p / max(r, 1e-4);
  p -= dir * uPush * r;
  p += dir * sin(r * uRippleFreq - uTime * uRippleSpeed) * uRippleAmp;
  p += (vec2(noise(p * uNoiseScale + uTime * 0.6), noise(p * uNoiseScale + 17.3 - uTime * 0.6)) - 0.5) * uNoiseAmp;
  p -= uShift;
  vec2 uv = p / vec2(aspect, 1.0) + 0.5 + uCenter;

  vec3 c = texture(uPrev, uv).rgb;
  if (uBlur > 0.0) {
    vec2 o = uBlur / uRes;
    c = (c * 2.0 + texture(uPrev, uv + vec2(o.x, 0.0)).rgb + texture(uPrev, uv - vec2(o.x, 0.0)).rgb
         + texture(uPrev, uv + vec2(0.0, o.y)).rgb + texture(uPrev, uv - vec2(0.0, o.y)).rgb) / 6.0;
  }
  if (uEdge < 0.5) {
    vec2 e = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    c *= e.x * e.y;
  }
  c = max(hueRot(c, uHue) * uTint * uDecay - uFloor, 0.0);

  vec4 ov = texture(uOverlay, vUv);
  c = mix(c * (1.0 - ov.a) + ov.rgb, c + ov.rgb, uAdd);
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uKaleido, uKRot, uMirror;
void main() {
  vec2 uv = vUv;
  if (uKaleido > 0.5) {
    float aspect = uRes.x / uRes.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p);
    float seg = 6.2831853 / uKaleido;
    float a = mod(atan(p.y, p.x) + uKRot, seg);
    a = abs(a - seg * 0.5);
    uv = vec2(cos(a), sin(a)) * r / vec2(aspect, 1.0) + 0.5;
  }
  if (uMirror > 0.5) uv.x = 0.5 - abs(uv.x - 0.5);
  outColor = vec4(texture(uTex, uv).rgb, 1.0);
}`;

export const DEFAULT_PARAMS = {
  zoom: 1, rot: 0, twirl: 0, push: 0,
  rippleAmp: 0, rippleFreq: 30, rippleSpeed: 3,
  noiseAmp: 0, noiseScale: 4,
  shift: [0, 0], center: [0, 0],
  decay: 0, hue: 0, tint: [1, 1, 1], blur: 0,
  edge: 0, add: 1,
  kaleido: 0, krot: 0, mirror: 0,
};

const MAX_PIXELS = 1920 * 1200;

export class Visualizer {
  constructor(canvas, presets) {
    this.canvas = canvas;
    this.presets = presets;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.floatFB = !!gl.getExtension('EXT_color_buffer_float');

    this.overlay = document.createElement('canvas');
    this.ctx = this.overlay.getContext('2d');

    this.warp = this.#program(WARP);
    this.display = this.#program(DISPLAY);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const prog of [this.warp, this.display]) {
      const loc = gl.getAttribLocation(prog.p, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    this.overlayTex = this.#texture(gl.CLAMP_TO_EDGE);
    this.targets = [];
    this.w = 0;
    this.h = 0;
    this.env = { cover: null, title: '', artist: '', album: '' };
    this.time = 0;
    this.select(presets[0].id);
  }

  #program(fragSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  #texture(wrap) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  #resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
    let h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (w * h > MAX_PIXELS) {
      const s = Math.sqrt(MAX_PIXELS / (w * h));
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    if (w === this.w && h === this.h) return false;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.overlay.width = w;
    this.overlay.height = h;

    const gl = this.gl;
    for (const t of this.targets) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    this.targets = [0, 1].map(() => {
      const tex = this.#texture(gl.MIRRORED_REPEAT);
      if (this.floatFB) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.src = 0;
    return true;
  }

  #clear() {
    const gl = this.gl;
    for (const t of this.targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get current() { return this.preset; }

  select(id) {
    const p = this.presets.find((x) => x.id === id) || this.presets[0];
    this.preset = p;
    this.state = {};
    this.#resize();
    p.init?.(this.state, this.w, this.h);
    this.#clear();
    return p;
  }

  setTrack(info) {
    Object.assign(this.env, info);
  }

  render(a) {
    if (this.#resize()) this.preset.init?.(this.state, this.w, this.h);
    const gl = this.gl;
    const { w, h, ctx } = this;
    const P = { ...DEFAULT_PARAMS, ...(this.preset.params ? this.preset.params(a, this.state, w, h) : null) };
    const k = a.k;
    this.time += a.dt;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    this.preset.draw(ctx, a, this.state, w, h, this.env);

    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.overlay);

    // feedback pass (parameters are tuned for 60 fps and scaled to the actual frame time)
    const src = this.targets[this.src];
    const dst = this.targets[1 - this.src];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, w, h);
    const { u } = this.warp;
    gl.useProgram(this.warp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(u.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.uniform1i(u.uOverlay, 1);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uZoom, Math.pow(P.zoom, k));
    gl.uniform1f(u.uRot, P.rot * k);
    gl.uniform1f(u.uTwirl, P.twirl * k);
    gl.uniform1f(u.uPush, P.push * k);
    gl.uniform1f(u.uRippleAmp, P.rippleAmp * k);
    gl.uniform1f(u.uRippleFreq, P.rippleFreq);
    gl.uniform1f(u.uRippleSpeed, P.rippleSpeed);
    gl.uniform1f(u.uNoiseAmp, P.noiseAmp * k);
    gl.uniform1f(u.uNoiseScale, P.noiseScale);
    gl.uniform2f(u.uShift, P.shift[0] * k, P.shift[1] * k);
    gl.uniform2f(u.uCenter, P.center[0], P.center[1]);
    gl.uniform1f(u.uDecay, Math.pow(P.decay, k));
    gl.uniform1f(u.uHue, P.hue * k);
    gl.uniform3f(u.uTint, Math.pow(P.tint[0], k), Math.pow(P.tint[1], k), Math.pow(P.tint[2], k));
    gl.uniform1f(u.uBlur, P.blur);
    gl.uniform1f(u.uEdge, P.edge);
    gl.uniform1f(u.uAdd, P.add);
    gl.uniform1f(u.uFloor, (this.floatFB ? 0.0015 : 0.004) * k);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // screen pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const d = this.display;
    gl.useProgram(d.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(d.u.uTex, 0);
    gl.uniform2f(d.u.uRes, w, h);
    gl.uniform1f(d.u.uKaleido, P.kaleido);
    gl.uniform1f(d.u.uKRot, P.krot);
    gl.uniform1f(d.u.uMirror, P.mirror);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.src = 1 - this.src;
  }
}
