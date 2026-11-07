const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  try { localStorage.setItem("theme", theme); } catch (e) {}
}
document.getElementById("themeToggle").addEventListener("click", () => {
  root.classList.add("theme-anim");
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  setTimeout(() => root.classList.remove("theme-anim"), 500);
});
document.getElementById("year").textContent = new Date().getFullYear();

(function translateIfConsented() {
  let consent = null;
  try { consent = JSON.parse(localStorage.getItem("cookie_consent_v1")); } catch (e) {}
  if (!consent || !consent.thirdparty) return;
  const full = navigator.language || "en";
  let lang = full.toLowerCase().split("-")[0];
  if (lang === "zh") lang = /tw|hk|hant/i.test(full) ? "zh-TW" : "zh-CN";
  if (lang === "he") lang = "iw";
  if (lang !== "en" && !/(?:^|;\s*)googtrans=/.test(document.cookie)) {
    document.cookie = `googtrans=/en/${lang};path=/;max-age=31536000`;
  }
  const holder = document.createElement("div");
  holder.id = "google_translate_element";
  holder.hidden = true;
  document.body.appendChild(holder);
  window.googleTranslateElementInit = () =>
    new google.translate.TranslateElement({ pageLanguage: "en", autoDisplay: false }, "google_translate_element");
  const s = document.createElement("script");
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.body.appendChild(s);
})();

InconnuBoy.init();

const sound = InconnuBoy.sound;
const reduced = InconnuBoy.reduced;
const SHOT = (name) => `assets/join/${name}.webp`;

const STEPS = [
  {
    url: "google.com/search?q=syrix+vision+company",
    screens: ["01-google"],
    dur: 5600,
    events: [
      { at: 700, ring: [3.9, 13.5, 92.2, 4.9] },
      { at: 1700, tap: true },
      { at: 2900, ring: [3.9, 25.7, 92.2, 15.4], zoom: 1.12 },
      { at: 4100, tap: true },
    ],
  },
  {
    url: "syrix-vision.xyz",
    screens: ["02-home"],
    dur: 4600,
    events: [
      { at: 900, ring: [6.15, 72.79, 54.21, 6.67], zoom: 1.1 },
      { at: 2400, tap: true },
    ],
  },
  {
    url: "syrix-vision.xyz/recruit.html",
    screens: ["03-recruit", "04-tracks"],
    dur: 6400,
    events: [
      { at: 700, ring: [6.2, 25.8, 75, 9] },
      { at: 2000, scroll: true, ring: null },
      { at: 3000, ring: [6.15, 59.42, 87.69, 20.6] },
      { at: 4300, ring: [6.15, 59.42, 42.56, 10.66], zoom: 1.14 },
      { at: 5200, tap: true },
    ],
  },
  {
    url: "syrix-vision.xyz/recruit.html",
    screens: ["05-form"],
    dur: 6000,
    events: [
      { at: 700, ring: [12.56, 19.98, 74.87, 5.57], zoom: 1.16 },
      { at: 1500, tap: true },
      { at: 2400, ring: [12.7, 33.4, 74.6, 5.5], zoom: 1.16 },
      { at: 3100, tap: true },
      { at: 4000, ring: [12.7, 50.4, 74.6, 5.5], zoom: 1.16 },
      { at: 4700, tap: true },
    ],
  },
  {
    url: "syrix-vision.xyz/recruit.html",
    screens: ["06-submit"],
    dur: 5000,
    events: [
      { at: 800, ring: [11.5, 62.4, 6.2, 3.9], zoom: 1.2 },
      { at: 1700, tap: true },
      { at: 2600, ring: [12.56, 75.63, 74.87, 5.69], zoom: 1.1 },
      { at: 3600, tap: true },
    ],
  },
  {
    url: "syrix-vision.xyz/recruit.html",
    screens: ["success"],
    dur: 6000,
    events: [
      { at: 400, ring: null },
      { at: 3000, notif: true },
    ],
  },
];

const el = {
  phone: document.getElementById("phone"),
  layers: document.getElementById("phoneLayers"),
  view: document.getElementById("phoneView"),
  ring: document.getElementById("phoneRing"),
  touch: document.getElementById("phoneTouch"),
  url: document.getElementById("phoneUrl"),
  time: document.getElementById("phoneTime"),
  notif: document.getElementById("phoneNotif"),
  play: document.getElementById("playerPlay"),
  stepNum: document.getElementById("playerStep"),
  steps: Array.from(document.querySelectorAll("#steps .step")),
};

STEPS.forEach((s) => s.screens.forEach((n) => {
  if (n === "success") return;
  const img = new Image();
  img.src = SHOT(n);
}));

const state = { index: 0, elapsed: 0, playing: false, fired: 0, last: 0, done: false, started: false };

function setTime() {
  try {
    el.time.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch (e) {}
}
setTime();

function screenNode(name) {
  if (name === "success") {
    const d = document.createElement("div");
    d.className = "phone__success";
    d.innerHTML = `
      <svg viewBox="0 0 80 80" width="76" height="76" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" stroke-width="2.5" class="ok-c"/>
        <path d="M26 41l10 10 19-21" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="ok-p"/>
      </svg>
      <p class="phone__success-t">Application received</p>
      <p class="phone__success-d">Thanks for applying to SYRIX VISION COMPANY. Our team will review your application — if approved, you'll get a confirmation email.</p>
      <span class="phone__success-mail mono">✉ check your Gmail</span>`;
    return d;
  }
  const img = document.createElement("img");
  img.src = SHOT(name);
  img.alt = "";
  img.decoding = "async";
  return img;
}

function placeRing(r) {
  if (!r) {
    el.ring.classList.remove("is-on");
    el.touch.classList.remove("is-on");
    return;
  }
  const [x, y, w, h] = r;
  el.ring.style.left = `${x}%`;
  el.ring.style.top = `${y}%`;
  el.ring.style.width = `${w}%`;
  el.ring.style.height = `${h}%`;
  el.ring.classList.add("is-on");
  el.touch.style.left = `${x + w / 2}%`;
  el.touch.style.top = `${y + h / 2}%`;
  el.touch.classList.add("is-on");
  sound.blip();
}

function zoomTo(r, scale) {
  if (!r || !scale || reduced) {
    el.view.style.transform = "";
    return;
  }
  const [x, y, w, h] = r;
  el.view.style.transformOrigin = `${x + w / 2}% ${y + h / 2}%`;
  el.view.style.transform = `scale(${scale})`;
}

function tap() {
  el.touch.classList.remove("is-tap");
  void el.touch.offsetWidth;
  el.touch.classList.add("is-tap");
  sound.key(1.3);
}

function showStep(i, animate = true) {
  state.index = i;
  state.elapsed = 0;
  state.fired = 0;
  state.done = false;
  const step = STEPS[i];
  el.url.textContent = step.url;
  el.notif.classList.remove("is-on");
  placeRing(null);
  zoomTo(null);

  const layer = document.createElement("div");
  layer.className = "phone__layer";
  step.screens.forEach((n, k) => {
    const node = screenNode(n);
    node.classList.add("phone__shot");
    if (k > 0) node.classList.add("is-next");
    layer.appendChild(node);
  });
  const old = Array.from(el.layers.children);
  el.layers.appendChild(layer);
  if (animate && old.length && !reduced) {
    layer.classList.add("is-entering");
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.remove("is-entering")));
    setTimeout(() => old.forEach((o) => o.remove()), 900);
  } else {
    old.forEach((o) => o.remove());
  }
  if (step.screens[0] === "success") requestAnimationFrame(() => layer.querySelector(".phone__success").classList.add("is-in"));

  el.steps.forEach((s, k) => {
    s.classList.toggle("is-active", k === i);
    s.classList.toggle("is-done", k < i);
    s.querySelector(".step__bar i").style.transform = `scaleX(${k < i ? 1 : 0})`;
  });
  el.stepNum.textContent = String(i + 1).padStart(2, "0");
  updateCaption(i);
  sound.blip();
}

const caption = document.getElementById("tutCaption");
function updateCaption(i) {
  const s = el.steps[i];
  const apply = () => {
    document.getElementById("tutCaptionT").textContent = s.querySelector(".step__t").textContent;
    document.getElementById("tutCaptionD").innerHTML = s.querySelector(".step__body p").innerHTML;
    caption.classList.remove("is-swap");
  };
  if (reduced || !caption.textContent.trim()) return apply();
  caption.classList.add("is-swap");
  setTimeout(apply, 300);
}

function fire(ev) {
  const step = STEPS[state.index];
  if ("ring" in ev) {
    placeRing(ev.ring);
    zoomTo(ev.ring, ev.zoom);
    step.lastRing = ev.ring;
  }
  if (ev.tap) tap();
  if (ev.scroll) {
    const layer = el.layers.lastElementChild;
    if (layer) layer.classList.add("is-scrolled");
    sound.blip();
  }
  if (ev.notif) {
    el.notif.classList.add("is-on");
    sound.chime();
  }
}

function tick(now) {
  const dt = state.last ? Math.min(now - state.last, 100) : 0;
  state.last = now;
  if (state.playing) {
    const step = STEPS[state.index];
    state.elapsed += dt;
    while (state.fired < step.events.length && step.events[state.fired].at <= state.elapsed) {
      fire(step.events[state.fired]);
      state.fired++;
    }
    const p = Math.min(state.elapsed / step.dur, 1);
    el.steps[state.index].querySelector(".step__bar i").style.transform = `scaleX(${p})`;
    if (state.elapsed >= step.dur) {
      if (state.index < STEPS.length - 1) showStep(state.index + 1);
      else {
        state.playing = false;
        state.done = true;
        setPlayIcon();
      }
    }
  }
  requestAnimationFrame(tick);
}

function setPlayIcon() {
  el.play.classList.toggle("is-playing", state.playing);
  el.play.classList.toggle("is-done", state.done);
  el.play.setAttribute("aria-label", state.done ? "Replay" : state.playing ? "Pause" : "Play");
}

function play() {
  if (state.done) showStep(0);
  state.playing = true;
  state.done = false;
  setPlayIcon();
}
function pause() {
  state.playing = false;
  setPlayIcon();
}

function jump(i) {
  showStep(Math.max(0, Math.min(STEPS.length - 1, i)));
  if (reduced) {
    STEPS[state.index].events.forEach(fire);
    state.fired = STEPS[state.index].events.length;
  }
}

el.play.addEventListener("click", () => {
  sound.start();
  state.playing ? pause() : play();
});
document.getElementById("playerPrev").addEventListener("click", () => { sound.start(); jump(state.index - 1); });
document.getElementById("playerNext").addEventListener("click", () => { sound.start(); jump(state.index + 1); });
el.steps.forEach((s, k) => s.querySelector(".step__head").addEventListener("click", () => {
  sound.start();
  jump(k);
  if (!reduced) play();
}));

document.addEventListener("keydown", (e) => {
  const r = document.getElementById("tutorial").getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  if (e.key === "ArrowRight") jump(state.index + 1);
  if (e.key === "ArrowLeft") jump(state.index - 1);
});

document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.querySelector(".chip-copy__state").textContent = "copied";
    setTimeout(() => (b.querySelector(".chip-copy__state").textContent = "copy"), 1600);
  } catch (e) {}
}));

showStep(0, false);
setPlayIcon();
requestAnimationFrame(tick);

if (reduced) {
  STEPS[0].events.forEach(fire);
} else if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !state.started) {
        state.started = true;
        play();
      }
      if (!e.isIntersecting && state.playing) pause();
      else if (e.isIntersecting && state.started && !state.playing && !state.done && state.autoPaused) play();
      state.autoPaused = !e.isIntersecting;
    });
  }, { threshold: 0.45 });
  io.observe(el.phone);
} else {
  play();
}
