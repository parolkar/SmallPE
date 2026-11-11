// WebGL2 particle field for /lab/home: scattered points condense into the SmallPE logo, the eight
// dots of its arch stand for the eight specialist agents, and energy runs along the arch the way
// work runs down the pipeline. Ported from inloop-public-web's loop-field.ts; every particle is
// animated in the vertex shader, the CPU only uploads uniforms.
(function () {
  'use strict';

  var STRIDE = 8; // aA.xyzw + aB.xyzw
  var PRESETS = {
    low: { logo: 9000, dust: 900, dprCap: 1.5 },
    high: { logo: 26000, dust: 2800, dprCap: 1.5 }, // soft glows look identical above 1.5x
  };
  // Share of the logo budget per part; the wordmark takes the rest.
  var SHARE = { dots: 0.2, lines: 0.06, streams: 0.08, sparks: 0.04 };

  // Geometry of smallpe_logo_tight.svg, in its own units (viewBox 86 112 338 170).
  var VIEW = { x: 86, y: 112, w: 338, h: 170 };
  var DOTS = [
    [172, 175, 4.5], [196, 148, 4.5], [222, 128, 4.5], [249, 118, 5.5],
    [263, 118, 5.5], [290, 128, 4.5], [316, 148, 4.5], [340, 175, 4.5],
  ];
  var UNIT = 4 / VIEW.w; // the logo spans four world units
  var MASK_SCALE = 3;
  // The arch's share of the logo's width, dot edge to dot edge.
  var ARCH_SHARE = (DOTS[7][0] + DOTS[7][2] - (DOTS[0][0] - DOTS[0][2])) / VIEW.w;
  // Where the camera centres once the story zooms in on the arch, in world units.
  var ARCH_FOCUS = (VIEW.y + VIEW.h / 2 - 146) * UNIT;

  function toWorld(x, y) {
    return [(x - (VIEW.x + VIEW.w / 2)) * UNIT, (VIEW.y + VIEW.h / 2 - y) * UNIT];
  }

  var VERT = '#version 300 es\n' + [
    'precision highp float;',
    '// aA, wordmark/dot/line: world x, world y, place on the arch (0..7), seed',
    '//     stream: start (0..1), lateral offset, speed, seed',
    '//     spark: dot index, angle, speed, seed',
    'layout(location = 0) in vec4 aA;',
    '// scattered position xyz, kind (0 wordmark, 1 dust, 2 dot, 3 line, 4 stream, 5 spark)',
    'layout(location = 1) in vec4 aB;',
    '',
    'uniform vec2 uRes;',
    'uniform float uDpr;',
    'uniform float uTime;',
    'uniform float uMorph;  // 0 scattered -> 1 logo',
    'uniform float uScroll; // 0..1 as a free-running field leaves the viewport',
    'uniform vec2 uRot;     // yaw, pitch',
    'uniform vec2 uMouse;',
    'uniform float uMouseOn;',
    'uniform vec2 uCenter;',
    'uniform float uScale;',
    'uniform float uFocus;  // world y the camera centres on',
    'uniform float uActs;   // 0 hero .. 1 agent story',
    'uniform float uStep;   // 0 none, i + 1 while agent i is presented',
    'uniform float uWord;   // wordmark visibility',
    'uniform vec3 uDots[8];',
    '',
    'out vec3 vColor;',
    'out float vAlpha;',
    '',
    'const float PI = 3.14159265;',
    'const float TAU = 6.2831853;',
    'const float CAM = 6.5;',
    'const float FOCAL = 2.75;',
    'const vec3 BLUE = vec3(0.231, 0.510, 0.965);',
    'const vec3 SKY = vec3(0.576, 0.773, 0.992);',
    'const vec3 ICE = vec3(0.88, 0.93, 1.0);',
    'const vec3 DEEP = vec3(0.114, 0.306, 0.847);',
    'const vec3 AMBER = vec3(0.984, 0.749, 0.141);',
    '',
    'mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }',
    'mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }',
    '',
    'vec2 archAt(float a) {',
    '  float i = clamp(floor(a), 0.0, 6.0);',
    '  return mix(uDots[int(i)].xy, uDots[int(i) + 1].xy, a - i);',
    '}',
    '',
    'void main() {',
    '  float seed = aA.w;',
    '  float kind = aB.w;',
    '  float t = uTime;',
    '  vec3 p;',
    '  vec3 col;',
    '  float size;',
    '  float alpha;',
    '',
    '  if (kind < 0.5 || kind > 1.5) {',
    '    vec3 logoPos;',
    '    float place = aA.z; // position along the arch, 0 at Oracle .. 7 at Iris',
    '    float fade = 1.0;',
    '    if (kind < 3.5) {',
    '      // Wordmark, dots and connecting lines hold the exact logo and shimmer in place.',
    '      float jitter = kind > 1.5 && kind < 2.5 ? 0.006 : 0.01;',
    '      logoPos = vec3(aA.xy + jitter * vec2(sin(t * 1.3 + seed * 40.0), cos(t * 1.1 + seed * 23.0)), (fract(seed * 53.17) - 0.5) * 0.12);',
    '      if (kind < 0.5) place = clamp((aA.x / 2.0 + 0.5) * 7.0, 0.0, 7.0);',
    '    } else if (kind < 4.5) {',
    '      // Streams: work flowing down the pipeline, dot to dot.',
    '      place = fract(aA.x + t * aA.z) * 7.0;',
    '      vec2 a = archAt(place);',
    '      vec2 d = archAt(min(7.0, place + 0.02)) - archAt(max(0.0, place - 0.02));',
    '      vec2 n = normalize(vec2(-d.y, d.x) + 1e-5);',
    '      logoPos = vec3(a + n * aA.y * 0.035, (fract(seed * 31.7) - 0.5) * 0.08);',
    '    } else {',
    '      // Sparks peel off the dots and drift outward: the community around the team.',
    '      int i = int(aA.x);',
    '      place = aA.x;',
    '      float life = fract(t * (0.05 + 0.06 * fract(seed * 3.7)) + seed * 7.0);',
    '      vec2 dir = vec2(cos(aA.y), sin(aA.y));',
    '      logoPos = vec3(uDots[i].xy + dir * (uDots[i].z + life * aA.z), (fract(seed * 5.3) - 0.5) * life);',
    '      fade = sin(life * PI);',
    '    }',
    '',
    '    // Scattered points drift until the intro pulls them in, each on its own delay.',
    '    vec3 chaos = aB.xyz + 0.25 * vec3(sin(t * 0.4 + seed * TAU), cos(t * 0.33 + seed * 17.0), sin(t * 0.27 + seed * 9.0));',
    '    float m = smoothstep(seed * 0.45, seed * 0.45 + 0.55, uMorph);',
    '    m *= 1.0 - smoothstep(0.0, 1.0, uScroll) * 0.65;',
    '    p = mix(chaos, logoPos, m);',
    '    p.xy += vec2(-logoPos.y, logoPos.x) * sin(m * PI) * 0.35; // spiral in rather than fly straight',
    '',
    '    // Before the story a pulse runs the length of the arch; during it the agents light in turn.',
    '    float lead = fract(t * 0.11) * 10.0 - 1.5;',
    '    float idle = exp(-(place - lead) * (place - lead) * 2.5) * (1.0 - uActs);',
    '    float seen = smoothstep(place + 0.4, place + 0.9, uStep);',
    '    float visited = seen * uActs;',
    '    float dStep = uStep - 1.0 - place;',
    '    float presenting = exp(-dStep * dStep * 5.0) * uActs;',
    '    float pulse = max(idle, presenting);',
    '',
    '    float g = clamp(place / 7.0, 0.0, 1.0);',
    '    if (kind < 0.5) {',
    '      col = mix(mix(SKY, ICE, smoothstep(0.2, 0.9, g)), BLUE, fract(seed * 7.31) * 0.35);',
    '      alpha = mix(0.5, 0.85, fract(seed * 3.1)) * uWord;',
    '      size = mix(1.3, 2.4, seed * seed);',
    '      pulse *= 0.25 * uWord;',
    '    } else if (kind < 2.5) {',
    '      col = mix(ICE, SKY, 0.3 * fract(seed * 9.1));',
    '      alpha = 0.95;',
    '      size = mix(1.8, 3.2, seed);',
    '    } else if (kind < 3.5) {',
    '      col = mix(BLUE, SKY, 0.5);',
    '      alpha = 0.55;',
    '      size = mix(1.1, 1.8, seed);',
    '    } else if (kind < 4.5) {',
    '      col = ICE;',
    '      alpha = 0.9;',
    '      size = mix(1.4, 2.4, seed);',
    '    } else {',
    '      col = mix(SKY, ICE, seed);',
    '      alpha = 0.8 * fade;',
    '      size = mix(1.2, 2.2, seed);',
    '    }',
    '    // Agents already presented keep a calm blue glow, the ones still to come wait dimmed,',
    '    // and the current one burns amber.',
    '    col = mix(col, mix(BLUE, SKY, 0.4), visited * 0.5);',
    '    if (kind > 1.5) alpha *= 1.0 - 0.6 * uActs * (1.0 - seen);',
    '    col = mix(col, AMBER, clamp(pulse, 0.0, 1.0) * (kind > 0.5 ? 0.9 : 0.6));',
    '    size += pulse * (kind > 1.5 && kind < 2.5 ? 2.2 : 1.2) + visited * 0.4;',
    '    alpha = (alpha + pulse * 0.5) * mix(0.55, 1.0, m);',
    '  } else {',
    '    // Ambient dust gives the scene depth when it sways.',
    '    p = aB.xyz + 0.3 * vec3(sin(t * 0.05 + seed * TAU), cos(t * 0.04 + seed * 11.0), 0.0);',
    '    col = mix(SKY, DEEP, 0.3);',
    '    size = 1.0 + seed * 1.5;',
    '    alpha = 0.26;',
    '  }',
    '',
    '  p.y -= uFocus;',
    '  vec3 v = rotX(uRot.y) * rotY(uRot.x) * p * uScale;',
    '  float zc = CAM - v.z;',
    '  vec2 px = uCenter + vec2(v.x, -v.y) * FOCAL / zc * uRes.y * 0.5;',
    '',
    '  vec2 d = px - uMouse;',
    '  float push = exp(-dot(d, d) / 9000.0) * uMouseOn;',
    '  px += normalize(d + 1e-4) * push * 46.0;',
    '  col = mix(col, SKY, push * 0.6);',
    '',
    '  alpha *= mix(1.0, 0.35, clamp((zc - 4.0) / 5.0, 0.0, 1.0)); // fade with distance',
    '  vColor = col;',
    '  vAlpha = alpha;',
    '  gl_PointSize = size * (CAM / zc) * uDpr;',
    '  vec2 clip = px / uRes * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '}',
  ].join('\n');

  var FRAG = [
    '#version 300 es',
    'precision mediump float;',
    'in vec3 vColor;',
    'in float vAlpha;',
    'out vec4 outColor;',
    'void main() {',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0;',
    '  float r2 = dot(c, c);',
    '  if (r2 > 1.0) discard;',
    '  float a = exp(-r2 * 3.5) * vAlpha;',
    '  outColor = vec4(vColor * a, a);',
    '}',
  ].join('\n');

  var UNIFORMS = [
    'uRes', 'uDpr', 'uTime', 'uMorph', 'uScroll', 'uRot', 'uMouse', 'uMouseOn',
    'uCenter', 'uScale', 'uFocus', 'uActs', 'uStep', 'uWord', 'uDots',
  ];

  function compile(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[logo-field]', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function createProgram(gl) {
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[logo-field]', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  function resolveQuality(pref) {
    if (pref === 'low' || pref === 'high') return pref;
    var smallScreen = window.matchMedia('(max-width: 768px)').matches;
    var fewCores = (navigator.hardwareConcurrency || 8) <= 4;
    return smallScreen || fewCores ? 'low' : 'high';
  }

  var clamp01 = function (x) { return Math.min(1, Math.max(0, x)); };
  var easeInOut = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  // Rasterises the wordmark path into a fill mask so its particles reproduce the exact letters.
  var wordmarkCache = null;
  function loadWordmark(src) {
    if (!wordmarkCache) {
      wordmarkCache = fetch(src)
        .then(function (res) { return res.ok ? res.text() : ''; })
        .then(function (text) {
          var path = new DOMParser().parseFromString(text, 'image/svg+xml').getElementById('wordmark');
          var mask = document.createElement('canvas');
          mask.width = VIEW.w * MASK_SCALE;
          mask.height = VIEW.h * MASK_SCALE;
          var ctx = mask.getContext('2d', { willReadFrequently: true });
          if (!path || !ctx) return null;
          ctx.scale(MASK_SCALE, MASK_SCALE);
          ctx.translate(-VIEW.x, -VIEW.y);
          ctx.fill(new Path2D(path.getAttribute('d')));
          var pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
          var filled = [];
          for (var i = 3, px = 0; i < pixels.length; i += 4, px++) if (pixels[i] > 127) filled.push(px);
          if (!filled.length) return null;
          return function sample() {
            var px = filled[(Math.random() * filled.length) | 0];
            return toWorld(
              VIEW.x + ((px % mask.width) + Math.random()) / MASK_SCALE,
              VIEW.y + (Math.floor(px / mask.width) + Math.random()) / MASK_SCALE
            );
          };
        })
        .catch(function () { return null; });
    }
    return wordmarkCache;
  }

  /**
   * Mounts the field on a canvas. Options: quality ('auto' | 'low' | 'high'), anchor (element the
   * logo centres on), wordmark (false for the arch alone), width(cssW, cssH, portrait) (the logo's
   * on-screen width in CSS px), story(cssW, cssH, portrait) (where the arch sits during the story:
   * { x, y, arch } with its centre and width in CSS px), logoSrc (URL of the tight logo SVG).
   * Returns null when WebGL2 is unavailable, leaving the CSS background as the fallback.
   */
  function mountLogoField(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    var program = null;
    var vbo = null;
    var uniforms = {};
    var dotsWorld = new Float32Array(DOTS.length * 3);
    DOTS.forEach(function (d, i) {
      var w = toWorld(d[0], d[1]);
      dotsWorld.set([w[0], w[1], d[2] * UNIT], i * 3);
    });

    function setupGL() {
      program = createProgram(gl);
      if (!program) return false;
      UNIFORMS.forEach(function (n) { uniforms[n] = gl.getUniformLocation(program, n); });
      var vao = gl.createVertexArray();
      vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STRIDE * 4, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 16);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(program);
      gl.uniform3fv(uniforms.uDots, dotsWorld);
      return true;
    }
    if (!setupGL()) return null;

    var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var qualityPref = opts.quality || 'auto';
    var quality = resolveQuality(qualityPref);
    var sampleWord = null;
    var withWordmark = opts.wordmark !== false;
    var story = null;
    var acts = 0;
    var step = 0;
    var reducedMotion = reducedQuery.matches;
    var visible = true;
    var contextLost = false;

    var count = 0;
    var cssW = 1;
    var cssH = 1;
    var dpr = 1;
    var center = { x: 0, y: 0 };
    var time = 0;
    var last = performance.now();
    var raf = 0;
    var frames = 0;
    var fps = 0;
    var fpsClock = last;
    // Wall-clock start of the current auto-quality trial; slow devices barely advance animation time.
    var trialStart = last;
    var mouse = { x: 0, y: 0, on: 0, tx: 0, ty: 0, ton: 0 };

    function buildParticles() {
      var preset = PRESETS[quality];
      var word = withWordmark && sampleWord ? preset.logo : 0;
      var budget = preset.logo;
      var dots = Math.round(budget * (word ? SHARE.dots : 0.55));
      var lines = Math.round(budget * (word ? SHARE.lines : 0.15));
      var streams = Math.round(budget * (word ? SHARE.streams : 0.2));
      var sparks = Math.round(budget * (word ? SHARE.sparks : 0.1));
      word = word ? budget - dots - lines - streams - sparks : 0;
      var total = word + dots + lines + streams + sparks + preset.dust;
      var data = new Float32Array(total * STRIDE);
      var o = 0;
      var scatter = function () { return [rand(-5, 5), rand(-3.2, 3.2), rand(-3, 2.5)]; };
      var push = function (a, kind) {
        var s = scatter();
        data.set([a[0], a[1], a[2], a[3], s[0], s[1], s[2], kind], o);
        o += STRIDE;
      };
      var weights = DOTS.map(function (d) { return d[2] * d[2]; });
      var weightSum = weights.reduce(function (a, b) { return a + b; }, 0);
      var pickDot = function () {
        var r = Math.random() * weightSum;
        for (var i = 0; i < weights.length - 1; i++) if ((r -= weights[i]) < 0) return i;
        return weights.length - 1;
      };

      for (var i = 0; i < word; i++) {
        var w = sampleWord();
        push([w[0], w[1], 0, Math.random()], 0);
      }
      for (i = 0; i < dots; i++) {
        // Dense core with a soft halo, so each agent reads as a bright node.
        var k = pickDot();
        var r = DOTS[k][2] * UNIT * 1.25 * Math.sqrt(Math.random()) * (Math.random() < 0.85 ? 1 : 1.8);
        var a = Math.random() * Math.PI * 2;
        push([dotsWorld[k * 3] + Math.cos(a) * r, dotsWorld[k * 3 + 1] + Math.sin(a) * r, k, Math.random()], 2);
      }
      for (i = 0; i < lines; i++) {
        var place = Math.random() * 7;
        var j = Math.min(6, Math.floor(place));
        var f = place - j;
        push([
          dotsWorld[j * 3] + (dotsWorld[(j + 1) * 3] - dotsWorld[j * 3]) * f,
          dotsWorld[j * 3 + 1] + (dotsWorld[(j + 1) * 3 + 1] - dotsWorld[j * 3 + 1]) * f,
          place,
          Math.random(),
        ], 3);
      }
      for (i = 0; i < streams; i++) {
        var lateral = Math.sign(Math.random() - 0.5) * Math.pow(Math.random(), 1.4);
        push([Math.random(), lateral, rand(0.025, 0.05), Math.random()], 4);
      }
      for (i = 0; i < sparks; i++) {
        push([pickDot(), Math.random() * Math.PI * 2, rand(0.3, 1.6), Math.random()], 5);
      }
      for (i = 0; i < preset.dust; i++) {
        data.set([0, 0, 0, Math.random(), rand(-8, 8), rand(-4.5, 4.5), rand(-5, 2), 1], o);
        o += STRIDE;
      }
      count = total;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, PRESETS[quality].dprCap);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      var anchorRect = opts.anchor && opts.anchor.getBoundingClientRect();
      center.x = anchorRect ? anchorRect.left + anchorRect.width / 2 - rect.left : cssW / 2;
      center.y = anchorRect ? anchorRect.top + anchorRect.height / 2 - rect.top : cssH / 2;
    }

    var shouldRun = function () { return visible && !document.hidden && !reducedMotion && !contextLost; };

    function schedule() {
      if (!raf && !contextLost) raf = requestAnimationFrame(frame);
    }

    function frame(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      var running = shouldRun();
      if (running) time += dt;

      var k = 1 - Math.pow(0.001, dt);
      mouse.x += (mouse.tx - mouse.x) * k;
      mouse.y += (mouse.ty - mouse.y) * k;
      mouse.on += ((reducedMotion ? 0 : mouse.ton) - mouse.on) * k;
      var targetActs = story ? story.acts : 0;
      var targetStep = story ? story.step : 0;
      var follow = reducedMotion ? 1 : k * 1.5;
      acts += (targetActs - acts) * follow;
      step += (targetStep - step) * follow;

      var t = reducedMotion ? 6 : time;
      var morph = reducedMotion ? 1 : easeInOut(clamp01((time - 0.2) / 2.8));
      // A pinned story keeps its own stage, so only free-running fields loosen on scroll.
      var scroll = 0;
      if (!story) {
        var rect = canvas.getBoundingClientRect();
        scroll = clamp01(-rect.top / Math.max(1, rect.height));
      }
      // At scale 1 the logo is ~0.85 viewport-heights wide; fit it to the width the page asks for,
      // then zoom in on the arch during the story so the agents become the subject.
      var portrait = cssW < cssH * 0.8;
      var logoWidth = opts.width ? opts.width(cssW, cssH, portrait) : 0.6 * cssW;
      var fit = logoWidth / (0.846 * cssH);
      var stage = opts.story
        ? opts.story(cssW, cssH, portrait)
        : { x: cssW / 2, y: cssH / 2, arch: logoWidth * ARCH_SHARE * 1.6 };
      var zoom = 1 + (stage.arch / (logoWidth * ARCH_SHARE) - 1) * easeInOut(acts);
      var nx = Math.max(-1, Math.min(1, (mouse.x - center.x) / (cssW / 2)));
      var ny = Math.max(-1, Math.min(1, (mouse.y - center.y) / (cssH / 2)));

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.uRes, cssW, cssH);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform1f(uniforms.uTime, t);
      gl.uniform1f(uniforms.uMorph, morph);
      gl.uniform1f(uniforms.uScroll, scroll);
      gl.uniform2f(
        uniforms.uRot,
        Math.sin(t * 0.13) * 0.16 + nx * 0.22 * mouse.on,
        -0.06 + Math.sin(t * 0.09) * 0.04 + ny * 0.14 * mouse.on + scroll * 0.9
      );
      gl.uniform2f(uniforms.uMouse, mouse.x, mouse.y);
      gl.uniform1f(uniforms.uMouseOn, mouse.on);
      // During the story the arch moves to the spot the page gives it beside (or above) the captions.
      gl.uniform2f(
        uniforms.uCenter,
        center.x + (stage.x - center.x) * acts,
        center.y + (stage.y - center.y) * acts
      );
      gl.uniform1f(uniforms.uScale, fit * zoom);
      // Without the wordmark the arch is the whole picture, so it stays centred.
      gl.uniform1f(uniforms.uFocus, withWordmark ? ARCH_FOCUS * easeInOut(acts) : ARCH_FOCUS);
      gl.uniform1f(uniforms.uActs, acts);
      gl.uniform1f(uniforms.uStep, step);
      gl.uniform1f(uniforms.uWord, 1 - acts);
      gl.drawArrays(gl.POINTS, 0, count);
      if (count) canvas.parentElement && canvas.parentElement.setAttribute('data-ready', '');

      frames++;
      if (now - fpsClock >= 500) {
        fps = Math.round((frames * 1000) / (now - fpsClock));
        frames = 0;
        fpsClock = now;
        // Auto quality steps down if a device can't hold a smooth frame rate,
        // and settles on a still frame if even the low preset struggles.
        if (qualityPref === 'auto' && running && now - trialStart > 2500 && fps < 40) {
          if (quality === 'high') {
            quality = 'low';
            trialStart = now;
            buildParticles();
            resize();
          } else if (fps < 20) {
            reducedMotion = true;
          }
        }
      }
      var settling = Math.abs(targetActs - acts) > 0.001 || Math.abs(targetStep - step) > 0.001;
      if (shouldRun() || settling) schedule();
    }

    function onPointerMove(e) {
      var rect = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - rect.left;
      mouse.ty = e.clientY - rect.top;
      var inside = mouse.tx >= 0 && mouse.ty >= 0 && mouse.tx <= rect.width && mouse.ty <= rect.height;
      if (inside && mouse.ton === 0) {
        // Jump to the first position instead of sweeping in from the corner.
        mouse.x = mouse.tx;
        mouse.y = mouse.ty;
      }
      mouse.ton = inside ? 1 : 0;
    }
    var onPointerLeave = function () { mouse.ton = 0; };
    var onVisibility = function () { schedule(); };
    var onReducedChange = function () {
      reducedMotion = reducedQuery.matches;
      schedule();
    };
    var onContextLost = function (e) {
      e.preventDefault();
      contextLost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    var onContextRestored = function () {
      contextLost = false;
      if (setupGL()) {
        buildParticles();
        resize();
        schedule();
      }
    };

    var resizeObserver = new ResizeObserver(function () {
      resize();
      schedule();
    });
    var intersectionObserver = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      schedule();
    });

    resizeObserver.observe(canvas);
    if (opts.anchor) resizeObserver.observe(opts.anchor);
    intersectionObserver.observe(canvas);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    reducedQuery.addEventListener('change', onReducedChange);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // The arch can start at once; the wordmark joins as soon as its mask is ready.
    resize();
    if (!withWordmark) buildParticles();
    else {
      loadWordmark(opts.logoSrc || '/assets/images/smallpe_logo_tight.svg').then(function (sample) {
        if (contextLost) return;
        sampleWord = sample;
        time = 0;
        buildParticles();
        schedule();
      });
    }
    schedule();

    return {
      /** Drive the agent story: acts 0..1 hands over from hero to captions, step 0..8 lights the agents. */
      setStory: function (next) {
        story = next;
        schedule();
      },
      stats: function () { return { fps: fps, points: count, quality: quality, dpr: dpr }; },
    };
  }

  window.mountLogoField = mountLogoField;
})();
