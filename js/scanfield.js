// Hero background: an inspection field. A scanline sweeps the panel and
// "detects" defects as it passes them; the cursor drives a reticle.
window.ScanField = function ScanField(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const ACCENT = opts.accent || "#d4ff3a";
  const LABELS = ["Scratch", "Particle", "Mura", "Dent", "Pinhole", "Bubble"];
  let w = 0, h = 0, dpr = 1;
  let defects = [];
  let scanY = 0;
  let last = performance.now();
  let running = true;
  const mouse = { x: -999, y: -999, tx: -999, ty: -999, inside: false };
  const ripples = [];   // click pulses travelling through the field
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const n = Math.round((w * h) / 150000) + 3;
    defects = Array.from({ length: n }, () => {
      const s = 14 + Math.random() * 34;
      return {
        x: 40 + Math.random() * (w - 80),
        y: 90 + Math.random() * (h - 180),
        s,
        label: LABELS[(Math.random() * LABELS.length) | 0],
        conf: (0.82 + Math.random() * 0.17).toFixed(2),
        hit: 0,          // seconds since detected; 0 = undetected
        jag: Array.from({ length: 7 }, () => 0.4 + Math.random() * 0.6),
      };
    });
  }

  // Grid of crosses. Each click launches a ring wave: points near the wavefront
  // are pushed outward and light up, then settle back (a damped pulse).
  function drawGrid(dt) {
    const step = 36;
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > 2.6) ripples.splice(i, 1);
    }
    const ox = (w % step) / 2, oy = (h % step) / 2;
    ctx.lineWidth = 1;
    for (let x = ox; x < w; x += step) {
      for (let y = oy; y < h; y += step) {
        let glow = 0, dx = 0, dy = 0;
        for (const r of ripples) {
          const ddx = x - r.x, ddy = y - r.y, d = Math.hypot(ddx, ddy) || 1;
          const front = r.t * 520;                     // px/s
          const band = Math.exp(-((d - front) ** 2) / (2 * 34 * 34));
          const decay = Math.max(0, 1 - r.t / 2.6);
          const amp = band * decay;
          glow = Math.max(glow, amp);
          dx += (ddx / d) * amp * 10; dy += (ddy / d) * amp * 10;
        }
        const px = x + dx, py = y + dy, arm = 3 + glow * 3;
        ctx.strokeStyle = glow > 0.05 ? `rgba(212,255,58,${(0.08 + glow * 0.85).toFixed(3)})` : "rgba(236,236,228,0.08)";
        ctx.beginPath();
        ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
        ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
        ctx.stroke();
      }
    }
    // the wavefront itself, a faint expanding ring
    ripples.forEach(r => {
      const decay = Math.max(0, 1 - r.t / 2.6);
      ctx.strokeStyle = `rgba(212,255,58,${(0.35 * decay).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.t * 520, 0, Math.PI * 2); ctx.stroke();
    });
  }

  function drawDefect(d) {
    // the faint physical mark, always visible
    ctx.fillStyle = "rgba(236,236,228,0.10)";
    ctx.beginPath();
    d.jag.forEach((r, i) => {
      const a = (i / d.jag.length) * Math.PI * 2;
      const px = d.x + Math.cos(a) * d.s * 0.35 * r;
      const py = d.y + Math.sin(a) * d.s * 0.35 * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath(); ctx.fill();

    if (!d.hit) return;
    const t = d.hit;
    const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 2.2) / 0.8);
    if (alpha <= 0) return;
    const grow = Math.min(1, t / 0.25);
    const half = d.s * (1.6 - 0.6 * grow);
    const c = Math.min(10, half * 0.5);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5;
    ctx.beginPath();
    const L = d.x - half, R = d.x + half, T = d.y - half, B = d.y + half;
    ctx.moveTo(L, T + c); ctx.lineTo(L, T); ctx.lineTo(L + c, T);
    ctx.moveTo(R - c, T); ctx.lineTo(R, T); ctx.lineTo(R, T + c);
    ctx.moveTo(R, B - c); ctx.lineTo(R, B); ctx.lineTo(R - c, B);
    ctx.moveTo(L + c, B); ctx.lineTo(L, B); ctx.lineTo(L, B - c);
    ctx.stroke();
    ctx.font = "500 13px Archivo, 'IBM Plex Sans KR', sans-serif";
    const text = `${d.label} ${d.conf}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(L, T - 16, tw + 10, 14);
    ctx.fillStyle = "#0b0d02";
    ctx.fillText(text, L + 5, T - 5.5);
    ctx.globalAlpha = 1;
  }

  function drawScan() {
    const g = ctx.createLinearGradient(0, scanY - 120, 0, scanY);
    g.addColorStop(0, "rgba(212,255,58,0)");
    g.addColorStop(1, "rgba(212,255,58,0.07)");
    ctx.fillStyle = g;
    ctx.fillRect(0, scanY - 120, w, 120);
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, scanY, w, 1);
    ctx.globalAlpha = 1;
  }

  function drawReticle() {
    if (!mouse.inside) return;
    mouse.x += (mouse.tx - mouse.x) * 0.18;
    mouse.y += (mouse.ty - mouse.y) * 0.18;
    ctx.strokeStyle = "rgba(236,236,228,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mouse.y); ctx.lineTo(w, mouse.y);
    ctx.moveTo(mouse.x, 0); ctx.lineTo(mouse.x, h);
    ctx.stroke();
    ctx.strokeStyle = ACCENT;
    ctx.strokeRect(mouse.x - 14, mouse.y - 14, 28, 28);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    drawGrid(dt);

    const prev = scanY;
    scanY += dt * h / 4.2;
    if (scanY > h + 40) { scanY = -10; defects.forEach(d => (d.hit = 0)); }
    defects.forEach(d => {
      if (!d.hit && prev < d.y && scanY >= d.y) d.hit = 0.0001;
      if (d.hit) d.hit += dt;
      drawDefect(d);
    });
    drawScan();
    drawReticle();
    opts.onFrame && opts.onFrame(mouse);
    requestAnimationFrame(frame);
  }

  function setMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top;
    if (!mouse.inside) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
    mouse.inside = true;
  }

  addEventListener("resize", resize);
  const host = canvas.parentElement;
  host.addEventListener("pointermove", setMouse);
  host.addEventListener("pointerleave", () => (mouse.inside = false));
  host.addEventListener("pointerdown", e => {
    const r = canvas.getBoundingClientRect();
    ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: 0 });
    if (ripples.length > 4) ripples.shift();
  });
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting && !reduce;
    if (running && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(canvas);

  resize();
  if (reduce) {
    // static frame: everything detected
    defects.forEach(d => (d.hit = 1));
    ctx.clearRect(0, 0, w, h); drawGrid(0); defects.forEach(drawDefect);
    running = false;
  } else {
    requestAnimationFrame(frame);
  }
  return { mouse };
};
