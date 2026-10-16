// Loader: an inspection window that opens into the hero.
// Everything is drawn on one fixed full-screen canvas in screen pixels; the window
// rect R grows from the tile slot to the viewport, so the "+" pitch, the defects and
// the 1.5px scan line never scale. The "+" lattice matches the hero's, so the
// hand-off is seamless.
window.Loader = function Loader(root, slot) {
  const canvas = document.createElement("canvas");
  canvas.className = "loader__cv";
  root.prepend(canvas);
  const g = canvas.getContext("2d");
  const ACC = "212,255,58", PAPER = "236,236,228";
  const LABELS = ["SCRATCH", "PARTICLE", "MURA", "DENT", "PINHOLE", "BUBBLE"];
  const STEP = 36;                                   // same pitch + origin as the hero field
  let W = 0, H = 0, dpr = 1, alive = true, t0 = performance.now();
  const R = { x: 0, y: 0, w: 0, h: 0, open: 0, count: 0 };   // open: 0 tile → 1 full screen

  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  size();
  addEventListener("resize", size);

  // defects in screen space: a few guaranteed inside the starting tile, the rest across the viewport
  const tile = slot.getBoundingClientRect();
  Object.assign(R, { x: tile.left, y: tile.top, w: tile.width, h: 0 });
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const mk = (x, y) => ({ x, y, s: 10 + rnd() * 18, label: LABELS[(rnd() * LABELS.length) | 0], conf: (0.86 + rnd() * 0.13).toFixed(2), hit: 0, last: -1,
    jag: Array.from({ length: 7 }, () => 0.45 + rnd() * 0.55) });
  const defects = [
    mk(tile.left + tile.width * 0.3, tile.top + tile.height * 0.35),
    mk(tile.left + tile.width * 0.72, tile.top + tile.height * 0.62),
    mk(tile.left + tile.width * 0.48, tile.top + tile.height * 0.82),
  ];
  for (let i = 0; i < 12; i++) defects.push(mk(60 + rnd() * (W - 120), 80 + rnd() * (H - 160)));

  function defect(d, inR) {
    g.fillStyle = `rgba(${PAPER},0.12)`;
    g.beginPath();
    d.jag.forEach((r, i) => {
      const a = (i / d.jag.length) * Math.PI * 2, px = d.x + Math.cos(a) * d.s * 0.35 * r, py = d.y + Math.sin(a) * d.s * 0.35 * r;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    g.closePath(); g.fill();
    if (!d.hit || !inR) return;
    const t = d.hit, alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 1.6) / 0.6);
    if (alpha <= 0) return;
    const half = d.s * (1.5 - 0.5 * Math.min(1, t / 0.25)), c = Math.min(9, half * 0.5);
    const L = d.x - half, Rr = d.x + half, T = d.y - half, B = d.y + half;
    g.globalAlpha = alpha;
    g.strokeStyle = `rgb(${ACC})`; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(L, T + c); g.lineTo(L, T); g.lineTo(L + c, T);
    g.moveTo(Rr - c, T); g.lineTo(Rr, T); g.lineTo(Rr, T + c);
    g.moveTo(Rr, B - c); g.lineTo(Rr, B); g.lineTo(Rr - c, B);
    g.moveTo(L + c, B); g.lineTo(L, B); g.lineTo(L, B - c);
    g.stroke();
    g.font = "500 10px 'JetBrains Mono', monospace";
    const text = `${d.label} ${d.conf}`, tw = g.measureText(text).width;
    g.fillStyle = `rgb(${ACC})`; g.fillRect(L, T - 16, tw + 10, 14);
    g.fillStyle = "#0b0d02"; g.fillText(text, L + 5, T - 5.5);
    g.globalAlpha = 1;
  }

  let last = t0, scanPrev = 0;
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#08090b"; g.fillRect(0, 0, W, H);
    if (R.w > 1 && R.h > 1) {
      g.save();
      g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
      // the window lifts slightly off the page while small, matching the hero once open
      const lift = 1 - R.open;
      g.fillStyle = `rgba(30,34,40,${(0.6 * lift).toFixed(3)})`; g.fillRect(R.x, R.y, R.w, R.h);
      // "+" lattice, fixed pitch
      const ox = (W % STEP) / 2, oy = (H % STEP) / 2;
      g.strokeStyle = `rgba(${PAPER},0.09)`; g.lineWidth = 1;
      g.beginPath();
      for (let x = ox; x < W; x += STEP) {
        if (x < R.x - 4 || x > R.x + R.w + 4) continue;
        for (let y = oy; y < H; y += STEP) {
          if (y < R.y - 4 || y > R.y + R.h + 4) continue;
          g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y - 3); g.lineTo(x, y + 3);
        }
      }
      g.stroke();
      // scan line sweeps the window top → bottom; 1.5px in every frame
      const period = 1.15, frac = ((now - t0) / 1000 / period) % 1;
      const sy = R.y + frac * R.h;
      defects.forEach(d => {
        const inR = d.x > R.x && d.x < R.x + R.w && d.y > R.y && d.y < R.y + R.h;
        // only a normal scan step detects; the big jumps while the window grows don't
        if (inR && scanPrev <= d.y && sy >= d.y && sy - scanPrev < 40) d.hit = 0.0001;
        if (d.hit) d.hit += dt;
        if (d.hit > 2.2) d.hit = 0;
        defect(d, inR);
      });
      scanPrev = sy;
      const trail = g.createLinearGradient(0, sy - 70, 0, sy);
      trail.addColorStop(0, `rgba(${ACC},0)`); trail.addColorStop(1, `rgba(${ACC},0.1)`);
      g.fillStyle = trail; g.fillRect(R.x, sy - 70, R.w, 70);
      g.fillStyle = `rgba(${ACC},0.95)`; g.fillRect(R.x, sy - 0.75, R.w, 1.5);
      g.restore();
      // frame + readout
      if (lift > 0.02) {
        g.strokeStyle = `rgba(${PAPER},${(0.22 * lift).toFixed(3)})`; g.lineWidth = 1;
        g.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
        g.font = "500 11px 'JetBrains Mono', monospace";
        g.fillStyle = `rgba(${ACC},${lift.toFixed(3)})`;
        g.textAlign = "right";
        g.fillText(String(Math.round(R.count)).padStart(3, "0"), R.x + R.w - 8, R.y + R.h - 8);
        g.textAlign = "left";
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    R,
    tileRect: () => slot.getBoundingClientRect(),
    stop() { alive = false; removeEventListener("resize", size); },
  };
};
