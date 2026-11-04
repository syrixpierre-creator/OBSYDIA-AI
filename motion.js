/* ==========================================================
   MOTION — a small, dependency-free motion system
   ----------------------------------------------------------
   · One rAF loop drives every scroll-linked effect
   · Text split into chars / masked lines, revealed on view
   · Magnetic buttons, lerped cursor, pointer spotlight
   · Velocity-aware marquee
   · Fully disabled under prefers-reduced-motion
   ========================================================== */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

  /* ---------- TEXT SPLITTING ---------- */

  // Wrap every character of a node tree in .char spans, keeping inline elements (<em>…).
  function splitChars(el) {
    let i = 0;
    const walk = (node) => {
      const frag = document.createDocumentFragment();
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) {
          for (const ch of child.textContent) {
            if (ch === " ") {
              frag.appendChild(document.createTextNode(" "));
              continue;
            }
            const s = document.createElement("span");
            s.className = "char";
            s.style.setProperty("--i", i++);
            s.textContent = ch;
            frag.appendChild(s);
          }
        } else if (child.nodeType === 1) {
          const clone = child.cloneNode(false);
          clone.appendChild(walk(child));
          frag.appendChild(clone);
        }
      });
      return frag;
    };
    const out = walk(el);
    el.textContent = "";
    el.appendChild(out);
    return i;
  }

  // Wrap words in masks; line index is computed from layout so each visual line rises together.
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    const walk = (node) => {
      const frag = document.createDocumentFragment();
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) {
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(" "));
              return;
            }
            const mask = document.createElement("span");
            mask.className = "w";
            const inner = document.createElement("span");
            inner.className = "w__in";
            inner.textContent = part;
            mask.appendChild(inner);
            frag.appendChild(mask);
          });
        } else if (child.nodeType === 1 && child.tagName === "BR") {
          frag.appendChild(child.cloneNode());
        } else if (child.nodeType === 1) {
          const clone = child.cloneNode(false);
          clone.appendChild(walk(child));
          frag.appendChild(clone);
        }
      });
      return frag;
    };
    const out = walk(el);
    el.textContent = "";
    el.appendChild(out);
    indexLines(el);
  }

  function indexLines(el) {
    let line = -1;
    let lastTop = null;
    let w = 0;
    el.querySelectorAll(".w").forEach((word) => {
      const top = Math.round(word.offsetTop);
      if (lastTop === null || Math.abs(top - lastTop) > 4) {
        line++;
        lastTop = top;
      }
      word.style.setProperty("--line", line);
      word.style.setProperty("--word", w++);
    });
  }

  /* ---------- INTRO ---------- */

  function runIntro(done) {
    const intro = document.getElementById("intro");
    const count = document.getElementById("introCount");
    const bar = document.getElementById("introBar");
    let seen = false;
    try { seen = !!sessionStorage.getItem("intro_seen"); } catch (e) {}

    if (!intro || reduced || seen) {
      if (intro) intro.remove();
      root.classList.add("is-loaded");
      done();
      return;
    }

    const duration = 1300;
    const start = performance.now();
    const tick = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      const v = Math.round(easeInOutQuart(t) * 100);
      count.textContent = String(v).padStart(3, "0");
      bar.style.transform = `scaleX(${v / 100})`;
      if (t < 1) return requestAnimationFrame(tick);
      setTimeout(() => {
        intro.classList.add("is-out");
        root.classList.add("is-loaded");
        try { sessionStorage.setItem("intro_seen", "1"); } catch (e) {}
        done();
        setTimeout(() => intro.remove(), 1200);
      }, 180);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- REVEAL ON VIEW ---------- */

  let io;
  function observe(scope = document) {
    const els = scope.querySelectorAll("[data-anim]:not(.in-view)");
    if (reduced || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in-view"));
      return;
    }
    if (!io) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in-view");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
      );
    }
    els.forEach((el) => {
      const kind = el.dataset.anim;
      if (kind === "words" || kind === "lines") splitWords(el);
      if (kind === "stagger") {
        Array.from(el.children).forEach((c, i) => c.style.setProperty("--s", i));
      }
      io.observe(el);
    });
  }

  /* ---------- MAGNETIC ---------- */

  function magnetic(el) {
    if (!finePointer || reduced) return;
    const strength = 0.28;
    const label = el.querySelector(".btn__label, .contact__mail-text");
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
      if (label) label.style.transform = `translate3d(${x * strength * 0.4}px, ${y * strength * 0.4}px, 0)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
      if (label) label.style.transform = "";
    });
  }

  /* ---------- SPOTLIGHT ---------- */

  function spotlight(el) {
    if (!finePointer) return;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  }

  /* ---------- CURSOR ---------- */

  const cursor = { x: -100, y: -100, tx: -100, ty: -100, el: null, label: null, active: false };
  function initCursor() {
    cursor.el = document.getElementById("cursor");
    cursor.label = document.getElementById("cursorLabel");
    if (!cursor.el || !finePointer || reduced) {
      if (cursor.el) cursor.el.remove();
      return;
    }
    root.classList.add("has-cursor");
    window.addEventListener("pointermove", (e) => {
      cursor.tx = e.clientX;
      cursor.ty = e.clientY;
      if (!cursor.active) {
        cursor.active = true;
        cursor.x = cursor.tx;
        cursor.y = cursor.ty;
        cursor.el.classList.add("is-on");
      }
    }, { passive: true });
    document.addEventListener("pointerleave", () => cursor.el.classList.remove("is-on"));
    document.addEventListener("pointerenter", () => cursor.active && cursor.el.classList.add("is-on"));

    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("a, button, [data-cursor], summary, label");
      if (!t) {
        cursor.el.classList.remove("is-hover", "is-label");
        return;
      }
      const text = t.getAttribute("data-cursor");
      cursor.el.classList.toggle("is-label", !!text);
      cursor.el.classList.toggle("is-hover", !text);
      if (text) cursor.label.textContent = text;
    });
    document.addEventListener("pointerdown", () => cursor.el.classList.add("is-down"));
    document.addEventListener("pointerup", () => cursor.el.classList.remove("is-down"));
  }

  /* ---------- MARQUEE ---------- */

  const marquees = [];
  function initMarquee(el, html) {
    const track = el.querySelector(".marquee__track");
    track.innerHTML = `<div class="marquee__group">${html}</div><div class="marquee__group" aria-hidden="true">${html}</div>`;
    marquees.push({ el, track, dir: Number(el.dataset.marquee) || 1, x: 0, width: 0 });
    measureMarquees();
  }
  function measureMarquees() {
    marquees.forEach((m) => (m.width = m.track.firstElementChild.offsetWidth));
  }

  /* ---------- MAIN LOOP ---------- */

  const state = { y: window.scrollY, lastY: window.scrollY, velocity: 0, navHidden: false };
  const els = {};

  function cacheEls() {
    els.progress = document.getElementById("progressBar");
    els.nav = document.getElementById("nav");
    els.heroTitle = document.getElementById("heroTitle");
    els.hero = document.querySelector(".hero");
    els.timeline = document.getElementById("timeline");
    els.timelineFill = document.getElementById("timelineFill");
  }

  function loop() {
    state.y = window.scrollY;
    const delta = state.y - state.lastY;
    state.lastY = state.y;
    state.velocity = lerp(state.velocity, delta, 0.12);

    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;

    if (els.progress) els.progress.style.transform = `scaleX(${max > 0 ? state.y / max : 0})`;

    // Nav: hide on scroll down, reveal on scroll up.
    if (els.nav) {
      els.nav.classList.toggle("is-scrolled", state.y > 24);
      if (Math.abs(delta) > 2) {
        const hide = delta > 0 && state.y > vh * 0.6;
        if (hide !== state.navHidden) {
          state.navHidden = hide;
          els.nav.classList.toggle("is-hidden", hide);
        }
      }
    }

    if (!reduced) {
      // Hero: title drifts and fades as it scrolls away.
      if (els.heroTitle && state.y < vh * 1.2) {
        const p = clamp(state.y / vh, 0, 1);
        els.heroTitle.style.transform = `translate3d(0, ${p * 18}vh, 0)`;
        els.heroTitle.style.opacity = String(1 - p * 0.9);
      }

      // Marquees: constant drift + scroll velocity.
      marquees.forEach((m) => {
        if (!m.width) return;
        const speed = 0.5 + Math.min(Math.abs(state.velocity) * 0.35, 14);
        m.x -= speed * m.dir;
        if (m.x <= -m.width) m.x += m.width;
        if (m.x > 0) m.x -= m.width;
        const skew = clamp(state.velocity * -0.15, -6, 6);
        m.track.style.transform = `translate3d(${m.x}px,0,0) skewX(${skew}deg)`;
      });

      // Cursor easing.
      if (cursor.active) {
        cursor.x = lerp(cursor.x, cursor.tx, 0.2);
        cursor.y = lerp(cursor.y, cursor.ty, 0.2);
        cursor.el.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;
      }
    }

    // Timeline rail fills with scroll.
    if (els.timeline && els.timelineFill) {
      const r = els.timeline.getBoundingClientRect();
      const p = clamp((vh * 0.65 - r.top) / r.height, 0, 1);
      els.timelineFill.style.transform = `scaleY(${p})`;
      els.timeline.querySelectorAll(".tl-item").forEach((item) => {
        const ir = item.getBoundingClientRect();
        item.classList.toggle("is-active", ir.top < vh * 0.65);
      });
    }

    requestAnimationFrame(loop);
  }

  /* ---------- COUNTERS ---------- */

  function countUp(el, value, duration = 1400) {
    const n = Number(value);
    if (reduced || !Number.isFinite(n)) {
      el.textContent = value;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      el.textContent = Math.round(easeOutExpo(t) * n).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Start a counter only once the element is on screen.
  function countWhenVisible(el, value) {
    if (!("IntersectionObserver" in window)) return countUp(el, value);
    const o = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        o.disconnect();
        countUp(el, value);
      }
    }, { threshold: 0.6 });
    o.observe(el);
  }

  /* ---------- PUBLIC API ---------- */

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      measureMarquees();
      document.querySelectorAll("[data-split-done]").forEach(indexLines);
    }, 150);
  });

  window.Motion = {
    reduced,
    init() {
      cacheEls();
      document.querySelectorAll("[data-split]").forEach((el) => {
        const n = splitChars(el);
        el.style.setProperty("--n", n);
      });
      document.querySelectorAll("[data-magnetic]").forEach(magnetic);
      document.querySelectorAll("[data-spot]").forEach(spotlight);
      initCursor();
      requestAnimationFrame(loop);
      const start = () => observe();
      if (document.fonts && document.fonts.ready) {
        // Split lines after webfonts load so line breaks are measured correctly.
        Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() =>
          runIntro(start)
        );
      } else {
        runIntro(start);
      }
    },
    observe,
    initMarquee,
    countWhenVisible,
    spotlight,
  };
})();
