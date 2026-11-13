// smallpe.com behaviour: the header and scroll reveals on every page, and the home page's pinned agent
// story, magnetic CTA and video players. Plain JS, loaded with defer after logo-field.js.
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp01 = function (x) { return Math.min(1, Math.max(0, x)); };
  var easeInOut = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

  // Runs fn at most once per frame, however many scroll or resize events arrive.
  function onScrollFrame(fn) {
    var queued = false;
    var queue = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        fn();
      });
    };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    fn();
  }

  // Inertial wheel scrolling so every scroll-linked effect glides; touch keeps native scrolling.
  if (!reduced && window.Lenis) {
    window.lenis = new window.Lenis({ autoRaf: true, lerp: 0.085, wheelMultiplier: 0.9, anchors: true });
  }

  // Header frosts once the page leaves the top.
  onScrollFrame(function () {
    root.toggleAttribute('data-header-scrolled', window.scrollY > 8);
  });

  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Hero: the logo forms, then the stage pins and presents the eight agents in pipeline order.
  var hero = document.querySelector('.hero');
  if (hero) {
    var heroCanvas = hero.querySelector('canvas');
    var field = window.mountLogoField && window.mountLogoField(heroCanvas, {
      quality: heroCanvas.dataset.quality,
      anchor: hero.querySelector('.hero-logo-anchor'),
      // Wide enough to lead the page, short enough to leave the headline room below it.
      width: function (w, h, portrait) { return portrait ? 0.84 * w : Math.min(0.5 * w, 0.56 * h); },
      // During the story the arch sits in the clear last third of the console's frame (below its
      // title bar); on phones, in the frame's upper part above the text.
      story: function (w, h, portrait) {
        if (portrait) return { x: w / 2, y: 0.37 * h, arch: 0.68 * w };
        var gutter = Math.min(64, Math.max(20, 0.05 * w));
        var area = w - 2 * gutter;
        return { x: w - gutter - area / 6, y: h / 2 + 16, arch: Math.min(0.27 * area, 0.5 * h) };
      },
    });

    var acts = Array.prototype.slice.call(hero.querySelectorAll('.act'));
    var terminal = mountConsole(hero.querySelector('.team'), acts);
    var rail = Array.prototype.slice.call(hero.querySelectorAll('.rail span'));
    var START = 0.18;
    var SPAN = (1 - START) / acts.length;

    onScrollFrame(function () {
      var rect = hero.getBoundingClientRect();
      var p = clamp01(-rect.top / Math.max(1, rect.height - window.innerHeight));
      var handover = easeInOut(clamp01((p - 0.04) / 0.08));
      hero.style.setProperty('--acts', handover.toFixed(3));

      // Agent i is on stage while i <= s < i + 1; before that the console shows the team.
      var s = (p - START) / SPAN;
      var current = s < 0 ? 0 : Math.min(acts.length, Math.floor(s) + 1);
      acts.forEach(function (el, i) {
        if (i + 1 === current) el.setAttribute('aria-current', 'step');
        else el.removeAttribute('aria-current');
      });
      rail.forEach(function (dot, i) {
        dot.classList.toggle('on', i + 1 === current);
        dot.classList.toggle('done', i + 1 < current);
      });
      terminal.show(current);
      hero.dataset.act = handover < 0.5 ? '0' : String(current);

      // The glow sets off along the arch halfway through each agent's window and lands on the
      // next dot as its entry opens, so the light travels instead of jumping.
      var x = s + 1;
      var base = Math.floor(x);
      var step = Math.max(0, Math.min(acts.length, base + easeInOut(clamp01((x - base - 0.5) / 0.5))));
      if (field) field.setStory({ acts: handover, step: step });
    });
  }

  // Console captions: types `dispatch <agent>`, decodes the name out of noise, then fades in
  // the role and description. Built from the team list, which stays in the page for screen readers.
  function mountConsole(team, acts) {
    var agents = acts.map(function (el, i) {
      return {
        num: (i < 9 ? '0' : '') + (i + 1),
        name: el.querySelector('.act-name').textContent,
        stage: el.dataset.stage,
        role: el.querySelector('.act-role').textContent,
        body: el.querySelector('.act-body').textContent,
      };
    });
    var idle = {
      cmd: 'team status',
      num: '',
      name: 'Eight specialists.',
      role: 'One Managing Partner.',
      body: 'Every dot on the arch is an agent. Scroll to dispatch them, thesis to close.',
    };

    var box = document.createElement('div');
    box.className = 'console';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '<div class="console-bar"><span></span><span></span><span></span><b>managing-partner \u2014 smallpe</b><i>8 agents \u00b7 thesis \u2192 close</i></div>' +
      '<div class="console-body">' +
      '<p class="console-cmd"><span class="console-prompt">mp \u203a</span> <span class="console-typed"></span><span class="console-caret"></span></p>' +
      '<p class="console-num"></p><p class="console-name"></p><p class="console-role"></p><p class="console-text"></p>' +
      '</div>';
    team.after(box);

    var typed = box.querySelector('.console-typed');
    var num = box.querySelector('.console-num');
    var name = box.querySelector('.console-name');
    var role = box.querySelector('.console-role');
    var text = box.querySelector('.console-text');
    var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*/<>_';
    var shown = -1;
    var run = 0;

    function render(i) {
      var a = i > 0 ? agents[i - 1] : idle;
      var cmd = i > 0 ? 'dispatch ' + a.name.toLowerCase() : idle.cmd;
      var token = ++run;
      box.classList.remove('is-done');
      num.textContent = i > 0 ? a.num + ' / 0' + agents.length + ' \u00b7 ' + a.stage : '';
      role.textContent = a.role;
      text.textContent = a.body;
      if (reduced) {
        typed.textContent = cmd;
        name.textContent = a.name;
        box.classList.add('is-done');
        return;
      }
      var start = performance.now();
      var TYPE = 22; // ms per typed character
      var DECODE = 520;
      (function tick(now) {
        if (token !== run) return;
        var t = now - start;
        typed.textContent = cmd.slice(0, Math.min(cmd.length, Math.floor(t / TYPE)));
        // The name resolves left to right once the command is typed; the rest stays noise.
        var d = clamp01((t - cmd.length * TYPE) / DECODE);
        var fixed = Math.floor(d * a.name.length);
        var out = a.name.slice(0, fixed);
        for (var k = fixed; k < a.name.length; k++) {
          out += a.name[k] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        name.textContent = out;
        if (d < 1) requestAnimationFrame(tick);
        else box.classList.add('is-done');
      })(start);
    }

    return {
      show: function (i) {
        if (i === shown) return;
        shown = i;
        render(i);
      },
    };
  }

  // Closing CTA: the arch returns on its own as a constellation.
  var ctaCanvas = document.querySelector('.cta canvas');
  if (ctaCanvas && window.mountLogoField) {
    window.mountLogoField(ctaCanvas, {
      quality: ctaCanvas.dataset.quality,
      wordmark: false,
      anchor: document.querySelector('.cta-arch-anchor'),
      width: function (w, h, portrait) { return Math.min(portrait ? 1.7 * w : 1.3 * w, 2.6 * h); },
    });
  }

  // Reveal-on-scroll: fades each block up the first time it enters the viewport.
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  root.classList.add('reveal-ready');
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  // Older pages carry AOS attributes; they reveal the same way, keeping their delays.
  document.querySelectorAll('[data-aos]').forEach(function (el) {
    if (el.dataset.aosDelay) el.style.setProperty('--reveal-delay', el.dataset.aosDelay + 'ms');
    io.observe(el);
  });

  // Manifesto: words light up as the statement scrolls through the viewport.
  document.querySelectorAll('.scroll-words').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    var spans = words.map(function (word) {
      var span = document.createElement('span');
      span.textContent = word + ' ';
      el.appendChild(span);
      return span;
    });
    var lit = -1;
    onScrollFrame(function () {
      var rect = el.getBoundingClientRect();
      var vh = window.innerHeight;
      // Starts lighting in the lower viewport, done by the time it reaches the upper third.
      var next = Math.round(clamp01((vh * 0.85 - rect.top) / (rect.height + vh * 0.45)) * spans.length);
      if (next === lit) return;
      spans.forEach(function (span, i) { span.classList.toggle('lit', i < next); });
      lit = next;
    });
  });

  // Magnetic button: the pill leans toward the cursor and its label leans a little further.
  if (!window.matchMedia('(hover: none)').matches && !reduced) {
    document.querySelectorAll('.magnet').forEach(function (btn) {
      var label = btn.querySelector('span');
      var zone = btn.closest('section') || btn.parentElement;
      var reset = function () {
        btn.style.transform = '';
        label.style.transform = '';
      };
      zone.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > 160) return reset();
        btn.style.transform = 'translate(' + dx * 0.25 + 'px, ' + dy * 0.35 + 'px)';
        label.style.transform = 'translate(' + dx * 0.1 + 'px, ' + dy * 0.12 + 'px)';
      });
      zone.addEventListener('pointerleave', reset);
    });
  }

  // Every video opens in one modal sized to the screen. The player is created on open and
  // removed on close, so nothing loads up front and closing always stops playback.
  var modal = document.getElementById('video-modal');
  if (modal) {
    var frame = modal.querySelector('.video-frame');
    var close = modal.querySelector('.video-close');
    var opener = null;
    var open = function (trigger) {
      opener = trigger;
      var player;
      if (trigger.dataset.youtube) {
        player = document.createElement('iframe');
        player.src = 'https://www.youtube-nocookie.com/embed/' + trigger.dataset.youtube + '?autoplay=1&rel=0';
        player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        player.allowFullscreen = true;
      } else {
        player = document.createElement('video');
        player.src = trigger.dataset.video;
        player.poster = trigger.dataset.poster || '';
        player.controls = true;
        player.playsInline = true;
        player.autoplay = true;
      }
      player.title = trigger.getAttribute('aria-label').replace(/^Play: /, '');
      modal.setAttribute('aria-label', player.title);
      frame.replaceChildren(player);
      modal.hidden = false;
      document.body.classList.add('modal-open');
      if (window.lenis) window.lenis.stop();
      close.focus();
    };
    var shut = function () {
      modal.hidden = true;
      frame.replaceChildren();
      document.body.classList.remove('modal-open');
      if (window.lenis) window.lenis.start();
      if (opener) opener.focus();
    };
    document.querySelectorAll('[data-video], [data-youtube]').forEach(function (trigger) {
      trigger.addEventListener('click', function () { open(trigger); });
    });
    close.addEventListener('click', shut);
    modal.addEventListener('click', function (e) { if (e.target === modal) shut(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) shut(); });
  }

  // Copy buttons copy the commands without their prompts.
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var source = document.getElementById(btn.dataset.copy);
      var text = source.textContent
        .split('\n')
        .map(function (line) { return line.replace(/^\$\s*/, '').replace(/\s+#.*$/, ''); })
        .join('\n');
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
      }).catch(function () {});
    });
  });
})();
