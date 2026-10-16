// Vision QC — a working inspection console.
// Panels are synthesised with known ground truth; the detector (detector.js, a Web Worker) only
// ever sees raw pixels. Everything you see — boxes, classes, confidence, verdict, precision and
// recall — is computed live. You can paint your own defects, or drop an image to inspect it.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  if (location.hash === "#embed") document.documentElement.classList.add("is-embed");

  const W = 1200, H = 750;
  const NAME = { SCRATCH: "Scratch", DEAD_PX: "Dead pixel", PARTICLE: "Particle", BUBBLE: "Bubble", MURA: "Mura" };
  const CLASSES = [
    { id: "SCRATCH", ko: "스크래치", color: "#ff6b3d", critical: true },
    { id: "DEAD_PX", ko: "불량 화소", color: "#ff3d7f", critical: true },
    { id: "PARTICLE", ko: "이물", color: "#4dc3ff" },
    { id: "BUBBLE", ko: "기포", color: "#ffd23d" },
    { id: "MURA", ko: "얼룩(무라)", color: "#c38bff" },
  ];
  const CLS = Object.fromEntries(CLASSES.map(c => [c.id, c]));
  const enabled = new Set(CLASSES.map(c => c.id));
  let tau = 0.75;

  /* ---------- detector worker ---------- */
  const worker = new Worker("detector.js?v=10162030");
  let jobId = 0;
  const pending = new Map();
  worker.onmessage = e => { const r = pending.get(e.data.id); pending.delete(e.data.id); r && r(e.data); };
  function detect(panel) {
    const data = panel.cv.getContext("2d").getImageData(0, 0, W, H).data;
    const id = ++jobId;
    return new Promise(res => {
      pending.set(id, res);
      worker.postMessage({ id, w: W, h: H, buf: data.buffer }, [data.buffer]);
    }).then(r => { panel.dets = r.dets; panel.sigma = r.sigma; panel.ms = r.ms; return panel; });
  }

  /* ---------- panel synthesis (ground truth is kept, never shown to the detector) ---------- */
  let serial = 24081;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pattern = (() => {
    const c = document.createElement("canvas"); c.width = 6; c.height = 6;
    const x = c.getContext("2d");
    ["#ff0000", "#00ff00", "#0066ff"].forEach((col, i) => { x.fillStyle = col; x.globalAlpha = 0.05; x.fillRect(i * 2, 0, 2, 5); });
    return c;
  })();
  function basePanel() {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0d121b"); bg.addColorStop(1, "#151c29");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = g.createPattern(pattern, "repeat"); g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(W * rand(0.35, 0.65), H * 0.45, 40, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, "rgba(120,150,200,0.10)"); v.addColorStop(1, "rgba(0,0,0,0.32)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    // sensor noise
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    return { cv, g };
  }
  const GT = {
    SCRATCH(g, x, y) {
      const len = rand(70, 200), ang = rand(0, Math.PI), pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10 - 0.5; pts.push([x + Math.cos(ang) * len * t + rand(-2, 2), y + Math.sin(ang) * len * t + rand(-2, 2)]); }
      strokeScratch(g, pts);
      return boxOf(pts, 6);
    },
    PARTICLE(g, x, y) {
      const r = rand(2.5, 5.5);
      g.save(); g.fillStyle = "rgba(250,250,240,0.95)"; g.shadowColor = "#fff"; g.shadowBlur = 8;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
      return { x: x - r - 6, y: y - r - 6, w: 2 * r + 12, h: 2 * r + 12 };
    },
    DEAD_PX(g, x, y) {
      const cols = ["#ff2020", "#20ff40", "#2050ff"];
      for (let i = 0; i < 5; i++) { g.fillStyle = cols[i % 3]; g.fillRect(x + ((Math.random() * 4) | 0) * 4 - 8, y + ((Math.random() * 4) | 0) * 4 - 8, 4, 4); }
      return { x: x - 12, y: y - 12, w: 24, h: 24 };
    },
    BUBBLE(g, x, y) {
      const r = rand(9, 16);
      g.save(); g.fillStyle = "rgba(0,0,0,0.38)"; g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
      return { x: x - r - 4, y: y - r - 4, w: 2 * r + 8, h: 2 * r + 8 };
    },
    MURA(g, x, y) {
      const rx = rand(60, 110), ry = rand(40, 75);
      const m = g.createRadialGradient(x, y, 0, x, y, rx);
      m.addColorStop(0, "rgba(180,200,240,0.13)"); m.addColorStop(1, "rgba(180,200,240,0)");
      g.save(); g.fillStyle = m; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
      return { x: x - rx * 0.8, y: y - ry * 0.8, w: rx * 1.6, h: ry * 1.6 };
    },
  };
  function strokeScratch(g, pts) {
    g.save(); g.strokeStyle = "rgba(230,240,255,0.85)"; g.lineWidth = 1.5; g.lineCap = "round"; g.lineJoin = "round";
    g.shadowColor = "rgba(200,220,255,0.8)"; g.shadowBlur = 5;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
  }
  function boxOf(pts, pad) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
  }
  function makePanel() {
    const { cv, g } = basePanel();
    const gt = [];
    const n = Math.random() < 0.78 ? 0 : 1 + ((Math.random() * 2.4) | 0);
    for (let i = 0; i < n; i++) {
      const cls = CLASSES[(Math.random() * CLASSES.length) | 0].id;
      gt.push({ cls, ...GT[cls](g, rand(140, W - 140), rand(110, H - 110)) });
    }
    // faint sensor artefacts that aren't defects: they make low thresholds over-report
    for (let i = 0, k = (Math.random() * 3) | 0; i < k; i++) {
      g.save(); g.fillStyle = "rgba(230,235,245,0.1)"; g.beginPath(); g.arc(rand(80, W - 80), rand(80, H - 80), rand(1.5, 3), 0, 6.3); g.fill(); g.restore();
    }
    return { id: `P-${serial++}`, cv, gt, dets: [], user: false };
  }

  /* ---------- judgement + evaluation (pure functions of tau + classes) ---------- */
  const counts = d => enabled.has(d.cls) && d.conf >= tau;
  const hit = (d, b) => d.x < b.x + b.w + 6 && b.x - 6 < d.x + d.w && d.y < b.y + b.h + 6 && b.y - 6 < d.y + d.h;
  function judge(p) {
    const hits = p.dets.filter(counts);
    if (!hits.length) return { ng: false, why: "τ 이상 결함 없음" };
    const top = hits.slice().sort((a, b) => (!!CLS[b.cls].critical - !!CLS[a.cls].critical) || b.conf - a.conf)[0];
    return { ng: true, why: `${CLS[top.cls].ko} ${top.conf.toFixed(2)} ≥ τ ${tau.toFixed(2)}`, cause: top.cls };
  }
  function evaluate(t) {
    let tp = 0, fp = 0, fn = 0;
    history.forEach(p => {
      if (!p.gt) return;
      const dets = p.dets.filter(d => enabled.has(d.cls) && d.conf >= t);
      dets.forEach(d => (p.gt.some(b => hit(d, b)) ? tp++ : fp++));
      p.gt.forEach(b => { if (enabled.has(b.cls) && !dets.some(d => hit(d, b))) fn++; });
    });
    return { p: tp + fp ? tp / (tp + fp) : 1, r: tp + fn ? tp / (tp + fn) : 1 };
  }

  /* ---------- view ---------- */
  const view = $("[data-view]"), cv = $(".stage__cv"), ctx = cv.getContext("2d");
  const tip = $(".tip");
  let fit = { s: 1, ox: 0, oy: 0 }, dpr = 1, cur = null, hover = null, selected = null, drawing = null, sweep = 1;
  const history = [];
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = view.clientWidth, h = view.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const s = Math.min((w - 32) / W, (h - 32) / H);
    fit = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 };
    draw();
  }
  new ResizeObserver(resize).observe(view);
  const toImg = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - fit.ox) / fit.s, (e.clientY - r.top - fit.oy) / fit.s]; };

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!cur) return;
    const { s, ox, oy } = fit;
    ctx.drawImage(cur.cv, ox, oy, W * s, H * s);
    ctx.strokeStyle = "rgba(236,236,228,0.12)"; ctx.strokeRect(ox - 0.5, oy - 0.5, W * s + 1, H * s + 1);
    const sx = sweep * W;
    cur.dets.forEach(d => {
      if (d.x > sx) return;
      const on = counts(d), hot = d === hover || d === selected, col = CLS[d.cls].color;
      const x = ox + d.x * s, y = oy + d.y * s, w = d.w * s, h = d.h * s;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.4;
      ctx.strokeStyle = col; ctx.lineWidth = hot ? 2.4 : 1.4;
      if (!on) ctx.setLineDash([4, 4]);
      const k = Math.min(10, w / 3, h / 3);
      ctx.beginPath();
      ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
      ctx.moveTo(x + w - k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + k);
      ctx.moveTo(x + w, y + h - k); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - k, y + h);
      ctx.moveTo(x + k, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - k);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "500 13px Archivo, 'IBM Plex Sans KR', sans-serif";
      const label = `${NAME[d.cls]} ${d.conf.toFixed(2)}`, tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = col; ctx.fillRect(x, y - 16, tw, 15);
      ctx.fillStyle = "#0b0d02"; ctx.fillText(label, x + 5, y - 5);
      ctx.restore();
    });
    if (sweep < 1) {
      const x = ox + sx * s;
      const g = ctx.createLinearGradient(x - 90, 0, x, 0);
      g.addColorStop(0, "rgba(212,255,58,0)"); g.addColorStop(1, "rgba(212,255,58,0.16)");
      ctx.fillStyle = g; ctx.fillRect(x - 90, oy, 90, H * s);
      ctx.fillStyle = "#d4ff3a"; ctx.fillRect(x - 0.75, oy, 1.5, H * s);
    }
    if (drawing && drawing.pts.length > 1) {
      ctx.save(); ctx.strokeStyle = "#d4ff3a"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); drawing.pts.forEach(([x, y], i) => { const px = ox + x * s, py = oy + y * s; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.restore();
    }
  }
  function scan() {
    sweep = 0;
    const t0 = performance.now();
    const step = now => { sweep = Math.min(1, (now - t0) / 480); draw(); if (sweep < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ---------- pointer: inspect boxes, paint scratches, drop particles ---------- */
  const at = (x, y) => cur && cur.dets.filter(d => x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  cv.addEventListener("pointerdown", e => {
    if (!cur) return;
    const [x, y] = toImg(e);
    if (x < 0 || y < 0 || x > W || y > H) return;
    cv.setPointerCapture(e.pointerId);
    drawing = { pts: [[x, y]], moved: false };
  });
  cv.addEventListener("pointermove", e => {
    const [x, y] = toImg(e);
    if (drawing) {
      const last = drawing.pts[drawing.pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) > 3) { drawing.pts.push([x, y]); drawing.moved = drawing.moved || Math.hypot(x - drawing.pts[0][0], y - drawing.pts[0][1]) > 10; draw(); }
      return;
    }
    const d = at(x, y);
    if (d !== hover) { hover = d; draw(); renderDets(); }
    if (d) {
      const r = view.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = `<b style="color:${CLS[d.cls].color}">${NAME[d.cls]}</b> · ${CLS[d.cls].ko}<br>conf ${d.conf.toFixed(2)} · contrast ${d.feat.contrast}σ · elong ${d.feat.elong}<br>${counts(d) ? '<span style="color:var(--warn)">counts toward NG</span>' : "below τ — ignored"}`;
      tip.style.left = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8) + "px";
      tip.style.top = e.clientY - r.top + 14 + "px";
    } else tip.hidden = true;
  });
  cv.addEventListener("pointerleave", () => { hover = null; tip.hidden = true; draw(); renderDets(); });
  cv.addEventListener("pointerup", async e => {
    if (!drawing || !cur) return;
    const d = drawing; drawing = null;
    const [x, y] = d.pts[0];
    if (!d.moved) {
      const box = at(x, y);
      if (box) { select(box); return; }
    }
    setRunning(false);
    const g = cur.cv.getContext("2d");
    let gt;
    if (d.moved && d.pts.length > 2) { strokeScratch(g, d.pts); gt = { cls: "SCRATCH", ...boxOf(d.pts, 6) }; }
    else gt = { cls: "PARTICLE", ...GT.PARTICLE(g, x, y) };
    if (cur.gt) cur.gt.push(gt);
    cur.user = true;
    await detect(cur);
    refresh(true);
  });

  /* ---------- drop your own image ---------- */
  const drop = $(".drop");
  ["dragenter", "dragover"].forEach(t => view.addEventListener(t, e => { e.preventDefault(); drop.hidden = false; }));
  ["dragleave", "drop"].forEach(t => view.addEventListener(t, e => { e.preventDefault(); if (t === "dragleave" && view.contains(e.relatedTarget)) return; drop.hidden = true; }));
  view.addEventListener("drop", async e => {
    const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith("image/"));
    if (!f) return;
    setRunning(false);
    const bmp = await createImageBitmap(f);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), s = Math.max(W / bmp.width, H / bmp.height);
    g.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    const p = { id: f.name.slice(0, 24), cv: c, gt: null, dets: [], user: true };
    await detect(p);
    push(p);
    show(p);
  });

  /* ---------- rail ---------- */
  const chips = $("[data-chips]");
  CLASSES.forEach(c => {
    const b = document.createElement("button");
    b.className = "chip"; b.setAttribute("aria-pressed", "true"); b.title = c.ko;
    b.innerHTML = `<i style="background:${c.color}"></i>${NAME[c.id]}`;
    b.onclick = () => { enabled.has(c.id) ? enabled.delete(c.id) : enabled.add(c.id); b.setAttribute("aria-pressed", enabled.has(c.id)); refresh(); };
    chips.appendChild(b);
  });
  const tauIn = $("#tau");
  tauIn.addEventListener("input", () => { tau = +tauIn.value; $("[data-tau]").textContent = tau.toFixed(2); refresh(); });

  function renderVerdict() {
    const v = judge(cur), el = $("[data-verdict]");
    el.classList.toggle("is-ng", v.ng); el.classList.toggle("is-pass", !v.ng);
    $("b", el).textContent = v.ng ? "NG" : "Pass";
    $("[data-why]").textContent = v.why;
  }
  function renderDets() {
    const ol = $("[data-dets]"), list = cur.dets.slice().sort((a, b) => b.conf - a.conf);
    $("[data-count]").textContent = `${list.filter(counts).length} / ${list.length}`;
    if (!list.length) { ol.innerHTML = '<li class="empty">검출 없음 · 깨끗한 패널</li>'; return; }
    ol.innerHTML = "";
    list.forEach(d => {
      const li = document.createElement("li"), on = counts(d);
      li.className = (on ? "" : "below ") + (d === hover || d === selected ? "is-hot" : "");
      li.innerHTML = `<i style="background:${CLS[d.cls].color}"></i><span>${NAME[d.cls]} <span class="f">${d.feat.contrast}σ</span></span><span>${d.conf.toFixed(2)}</span><span class="${on ? "ng" : "ok"}">${on ? "NG" : "—"}</span>`;
      li.onmouseenter = () => { hover = d; draw(); };
      li.onmouseleave = () => { hover = null; draw(); };
      li.onclick = () => select(d);
      ol.appendChild(li);
    });
  }
  const loupe = $(".loupe"), lg = loupe.getContext("2d");
  function select(d) { selected = d; setRunning(false); drawLoupe(); draw(); renderDets(); }
  function drawLoupe() {
    lg.fillStyle = "#000"; lg.fillRect(0, 0, loupe.width, loupe.height);
    const d = selected && cur.dets.includes(selected) ? selected : cur.dets[0];
    if (!d) return;
    const z = 4, sw = loupe.width / z, sh = loupe.height / z, cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    lg.imageSmoothingEnabled = false;
    lg.drawImage(cur.cv, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, loupe.width, loupe.height);
    lg.strokeStyle = CLS[d.cls].color; lg.lineWidth = 1;
    lg.strokeRect((d.x - (cx - sw / 2)) * z, (d.y - (cy - sh / 2)) * z, d.w * z, d.h * z);
  }

  // precision / recall vs tau, measured on every panel with ground truth
  const pr = $("[data-pr]");
  function renderPR() {
    const w = pr.clientWidth, h = 92, r = Math.min(devicePixelRatio || 1, 2);
    pr.width = w * r; pr.height = h * r;
    const g = pr.getContext("2d");
    g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(236,236,228,0.08)";
    [0, 0.5, 1].forEach(f => { g.beginPath(); g.moveTo(0, 4 + (h - 8) * (1 - f)); g.lineTo(w, 4 + (h - 8) * (1 - f)); g.stroke(); });
    const xs = [], P = [], R = [];
    for (let t = 0.5; t <= 0.981; t += 0.02) { const m = evaluate(t); xs.push(t); P.push(m.p); R.push(m.r); }
    const X = t => ((t - 0.5) / 0.48) * w, Y = v => 4 + (h - 8) * (1 - v);
    [[P, "#d4ff3a"], [R, "#c9b8ff"]].forEach(([arr, col]) => {
      g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath();
      arr.forEach((v, i) => (i ? g.lineTo(X(xs[i]), Y(v)) : g.moveTo(X(xs[i]), Y(v)))); g.stroke();
    });
    g.fillStyle = "rgba(236,236,228,0.6)"; g.fillRect(X(tau) - 0.5, 0, 1, h);
    const m = evaluate(tau), yld = history.length ? history.filter(p => !judge(p).ng).length / history.length : 1;
    $("[data-p]").textContent = (m.p * 100).toFixed(0) + "%";
    $("[data-r]").textContent = (m.r * 100).toFixed(0) + "%";
    $("[data-y]").textContent = (yld * 100).toFixed(1) + "%";
  }

  const strip = $("[data-strip]");
  function renderStrip() {
    strip.innerHTML = "";
    history.slice(-16).forEach(p => {
      const b = document.createElement("button");
      b.className = (judge(p).ng ? "ng " : "") + (p === cur ? "is-cur" : "");
      b.title = `${p.id} · ${judge(p).ng ? "NG" : "Pass"}`;
      if (!p.thumb) { p.thumb = document.createElement("canvas"); p.thumb.width = 152; p.thumb.height = 95; }
      p.thumb.getContext("2d").drawImage(p.cv, 0, 0, 152, 95);
      b.appendChild(p.thumb);
      const s = document.createElement("span"); s.textContent = p.id.slice(-3); b.appendChild(s);
      b.onclick = () => { setRunning(false); show(p, false); };
      strip.appendChild(b);
    });
    strip.scrollLeft = strip.scrollWidth;
  }

  function refresh(animate) {
    if (!cur) return;
    $("[data-panel]").textContent = `${cur.id} · ${cur.dets.length} detections${cur.gt ? "" : " · your image"}`;
    $("[data-ms]").textContent = cur.ms ?? "—";
    $("[data-sigma]").textContent = cur.sigma ?? "—";
    if (animate) scan(); else draw();
    renderVerdict(); renderDets(); drawLoupe(); renderPR(); renderStrip();
  }
  function push(p) { history.push(p); if (history.length > 80) history.shift(); }
  function show(p, animate = true) {
    cur = p; hover = null;
    if (selected && !p.dets.includes(selected)) selected = null;
    refresh(animate);
  }

  /* ---------- line runner ---------- */
  const runBtn = $("[data-run]");
  let timer = null, running = true;
  function setRunning(on) {
    running = on;
    runBtn.setAttribute("aria-pressed", on);
    $("span", runBtn).textContent = on ? "Running" : "Paused";
    clearInterval(timer);
    if (on) timer = setInterval(next, 2800);
  }
  runBtn.onclick = () => setRunning(!running);
  addEventListener("keydown", e => {
    if (e.target.matches("input")) return;
    if (e.code === "Space") { e.preventDefault(); setRunning(!running); }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      setRunning(false);
      const i = history.indexOf(cur) + (e.key === "ArrowLeft" ? -1 : 1);
      if (history[i]) show(history[i], false);
    }
  });
  async function next() { const p = await detect(makePanel()); push(p); show(p); }

  // warm start: a backlog so the curve and yield mean something immediately
  (async () => {
    for (let i = 0; i < 24; i++) push(await detect(makePanel()));
    await next();
    setRunning(true);
  })();
  addEventListener("resize", renderPR);
  window.__qc = { history, evaluate: t => evaluate(t) };   // inspection hook for testing
})();
