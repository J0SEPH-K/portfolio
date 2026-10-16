// Statement panel: one dot field, three scroll states.
//   0  "99% accurate"            the lot looks clean
//   1  "but 10 are wrong"        the cursor becomes a scanner; errors lock in brackets
//   2  "evidence → review 23"    scroll sweeps the confidence layer across the lot
// Patterned on Turion's resolved-dot brackets and Bulletproof's scroll-led copy.
window.Statement = function Statement(section) {
  const stage = section.querySelector(".st");
  const canvas = section.querySelector(".st__grid"), g = canvas.getContext("2d");
  const lines = [...section.querySelectorAll(".st__line")];
  const status = section.querySelector("[data-st-status]");
  const dots = [...section.querySelectorAll(".st__dots i")];
  const INK = "17,18,16", OLIVE = "107,125,0", WARN = "226,83,31";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ramp = (e, a, b) => clamp((e - a) / (b - a), 0, 1);
  const smooth = t => t * t * (3 - 2 * t);

  /* ---------- the lot (deterministic) ---------- */
  let seed = 1016;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const units = Array.from({ length: 1000 }, (_, i) => ({
    i, ng: rnd() < 0.03, conf: 0.8 + (1 - rnd() ** 2.2) * 0.199, wrong: false, low: false,
    s: 0, found: 0, foundAt: 0,
  }));
  const pick = () => { let u; do { u = units[(rnd() * 1000) | 0]; } while (u.wrong || u.low); return u; };
  for (let n = 0; n < 10; n++) { const u = pick(); u.wrong = true; u.conf = n === 0 ? 0.93 : 0.55 + rnd() * 0.22; }
  for (let n = 0; n < 14; n++) { const u = pick(); u.low = true; u.conf = 0.62 + rnd() * 0.17; }
  const THR = 0.8;
  const queue = units.filter(u => u.conf < THR).length;
  const caught = units.filter(u => u.wrong && u.conf < THR).length;

  /* ---------- layout ---------- */
  let W = 0, H = 0, dpr = 1, cols = 50, rows = 20, cell = 12, cx = 12, cy = 12, ox = 0, oy = 0;
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    cols = W > 760 ? 50 : 40; rows = 1000 / cols;
    const maxH = Math.max(180, stage.clientHeight * (W > 760 ? 0.42 : 0.34));
    // columns always span the full width; rows tighten if the stage is short
    cx = (W - 16) / cols;
    cy = Math.min(cx, (maxH - 16) / rows);
    cell = Math.min(cx, cy);
    ox = 8; oy = 8;
    H = Math.ceil(rows * cy + 16);
    canvas.style.height = H + "px";
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  const center = u => [ox + (u.i % cols + 0.5) * cx, oy + (Math.floor(u.i / cols) + 0.5) * cy];

  /* ---------- pointer = scanner ---------- */
  const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: 0, inside: false };
  let lastFound = null;
  const setPtr = e => {
    const r = canvas.getBoundingClientRect();
    ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top;
    if (!ptr.inside) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
    ptr.inside = true;
  };
  canvas.addEventListener("pointermove", setPtr);
  canvas.addEventListener("pointerdown", setPtr);
  canvas.addEventListener("pointerleave", () => (ptr.inside = false));
  canvas.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") setTimeout(() => (ptr.inside = false), 700); });

  /* ---------- scroll progress (eased) ---------- */
  let p = 0, target = 0, state = -1, revealAt = 0, visible = false;
  const progress = () => {
    const r = section.getBoundingClientRect(), span = section.offsetHeight - stage.offsetHeight;
    return span <= 0 ? 0 : clamp(-r.top / span, 0, 1);
  };
  function setState(n) {
    if (n === state) return;
    state = n;
    lines.forEach((l, k) => l.classList.toggle("is-on", k === n));
    dots.forEach((d, k) => d.classList.toggle("is-on", k <= n));
  }
  function writeStatus(found) {
    const txt = state === 0 ? "1,000 units · 990 correct · 10 wrong"
      : state === 1 ? `Found ${found}/10 — ${coarse ? "tap" : "move"} to scan`
      : `${queue} to review · ${caught}/10 caught · 1 missed`;
    if (status.textContent !== txt) status.textContent = txt;
  }

  /* ---------- draw ---------- */
  function bracket(x, y, r, color, alpha, dashed) {
    const k = Math.max(2, r * 0.45);
    g.strokeStyle = `rgba(${color},${alpha})`; g.lineWidth = 1.25;
    g.setLineDash(dashed ? [2, 2] : []);
    g.beginPath();
    g.moveTo(x - r, y - r + k); g.lineTo(x - r, y - r); g.lineTo(x - r + k, y - r);
    g.moveTo(x + r - k, y - r); g.lineTo(x + r, y - r); g.lineTo(x + r, y - r + k);
    g.moveTo(x + r, y + r - k); g.lineTo(x + r, y + r); g.lineTo(x + r - k, y + r);
    g.moveTo(x - r + k, y + r); g.lineTo(x - r, y + r); g.lineTo(x - r, y + r - k);
    g.stroke(); g.setLineDash([]);
  }
  function label(x, y, text, color, alpha) {
    g.font = "500 10px 'JetBrains Mono', monospace";
    g.fillStyle = `rgba(${color},${alpha})`;
    g.fillText(text, x, y);
  }

  function frame(now) {
    target = progress();
    p += (target - p) * (Math.abs(target - p) > 0.25 ? 0.5 : 0.16);
    if (Math.abs(target - p) < 5e-4) p = target;
    setState(p < 0.3 ? 0 : p < 0.62 ? 1 : 2);

    ptr.x += (ptr.tx - ptr.x) * 0.25; ptr.y += (ptr.ty - ptr.y) * 0.25;
    ptr.on += ((ptr.inside ? 1 : 0) - ptr.on) * 0.18;
    const R = Math.max(54, cell * 6);
    const scanning = state >= 1;
    const sweep = ramp(p, 0.62, 0.86) * (cols + 6) - 3;          // evidence front, in columns
    const reveal = revealAt ? (now - revealAt) / 900 : 0;          // intro wipe, 0..1+

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const base = cell * 0.34;
    let found = 0;
    const tags = [];

    units.forEach(u => {
      const [x, y] = center(u), col = u.i % cols;
      const vis = clamp(reveal * 1.6 - col / cols, 0, 1);
      if (vis <= 0) return;
      // proximity to the scanner, eased into the dot size
      const d = Math.hypot(x - ptr.x, y - ptr.y), f = smooth(clamp(1 - d / R, 0, 1)) * ptr.on;
      if (scanning && u.wrong && f > 0.55 && !u.found) { u.found = 1; u.foundAt = now; lastFound = u; }
      const ev = smooth(clamp(sweep - col, 0, 1)) * (state === 2 ? 1 : ramp(p, 0.6, 0.62));
      const inQ = u.conf < THR;
      let size = base * (1 + (scanning ? 1.3 : 0.6) * f);
      let color = INK, alpha = u.ng ? 0.72 : 0.2;
      if (ev > 0) {
        if (inQ) { color = OLIVE; alpha = alpha + (1 - alpha) * ev; size *= 1 + 0.5 * ev; }
        else alpha *= 1 - 0.55 * ev;
      }
      if (u.found && !(ev > 0.5 && inQ)) { color = WARN; alpha = 1; size = Math.max(size, base * 1.5); }
      u.s += (size - u.s) * (reduce ? 1 : 0.25);
      g.fillStyle = `rgba(${color},${(alpha * vis).toFixed(3)})`;
      g.fillRect(x - u.s / 2, y - u.s / 2, u.s, u.s);

      // brackets: found by scanning, or resolved by evidence
      if (u.wrong) {
        if (u.found) found++;
        const resolved = ev > 0.5 && inQ, missed = state === 2 && ev > 0.5 && !inQ;
        if (u.found || resolved || missed) {
          const age = u.found ? clamp((now - u.foundAt) / 320, 0, 1) : 1;
          const r = Math.max(5, cell * 0.75) * (1 + (1 - smooth(age)) * 1.2);
          const c = resolved ? OLIVE : WARN;
          bracket(x, y, r, c, 0.95 * vis, missed);
          if (missed) tags.push([x, y, r, "MISSED 0.93", WARN]);
          else if (u === lastFound && state === 1) tags.push([x, y, r, `WRONG ${u.conf.toFixed(2)}`, WARN]);
        }
      }
    });
    tags.forEach(([x, y, r, t, c]) => label(Math.min(x + r + 5, W - 80), y + 3.5, t, c, 0.95));

    // the scanner reticle
    if (scanning && ptr.on > 0.02) {
      g.strokeStyle = `rgba(${INK},${0.35 * ptr.on})`; g.lineWidth = 1;
      g.beginPath(); g.arc(ptr.x, ptr.y, R, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => { g.moveTo(ptr.x + dx * (R - 6), ptr.y + dy * (R - 6)); g.lineTo(ptr.x + dx * (R + 6), ptr.y + dy * (R + 6)); });
      g.stroke();
      label(ptr.x + R * 0.72, ptr.y - R * 0.72, "SCAN", INK, 0.55 * ptr.on);
    }
    writeStatus(found);
    if (visible) requestAnimationFrame(frame);
  }

  new ResizeObserver(layout).observe(stage);
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) { if (!revealAt) revealAt = performance.now(); requestAnimationFrame(frame); }
  }).observe(section);
  layout();
  setState(0);
};
