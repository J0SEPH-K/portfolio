// Statement panel: one dot field, three scroll states, one full-stage canvas.
//   0  "99% accurate"            the lot looks clean
//   1  "but 10 are wrong"        the cursor scans, clicks send a pulse; errors lock in brackets
//   2  "evidence → review 23"    a laser sweeps left→right with the scroll; everything behind it
//                                turns dark, gains a "+" field, and shows the evidence layer
// The text exists twice: a light layer, and a dark copy revealed only behind the laser.
window.Statement = function Statement(section) {
  const stage = section.querySelector(".st");
  const canvas = section.querySelector(".st__bg"), g = canvas.getContext("2d");
  const light = section.querySelector(".st__layer");
  const dark = light.cloneNode(true);
  dark.classList.add("is-dark");
  dark.setAttribute("aria-hidden", "true");
  dark.style.clipPath = "inset(0 100% 0 0)";      // hidden until the laser passes
  stage.appendChild(dark);
  const slots = [light, dark].map(l => l.querySelector(".st__slot"));
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const INK = "17,18,16", PAPER = "236,236,228", OLIVE = "107,125,0", LIME = "212,255,58", WARN = "226,83,31";
  const DARK_BG = "#08090b";
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ramp = (e, a, b) => clamp((e - a) / (b - a), 0, 1);
  const smooth = t => t * t * (3 - 2 * t);

  /* ---------- the lot (deterministic) ---------- */
  let seed = 1016;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const units = Array.from({ length: 1000 }, (_, i) => ({
    i, ng: rnd() < 0.03, conf: 0.8 + (1 - rnd() ** 2.2) * 0.199, wrong: false, low: false,
    s: 0, found: false, foundAt: 0,
  }));
  const pick = () => { let u; do { u = units[(rnd() * 1000) | 0]; } while (u.wrong || u.low); return u; };
  for (let n = 0; n < 10; n++) { const u = pick(); u.wrong = true; u.conf = n === 0 ? 0.93 : 0.55 + rnd() * 0.22; }
  for (let n = 0; n < 14; n++) { const u = pick(); u.low = true; u.conf = 0.62 + rnd() * 0.17; }
  const THR = 0.8;
  const queue = units.filter(u => u.conf < THR).length;
  const caught = units.filter(u => u.wrong && u.conf < THR).length;

  /* ---------- layout ---------- */
  let W = 0, H = 0, dpr = 1, cols = 50, rows = 20, cx = 12, cy = 12, sp = 12, ox = 0, oy = 0;
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const gw = slots[0].clientWidth;
    cols = gw > 760 ? 50 : 40; rows = 1000 / cols;
    const maxH = Math.max(200, H * (gw > 760 ? 0.44 : 0.36));
    cx = (gw - 16) / cols;
    cy = Math.min(cx, (maxH - 16) / rows);
    sp = Math.min(cx, cy);
    const sh = Math.ceil(rows * cy + 16) + "px";
    slots.forEach(s => (s.style.height = sh));
    const sr = slots[0].getBoundingClientRect(), st = stage.getBoundingClientRect();
    ox = sr.left - st.left + 8; oy = sr.top - st.top + 8;
  }
  const center = u => [ox + (u.i % cols + 0.5) * cx, oy + (Math.floor(u.i / cols) + 0.5) * cy];

  /* ---------- pointer + clicks ---------- */
  const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: 0, inside: false };
  const ripples = [];
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointermove", e => {
    [ptr.tx, ptr.ty] = local(e);
    if (!ptr.inside) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
    ptr.inside = true;
  });
  canvas.addEventListener("pointerleave", () => (ptr.inside = false));
  canvas.addEventListener("pointerdown", e => {
    const [x, y] = local(e);
    ptr.tx = x; ptr.ty = y;
    if (!ptr.inside) { ptr.x = x; ptr.y = y; }
    ptr.inside = true;
    ripples.push({ x, y, t: 0 });
    if (ripples.length > 4) ripples.shift();
    if (e.pointerType !== "mouse") setTimeout(() => (ptr.inside = false), 900);
  });
  const RIP_SPEED = 620, RIP_BAND = 34, RIP_LIFE = 2.4;
  // displacement + glow at a point from all live ripples
  function rippleAt(x, y) {
    let dx = 0, dy = 0, glow = 0;
    for (const r of ripples) {
      const ddx = x - r.x, ddy = y - r.y, d = Math.hypot(ddx, ddy) || 1;
      const amp = Math.exp(-((d - r.t * RIP_SPEED) ** 2) / (2 * RIP_BAND * RIP_BAND)) * (1 - r.t / RIP_LIFE);
      if (amp < 0.01) continue;
      glow = Math.max(glow, amp);
      dx += (ddx / d) * amp * 8; dy += (ddy / d) * amp * 8;
    }
    return [dx, dy, glow];
  }

  /* ---------- scroll ---------- */
  let p = 0, phase = -1, lastFound = null, revealAt = 0, visible = false, last = 0;
  const progress = () => {
    const r = section.getBoundingClientRect(), span = section.offsetHeight - stage.offsetHeight;
    return span <= 0 ? 0 : clamp(-r.top / span, 0, 1);
  };
  const lineSets = [light, dark].map(l => [...l.querySelectorAll(".st__line")]);
  const statusEls = [light, dark].map(l => l.querySelector("[data-st-status]"));
  const dotSets = [light, dark].map(l => [...l.querySelectorAll(".st__dots i")]);
  const show = (k, n) => {
    lineSets[k].forEach((el, i) => el.classList.toggle("is-on", i === n));
    dotSets[k].forEach((el, i) => el.classList.toggle("is-on", i <= n));
  };
  show(1, 2);
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  setText(statusEls[1], `${queue} to review · ${caught}/10 caught · 1 missed`);

  /* ---------- draw helpers ---------- */
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
  const label = (x, y, text, color, alpha) => {
    g.font = "500 10px 'JetBrains Mono', monospace";
    g.fillStyle = `rgba(${color},${alpha})`;
    g.fillText(text, x, y);
  };

  /* ---------- frame ---------- */
  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    const target = progress();
    p += (target - p) * (Math.abs(target - p) > 0.25 ? 0.5 : 0.16);
    if (Math.abs(target - p) < 5e-4) p = target;

    // phase: 0 clean, 1 hunting, 2 scanned. Going back resets what was found.
    const ph = p < 0.3 ? 0 : p < 0.5 ? 1 : 2;
    if (ph !== phase) {
      if (ph < phase) units.forEach(u => (u.found = false)), (lastFound = null);
      phase = ph;
      show(0, Math.min(ph, 1));
    }
    const hunting = p >= 0.3;
    // the laser: x position of the light/dark boundary
    const X = clamp(ramp(p, 0.5, 0.86) * (W + 80) - 40, 0, W);
    light.style.clipPath = `inset(0 0 0 ${X.toFixed(1)}px)`;
    dark.style.clipPath = `inset(0 ${(W - X).toFixed(1)}px 0 0)`;

    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > RIP_LIFE) ripples.splice(i, 1); }
    ptr.x += (ptr.tx - ptr.x) * 0.25; ptr.y += (ptr.ty - ptr.y) * 0.25;
    ptr.on += ((ptr.inside ? 1 : 0) - ptr.on) * 0.18;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // dark side + its "+" field
    if (X > 0) {
      g.fillStyle = DARK_BG; g.fillRect(0, 0, X, H);
      const step = 36, ox0 = (W % step) / 2, oy0 = (H % step) / 2;
      g.lineWidth = 1;
      for (let x = ox0; x < X; x += step) {
        for (let y = oy0; y < H; y += step) {
          const [dx, dy, rg] = rippleAt(x, y);
          const pd = Math.hypot(x - ptr.x, y - ptr.y), pf = smooth(clamp(1 - pd / 160, 0, 1)) * ptr.on;
          const glow = Math.max(rg, pf * 0.6);
          const arm = 3 + glow * 3, px = x + dx, py = y + dy;
          g.strokeStyle = glow > 0.05 ? `rgba(${LIME},${(0.08 + glow * 0.7).toFixed(3)})` : `rgba(${PAPER},0.08)`;
          g.beginPath(); g.moveTo(px - arm, py); g.lineTo(px + arm, py); g.moveTo(px, py - arm); g.lineTo(px, py + arm); g.stroke();
        }
      }
    }

    // the dot field
    const base = sp * 0.52, cap = sp - 1;                // magnified dots keep a 1px gap
    const R = Math.max(60, sp * 6);
    const reveal = revealAt ? (now - revealAt) / 900 : 0;
    let found = 0;
    const tags = [];
    units.forEach(u => {
      let [x, y] = center(u);
      const col = u.i % cols, vis = clamp(reveal * 1.6 - col / cols, 0, 1);
      if (vis <= 0) return;
      const [dx, dy, rg] = rippleAt(x, y);
      x += dx * 0.6; y += dy * 0.6;
      const d = Math.hypot(x - ptr.x, y - ptr.y);
      const f = Math.max(smooth(clamp(1 - d / R, 0, 1)) * ptr.on * (hunting ? 1 : 0.55), rg);
      if (hunting && u.wrong && !u.found && f > 0.55) { u.found = true; u.foundAt = now; lastFound = u; }
      const behind = x < X, inQ = u.conf < THR;
      let size = base + (cap - base) * f, color, alpha;
      if (behind) {
        color = PAPER; alpha = u.ng ? 0.6 : 0.2;
        if (inQ) { color = LIME; alpha = 1; size = Math.max(size, base * 1.3); }
        else if (u.wrong) { color = WARN; alpha = 1; }
        else alpha *= 0.7;
      } else {
        color = INK; alpha = u.ng ? 0.72 : 0.2;
        if (u.found) { color = WARN; alpha = 1; size = Math.max(size, base * 1.3); }
      }
      if (rg > 0.05 && !(behind && inQ)) { alpha = Math.min(1, alpha + rg * 0.6); }
      size = Math.min(size, cap);
      u.s += (size - u.s) * (reduce ? 1 : 0.28);
      g.fillStyle = `rgba(${color},${(alpha * vis).toFixed(3)})`;
      g.fillRect(x - u.s / 2, y - u.s / 2, u.s, u.s);

      if (u.wrong) {
        if (u.found) found++;
        const r = Math.max(5, sp * 0.8);
        if (behind) {
          bracket(x, y, r, inQ ? LIME : WARN, 0.95 * vis, !inQ);
          if (!inQ) tags.push([x, y, r, "MISSED 0.93", WARN]);
        } else if (u.found) {
          const age = clamp((now - u.foundAt) / 320, 0, 1);
          bracket(x, y, r * (1 + (1 - smooth(age)) * 1.2), WARN, 0.95 * vis);
          if (u === lastFound) tags.push([x, y, r, `WRONG ${u.conf.toFixed(2)}`, WARN]);
        }
      }
    });
    tags.forEach(([x, y, r, t, c]) => label(Math.min(x + r + 5, W - 84), y + 3.5, t, c, 0.95));

    // the laser
    if (X > 0 && X < W) {
      const trail = g.createLinearGradient(X - 140, 0, X, 0);
      trail.addColorStop(0, `rgba(${LIME},0)`); trail.addColorStop(1, `rgba(${LIME},0.14)`);
      g.fillStyle = trail; g.fillRect(X - 140, 0, 140, H);
      g.fillStyle = `rgba(${LIME},0.95)`; g.fillRect(X - 0.75, 0, 1.5, H);
      g.save(); g.shadowColor = `rgba(${LIME},0.9)`; g.shadowBlur = 16; g.fillRect(X - 0.75, 0, 1.5, H); g.restore();
      label(Math.min(X + 8, W - 70), 76, `SCAN ${Math.round((X / W) * 100)}%`, LIME, 0.9);
    }

    // the scanner reticle follows the pointer while hunting
    if (hunting && ptr.on > 0.02) {
      const c = ptr.x < X ? PAPER : INK;
      g.strokeStyle = `rgba(${c},${0.35 * ptr.on})`; g.lineWidth = 1;
      g.beginPath(); g.arc(ptr.x, ptr.y, R, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([a, b]) => { g.moveTo(ptr.x + a * (R - 6), ptr.y + b * (R - 6)); g.lineTo(ptr.x + a * (R + 6), ptr.y + b * (R + 6)); });
      g.stroke();
      label(ptr.x + R * 0.72, ptr.y - R * 0.72, "SCAN", c, 0.55 * ptr.on);
    }

    setText(statusEls[0], phase === 0 ? "1,000 units · 990 correct · 10 wrong" : `Found ${found}/10 — ${coarse ? "tap" : "move or click"} to scan`);
    if (visible) requestAnimationFrame(frame);
  }

  new ResizeObserver(layout).observe(stage);
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) { if (!revealAt) revealAt = performance.now(); last = 0; requestAnimationFrame(frame); }
  }).observe(section);
  document.fonts && document.fonts.ready.then(layout);
  layout();
  show(0, 0);
};
