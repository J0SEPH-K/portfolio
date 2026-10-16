// Vision QC — a machine-vision result console.
// Panels are procedurally rendered (seeded), "detections" carry a class and a
// confidence, and every verdict is a pure function of (detections, threshold,
// enabled classes) — so moving the slider re-judges the whole history live.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  if (location.hash === "#embed" || new URLSearchParams(location.search).has("embed")) document.body.classList.add("is-embed");

  const CLASSES = [
    { id: "SCRATCH", ko: "스크래치", color: "#ff6b3d", critical: true },
    { id: "DEAD_PX", ko: "불량 화소", color: "#ff3d7f", critical: true },
    { id: "PARTICLE", ko: "이물", color: "#4dc3ff", critical: false },
    { id: "MURA", ko: "얼룩(무라)", color: "#c38bff", critical: false },
    { id: "BUBBLE", ko: "기포", color: "#ffd23d", critical: false },
  ];
  const CLS = Object.fromEntries(CLASSES.map(c => [c.id, c]));
  const enabled = new Set(CLASSES.map(c => c.id));
  const IMG_W = 1200, IMG_H = 750;
  const INTERVAL = 2200;
  const HISTORY = 120;

  let threshold = 0.8;
  let history = [];
  let cur = null;          // panel being shown
  let running = true;
  let hover = null, selected = null;
  let sweep = 1;           // 0→1 reveal on a fresh panel
  let serial = 24081;

  /* ---------- seeded rng ---------- */
  const mulberry = a => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ---------- panel generation ---------- */
  function makePanel() {
    const seed = (Math.random() * 1e9) | 0;
    const rnd = mulberry(seed);
    const defects = [];
    const real = rnd() < 0.12 ? 1 + ((rnd() * 3) | 0) : 0;
    const noise = rnd() < 0.55 ? 1 + ((rnd() * 2) | 0) : 0;
    const add = (isReal) => {
      const cls = CLASSES[(rnd() * CLASSES.length) | 0].id;
      const x = 120 + rnd() * (IMG_W - 240), y = 100 + rnd() * (IMG_H - 200);
      const conf = isReal ? 0.74 + rnd() * 0.25 : 0.5 + rnd() * 0.3;
      defects.push({ cls, x, y, conf: +conf.toFixed(2), seed: (rnd() * 1e9) | 0 });
    };
    for (let i = 0; i < real; i++) add(true);
    for (let i = 0; i < noise; i++) add(false);
    const panel = { id: `P-${serial++}`, seed, defects, infer: 18 + ((rnd() * 14) | 0), img: null };
    render(panel);
    return panel;
  }

  // subpixel stripe pattern, built once
  const subpx = (() => {
    const c = document.createElement("canvas");
    c.width = 6; c.height = 6;
    const x = c.getContext("2d");
    ["#ff0000", "#00ff00", "#0066ff"].forEach((col, i) => { x.fillStyle = col; x.globalAlpha = 0.05; x.fillRect(i * 2, 0, 2, 5); });
    return c;
  })();

  function render(panel) {
    const c = document.createElement("canvas");
    c.width = IMG_W; c.height = IMG_H;
    const g = c.getContext("2d");
    const rnd = mulberry(panel.seed);
    const bg = g.createLinearGradient(0, 0, IMG_W, IMG_H);
    bg.addColorStop(0, "#0c1119"); bg.addColorStop(1, "#141b27");
    g.fillStyle = bg; g.fillRect(0, 0, IMG_W, IMG_H);
    g.fillStyle = g.createPattern(subpx, "repeat"); g.fillRect(0, 0, IMG_W, IMG_H);
    // gentle illumination falloff
    const v = g.createRadialGradient(IMG_W * (0.4 + rnd() * 0.2), IMG_H * 0.45, 50, IMG_W / 2, IMG_H / 2, IMG_W * 0.75);
    v.addColorStop(0, "rgba(120,150,200,0.10)"); v.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = v; g.fillRect(0, 0, IMG_W, IMG_H);
    // active area + fiducials
    g.strokeStyle = "rgba(200,215,240,0.18)"; g.lineWidth = 1;
    g.strokeRect(60.5, 50.5, IMG_W - 121, IMG_H - 101);
    [[60, 50], [IMG_W - 60, 50], [60, IMG_H - 50], [IMG_W - 60, IMG_H - 50]].forEach(([x, y]) => {
      g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x + 14, y); g.moveTo(x, y - 14); g.lineTo(x, y + 14); g.stroke();
    });
    g.fillStyle = "rgba(200,215,240,0.3)"; g.font = "12px monospace";
    g.fillText(`${panel.id}  AA 1080×675`, 72, IMG_H - 60);

    panel.defects.forEach(d => drawDefect(g, d));
    panel.img = c;
  }

  function drawDefect(g, d) {
    const r = mulberry(d.seed);
    g.save();
    let w = 20, h = 20;
    if (d.cls === "SCRATCH") {
      const len = 70 + r() * 140, ang = r() * Math.PI;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8 - 0.5;
        pts.push([d.x + Math.cos(ang) * len * t + (r() - 0.5) * 4, d.y + Math.sin(ang) * len * t + (r() - 0.5) * 4]);
      }
      g.strokeStyle = "rgba(225,235,255,0.75)"; g.lineWidth = 1.3;
      g.shadowColor = "rgba(200,220,255,0.8)"; g.shadowBlur = 6;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      w = Math.abs(Math.cos(ang) * len) + 16; h = Math.abs(Math.sin(ang) * len) + 16;
    } else if (d.cls === "PARTICLE") {
      const s = 3 + r() * 5;
      g.fillStyle = "rgba(245,245,235,0.9)"; g.shadowColor = "#fff"; g.shadowBlur = 10;
      g.beginPath(); g.arc(d.x, d.y, s, 0, Math.PI * 2); g.fill();
      w = h = s * 2 + 18;
    } else if (d.cls === "MURA") {
      const rx = 50 + r() * 70, ry = 30 + r() * 50;
      const m = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, rx);
      m.addColorStop(0, "rgba(170,190,230,0.16)"); m.addColorStop(1, "rgba(170,190,230,0)");
      g.fillStyle = m; g.beginPath(); g.ellipse(d.x, d.y, rx, ry, r() * Math.PI, 0, Math.PI * 2); g.fill();
      w = rx * 1.6; h = ry * 1.8 + 10;
    } else if (d.cls === "DEAD_PX") {
      const cols = ["#ff2b2b", "#2bff4f", "#000", "#fff"];
      for (let i = 0; i < 5; i++) {
        g.fillStyle = cols[(r() * cols.length) | 0];
        g.fillRect(d.x + ((r() * 4) | 0) * 4 - 8, d.y + ((r() * 4) | 0) * 4 - 8, 4, 4);
      }
      w = h = 34;
    } else if (d.cls === "BUBBLE") {
      const s = 8 + r() * 10;
      g.strokeStyle = "rgba(255,255,255,0.4)"; g.lineWidth = 1.5;
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath(); g.arc(d.x, d.y, s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.arc(d.x - s * 0.3, d.y - s * 0.3, s * 0.35, Math.PI, Math.PI * 1.6); g.stroke();
      w = h = s * 2 + 16;
    }
    g.restore();
    d.box = { x: d.x - w / 2, y: d.y - h / 2, w, h };
  }

  /* ---------- judgement (pure) ---------- */
  const counts = d => enabled.has(d.cls) && d.conf >= threshold;
  function judge(panel) {
    const hits = panel.defects.filter(counts);
    if (!hits.length) return { ng: false, why: "임계값 이상 결함 없음", cause: null };
    const top = hits.slice().sort((a, b) => (CLS[b.cls].critical - CLS[a.cls].critical) || b.conf - a.conf)[0];
    return { ng: true, why: `${CLS[top.cls].ko} ${top.conf.toFixed(2)} ≥ ${threshold.toFixed(2)}`, cause: top.cls };
  }

  /* ---------- main view ---------- */
  const canvas = $(".view__canvas");
  const ctx = canvas.getContext("2d");
  const stage = $(".view__stage");
  const tip = $(".tip");
  let fit = { s: 1, ox: 0, oy: 0 };
  let dpr = 1;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const s = Math.min((w - 24) / IMG_W, (h - 24) / IMG_H);
    fit = { s, ox: (w - IMG_W * s) / 2, oy: (h - IMG_H * s) / 2 };
  }
  new ResizeObserver(() => { resize(); draw(); }).observe(stage);

  function draw() {
    if (!cur) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { s, ox, oy } = fit;
    ctx.drawImage(cur.img, ox, oy, IMG_W * s, IMG_H * s);
    const sweepX = sweep * IMG_W;

    cur.defects.forEach(d => {
      if (d.box.x > sweepX) return;
      const b = d.box, col = CLS[d.cls].color;
      const x = ox + b.x * s, y = oy + b.y * s, w = b.w * s, h = b.h * s;
      const on = counts(d), hot = d === hover || d === selected;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.strokeStyle = col; ctx.lineWidth = hot ? 2.5 : 1.5;
      if (!on) ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.font = "500 11px 'JetBrains Mono', monospace";
      const label = `${d.cls} ${d.conf.toFixed(2)}`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = col; ctx.fillRect(x, y - 17, tw, 16);
      ctx.fillStyle = "#0b0d02"; ctx.fillText(label, x + 5, y - 5);
      ctx.restore();
    });

    if (sweep < 1) {
      const x = ox + sweepX * s;
      const g = ctx.createLinearGradient(x - 80, 0, x, 0);
      g.addColorStop(0, "rgba(212,255,58,0)"); g.addColorStop(1, "rgba(212,255,58,0.18)");
      ctx.fillStyle = g; ctx.fillRect(x - 80, oy, 80, IMG_H * s);
      ctx.fillStyle = "#d4ff3a"; ctx.fillRect(x, oy, 1.5, IMG_H * s);
    }
  }

  function hitTest(e) {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left - fit.ox) / fit.s, my = (e.clientY - r.top - fit.oy) / fit.s;
    // smallest box wins when boxes overlap
    return cur.defects
      .filter(d => mx >= d.box.x && mx <= d.box.x + d.box.w && my >= d.box.y && my <= d.box.y + d.box.h)
      .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0] || null;
  }
  canvas.addEventListener("pointermove", e => {
    const d = hitTest(e);
    if (d !== hover) { hover = d; draw(); renderDets(); }
    if (d) {
      const r = stage.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = `<b style="color:${CLS[d.cls].color}">${d.cls}</b> · ${CLS[d.cls].ko}<br>conf ${d.conf.toFixed(2)} · ${counts(d) ? '<span style="color:var(--warn)">counts toward NG</span>' : "ignored"}<br>x ${d.x | 0} y ${d.y | 0} · ${d.box.w | 0}×${d.box.h | 0}px`;
      const tx = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8);
      tip.style.left = tx + "px"; tip.style.top = e.clientY - r.top + 14 + "px";
    } else tip.hidden = true;
  });
  canvas.addEventListener("pointerleave", () => { hover = null; tip.hidden = true; draw(); renderDets(); });
  canvas.addEventListener("click", e => { const d = hitTest(e); if (d) select(d); });

  /* ---------- loupe ---------- */
  const loupe = $(".loupe__canvas"), lctx = loupe.getContext("2d");
  function select(d) {
    selected = d;
    setRunning(false);
    $("[data-loupe-label]").textContent = `${d.cls} · ×4`;
    drawLoupe(); draw(); renderDets();
  }
  function drawLoupe() {
    lctx.fillStyle = "#000"; lctx.fillRect(0, 0, loupe.width, loupe.height);
    if (!selected || !cur.defects.includes(selected)) { $("[data-loupe-label]").textContent = "— click a box"; return; }
    const z = 4, sw = loupe.width / z, sh = loupe.height / z;
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(cur.img, selected.x - sw / 2, selected.y - sh / 2, sw, sh, 0, 0, loupe.width, loupe.height);
    lctx.strokeStyle = CLS[selected.cls].color; lctx.lineWidth = 1;
    lctx.beginPath();
    lctx.moveTo(loupe.width / 2, 0); lctx.lineTo(loupe.width / 2, loupe.height);
    lctx.moveTo(0, loupe.height / 2); lctx.lineTo(loupe.width, loupe.height / 2);
    lctx.stroke();
  }

  /* ---------- side panel ---------- */
  const classesEl = $("[data-classes]");
  CLASSES.forEach(c => {
    const b = document.createElement("button");
    b.className = "cls"; b.setAttribute("aria-pressed", "true");
    b.innerHTML = `<i style="background:${c.color}"></i>${c.id}`;
    b.title = c.ko + (c.critical ? " · critical" : "");
    b.addEventListener("click", () => {
      enabled.has(c.id) ? enabled.delete(c.id) : enabled.add(c.id);
      b.setAttribute("aria-pressed", enabled.has(c.id));
      refresh();
    });
    classesEl.appendChild(b);
  });

  const thr = $("#thr"), thrVal = $("[data-thr-val]");
  thr.addEventListener("input", () => { threshold = +thr.value; thrVal.textContent = threshold.toFixed(2); refresh(); });

  function renderVerdict() {
    const v = judge(cur);
    const el = $("[data-verdict]");
    el.classList.toggle("is-ng", v.ng); el.classList.toggle("is-pass", !v.ng);
    $("b", el).textContent = v.ng ? "NG" : "PASS";
    $("[data-verdict-why]").textContent = v.why;
  }

  function renderDets() {
    const ol = $("[data-dets]");
    const list = cur.defects.slice().sort((a, b) => b.conf - a.conf);
    $("[data-det-count]").textContent = `${list.filter(counts).length} / ${list.length}`;
    ol.innerHTML = "";
    if (!list.length) { ol.innerHTML = '<li style="cursor:default;grid-template-columns:1fr" class="c">검출 없음 — 깨끗한 패널</li>'; return; }
    list.forEach(d => {
      const li = document.createElement("li");
      const on = counts(d);
      li.className = (on ? "" : "is-below ") + (d === hover || d === selected ? "is-hot" : "");
      li.innerHTML = `<i style="background:${CLS[d.cls].color}"></i><span>${d.cls} <span class="c">${CLS[d.cls].ko}</span></span><span>${d.conf.toFixed(2)}</span><span class="${on ? "ng" : "ok"}">${on ? "NG" : "—"}</span>`;
      li.addEventListener("pointerenter", () => { hover = d; draw(); });
      li.addEventListener("pointerleave", () => { hover = null; draw(); });
      li.addEventListener("click", () => select(d));
      ol.appendChild(li);
    });
  }

  /* ---------- line stats ---------- */
  const spark = $("[data-spark]");
  function renderStats() {
    const win = history.slice(-60);
    const verdicts = win.map(judge);
    const pass = verdicts.filter(v => !v.ng).length;
    $("[data-n]").textContent = win.length;
    $("[data-yield]").textContent = win.length ? ((pass / win.length) * 100).toFixed(1) + "%" : "—";

    // rolling yield (window 10)
    const w = spark.clientWidth, h = 60;
    spark.width = w * dpr; spark.height = h * dpr;
    const g = spark.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(236,236,228,0.12)";
    [0.25, 0.5, 0.75].forEach(f => { g.beginPath(); g.moveTo(0, h * f); g.lineTo(w, h * f); g.stroke(); });
    if (verdicts.length > 1) {
      const pts = verdicts.map((_, i) => {
        const seg = verdicts.slice(Math.max(0, i - 9), i + 1);
        return seg.filter(v => !v.ng).length / seg.length;
      });
      g.strokeStyle = "#d4ff3a"; g.lineWidth = 1.5; g.beginPath();
      pts.forEach((p, i) => {
        const x = (i / (pts.length - 1)) * w, y = h - p * (h - 4) - 2;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
    }

    // pareto of NG causes
    const tally = {};
    verdicts.forEach(v => v.ng && (tally[v.cause] = (tally[v.cause] || 0) + 1));
    const max = Math.max(1, ...Object.values(tally));
    $("[data-pareto]").innerHTML = CLASSES
      .map(c => ({ c, n: tally[c.id] || 0 }))
      .sort((a, b) => b.n - a.n)
      .map(({ c, n }) => `<div><span>${c.id}</span><span class="bar"><i style="width:${(n / max) * 100}%;background:${c.color}"></i></span><b>${n}</b></div>`)
      .join("");

    // queue strip
    const strip = $("[data-strip]");
    strip.innerHTML = "";
    history.slice(-12).forEach(p => {
      const b = document.createElement("button");
      b.className = (judge(p).ng ? "ng " : "") + (p === cur ? "is-cur" : "");
      b.textContent = p.id.slice(-3);
      b.title = `${p.id} · ${judge(p).ng ? "NG" : "PASS"}`;
      b.addEventListener("click", () => { setRunning(false); show(p, false); });
      strip.appendChild(b);
    });
  }

  function refresh() { draw(); renderVerdict(); renderDets(); renderStats(); drawLoupe(); }

  /* ---------- flow ---------- */
  function show(panel, animate = true) {
    cur = panel;
    hover = null;
    if (selected && !panel.defects.includes(selected)) selected = null;
    $("[data-panel-id]").textContent = `${panel.id} · ${panel.defects.length} detections`;
    $("[data-infer]").textContent = panel.infer;
    if (animate) {
      sweep = 0;
      const t0 = performance.now();
      const step = now => {
        sweep = Math.min(1, (now - t0) / 520);
        draw();
        if (sweep < 1) requestAnimationFrame(step);
        else refresh();
      };
      requestAnimationFrame(step);
      renderVerdict(); renderDets(); renderStats(); drawLoupe();
    } else { sweep = 1; refresh(); }
  }

  function next() {
    const p = makePanel();
    history.push(p);
    if (history.length > HISTORY) history.shift();
    show(p);
  }

  const runChip = $("[data-run]");
  runChip.setAttribute("role", "button");
  runChip.setAttribute("tabindex", "0");
  runChip.style.cursor = "pointer";
  let timer = null;
  function setRunning(on) {
    running = on;
    document.body.classList.toggle("is-paused", !on);
    $("span", runChip).textContent = on ? "RUNNING" : "PAUSED";
    clearInterval(timer);
    if (on) { if (cur !== history[history.length - 1]) show(history[history.length - 1]); timer = setInterval(next, INTERVAL); }
  }
  runChip.addEventListener("click", () => setRunning(!running));
  runChip.addEventListener("keydown", e => { if (e.key === "Enter") setRunning(!running); });
  addEventListener("keydown", e => {
    if (e.target.matches("input")) return;
    if (e.code === "Space") { e.preventDefault(); setRunning(!running); }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      setRunning(false);
      const i = history.indexOf(cur) + (e.key === "ArrowLeft" ? -1 : 1);
      if (history[i]) show(history[i], false);
    }
  });

  setInterval(() => { $("[data-uph]").textContent = running ? (1600 + ((Math.random() * 60) | 0)).toLocaleString() : 0; }, 1500);

  // warm start: a short backlog so stats are meaningful immediately
  resize();
  for (let i = 0; i < 40; i++) history.push(makePanel());
  next();
  setRunning(true);
})();
