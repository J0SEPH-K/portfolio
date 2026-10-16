// Orbital domain map, after Turion's mission diagram: a layered planet limb,
// labelled orbit rings, tracked units in brackets, dotted transfer paths, and a
// camera that pulls back one ring per scroll step. Everything is plain SVG,
// re-laid out in screen pixels each frame so strokes and labels stay crisp.
window.Orbit = function Orbit(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const PURPLE = "rgb(143, 75, 255)", LAV = "rgb(201, 184, 255)", ACC = "#d4ff3a", WARN = "#ff6b3d";
  const mk = (tag, attrs = {}, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  const rad = d => (d * Math.PI) / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = t => t * t * (3 - 2 * t);

  let W = 1440, H = 900, k = 1, mobile = false;
  let t = 0;                      // camera position, 0..3 (one unit per step)
  let hover = null;
  const cam = { x: 0, y: 0, s: 1 };

  // camera keys: earth centre as a fraction of the frame, and zoom
  const KEYS = [
    { ex: 0.30, ey: 1.26, s: 1.9 },
    { ex: 0.16, ey: 1.05, s: 1.0 },
    { ex: 0.10, ey: 0.99, s: 0.62 },
    { ex: 0.07, ey: 0.96, s: 0.40 },
  ];
  const KEYS_M = [
    { ex: 0.10, ey: 0.62, s: 1.15 },
    { ex: 0.04, ey: 0.60, s: 0.62 },
    { ex: 0.02, ey: 0.58, s: 0.40 },
    { ex: 0.00, ey: 0.57, s: 0.26 },
  ];

  /* ---------- static layers ---------- */
  const defs = mk("defs");
  const cone = mk("linearGradient", { id: "orb-cone", x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  mk("stop", { offset: 0, "stop-color": PURPLE, "stop-opacity": 0.42 }, cone);
  mk("stop", { offset: 1, "stop-color": PURPLE, "stop-opacity": 0 }, cone);

  const gStars = mk("g");
  const stars = Array.from({ length: 150 }, () => {
    const w = Math.random() < 0.2 ? 2 : 1, h = Math.random() < 0.2 ? 2 : 1;
    return { fx: Math.random(), fy: Math.random(), el: mk("rect", { width: w, height: h, fill: "#fff", opacity: (0.12 + Math.random() * 0.5).toFixed(2) }, gStars) };
  });

  // the planet: stacked strokes, outermost glow first (Turion's limb recipe)
  const gPlanet = mk("g");
  const LIMB = [
    { r: 330, sw: 190, c: "#3B3FA8", o: 0.06 }, { r: 302, sw: 96, c: "#5A55C8", o: 0.12 }, { r: 284, sw: 40, c: "#8C72E0", o: 0.22 },
    { r: 274, sw: 12, c: "#D4B4EC", o: 0.5 }, { r: 270, sw: 2.5, c: "#F2EAF7", o: 0.95 }, { r: 250, sw: 40, c: "#6B5A8A", o: 0.28 }, { r: 200, sw: 90, c: "#2A2340", o: 0.5 },
  ];
  const core = mk("circle", { fill: "#000" }, gPlanet);
  const limb = LIMB.map(L => ({ ...L, el: mk("circle", { fill: "none", stroke: L.c, "stroke-opacity": L.o }, gPlanet) }));

  /* ---------- rings ---------- */
  const gRings = mk("g");
  const gLabels = mk("g");
  const RINGS = [
    { id: "LINE", r: 335, dash: "", op: 0.9, label: "LINE 03", at: -64, step: 0 },
    { id: "KNOW", r: 621, dash: "", op: 0.75, label: "KNOWLEDGE", at: -97, step: 1 },
    { id: "PLAT", r: 980, dash: "1 4", op: 0.7, label: "PLATFORM", at: -62, step: 2 },
    { id: "FIELD", r: 1580, dash: "1 5", op: 0.7, label: "FIELD", at: -52, step: 3 },
  ];
  RINGS.forEach(R => {
    R.el = mk("circle", { fill: "none", stroke: "#fff", "stroke-width": 1, "stroke-dasharray": R.dash }, gRings);
    R.txt = mk("text", { class: "orb-ring" }, gLabels);
    R.txt.textContent = R.label;
  });

  const gPaths = mk("g");
  const gMesh = mk("g");
  const gStruct = mk("g");
  const gVeh = mk("g");
  const gBr = mk("g");

  /* ---------- step 0: units on the line ---------- */
  const units = Array.from({ length: 18 }, (_, i) => {
    const g = mk("g", {}, gVeh);
    mk("line", { x1: -11.4, y1: 0, x2: 11.4, y2: 0, stroke: PURPLE, "stroke-width": 1 }, g);
    mk("rect", { x: -3, y: -3, width: 6, height: 6, fill: PURPLE }, g);
    return { a: -118 + i * 6.4 + Math.random() * 3, id: 410 + i * 7, conf: (0.9 + Math.random() * 0.09).toFixed(2), g };
  });
  units[6].ng = true; units[6].conf = "0.71";
  const meshes = units.slice(0, -1).map(() => mk("line", { stroke: PURPLE, "stroke-width": 1, opacity: 0.35 }, gMesh));
  const coneEl = mk("path", { fill: "url(#orb-cone)" }, gMesh);
  const bracketD = "M-7,-4V-7H-4 M4,-7H7V-4 M7,4V7H4 M-4,7H-7V4";
  const tracked = [2, 4, 6, 9, 12, 15].map(i => {
    const g = mk("g", {}, gBr);
    const u = units[i];
    mk("path", { d: bracketD, fill: "none", stroke: u.ng ? WARN : LAV, "stroke-width": 1 }, g);
    const tx = mk("text", { class: "orb-tiny", x: 11, y: 3, fill: u.ng ? WARN : "#fff" }, g);
    tx.textContent = u.ng ? `NG ${u.conf}` : "PASS";
    return { u, g };
  });
  const hoverBr = mk("g", { opacity: 0 }, gBr);
  mk("path", { d: "M-9,-5V-9H-5 M5,-9H9V-5 M9,5V9H5 M-5,9H-9V5", fill: "none", stroke: ACC, "stroke-width": 1.2 }, hoverBr);
  const hoverTx = mk("text", { class: "orb-tiny", x: 13, y: 3, fill: ACC }, hoverBr);

  /* ---------- step 1: documents on the knowledge ring ---------- */
  const DOCS = ["GRADE SPEC", "SETTLEMENT", "COLD STORAGE", "MACHINE CHECK", "PRIVACY", "INCIDENT"]
    .map((name, i) => {
      const g = mk("g", {}, gStruct);
      mk("rect", { x: -5, y: -5, width: 10, height: 10, fill: "none", stroke: "#fff", "stroke-width": 1 }, g);
      mk("rect", { x: -2, y: -2, width: 4, height: 4, fill: "#fff" }, g);
      const tx = mk("text", { class: "orb-label" }, gLabels);
      tx.textContent = name;
      return { a: -84 + i * 13, g, tx, name };
    });
  const qPath = mk("path", { fill: "none", stroke: "#fff", "stroke-width": 1, "stroke-dasharray": "1 4" }, gPaths);
  const cPath = mk("path", { fill: "none", stroke: LAV, "stroke-width": 1, "stroke-dasharray": "1 4" }, gPaths);
  const qTx = mk("text", { class: "orb-label" }, gLabels); qTx.textContent = "QUERY";
  const cTx = mk("text", { class: "orb-label", fill: LAV }, gLabels); cTx.textContent = "CITE [2]";

  /* ---------- step 2: data cloud on the platform ring ---------- */
  const MARKETS = ["GARAK", "GANGSEO", "GURI", "EOMGUNG", "BANYEO", "DAEGU", "GWANGJU"];
  const cloud = Array.from({ length: 170 }, () => ({
    a: -88 + Math.random() * 84, dr: (Math.random() - 0.5) * 46,
    base: 0.25 + Math.random() * 0.5,
    el: mk("rect", { width: 1.5, height: 1.5, fill: "#fff" }, gStruct),
  }));
  const markets = MARKETS.map((m, i) => {
    const tx = mk("text", { class: "orb-label" }, gLabels); tx.textContent = m;
    const tick = mk("rect", { width: 4, height: 4, fill: LAV }, gStruct);
    return { a: -82 + i * 12, tx, tick };
  });
  const gauge = mk("text", { class: "orb-tiny", fill: LAV }, gLabels); gauge.textContent = "100,000 ROWS · 5.8 MS";

  /* ---------- step 3: field operations ---------- */
  const drone = mk("g", {}, gStruct);
  mk("circle", { r: 9, fill: "#000", stroke: "#fff", "stroke-width": 1 }, drone);
  mk("path", { d: "M-3,-6 A7,7 0 0 1 -3,6 A5,5 0 0 0 -3,-6", fill: "#fff" }, drone);
  const droneTx = mk("text", { class: "orb-label" }, gLabels); droneTx.textContent = "VTOL · INSPECTION";
  const ground = mk("path", { d: "M-5,-4 L5,-4 L0,5 Z", fill: "none", stroke: "#fff", "stroke-width": 1 }, gStruct);
  const groundTx = mk("text", { class: "orb-label" }, gLabels); groundTx.textContent = "GROUND";
  const mPath = mk("path", { fill: "none", stroke: LAV, "stroke-width": 1, "stroke-dasharray": "4 4" }, gPaths);
  const rPath = mk("path", { fill: "none", stroke: "#fff", "stroke-width": 1, "stroke-dasharray": "1 4" }, gPaths);
  const appTx = mk("text", { class: "orb-label" }, gLabels); appTx.textContent = "APPROACH";
  const retTx = mk("text", { class: "orb-label", fill: LAV }, gLabels); retTx.textContent = "RETURN";
  const loopers = [0, 1].map(() => {
    const g = mk("g", {}, gStruct);
    mk("rect", { x: -3, y: -3, width: 6, height: 6, fill: "none", stroke: "#fff" }, g);
    mk("rect", { x: -1, y: -1, width: 2, height: 2, fill: "#fff" }, g);
    return g;
  });

  /* ---------- layout ---------- */
  const P = (a, r) => [cam.x + Math.cos(rad(a)) * r * cam.s, cam.y + Math.sin(rad(a)) * r * cam.s];
  const set = (el, o) => { for (const key in o) el.setAttribute(key, typeof o[key] === "number" ? +o[key].toFixed(2) : o[key]); };
  const vis = step => clamp(t - step + 1, 0, 1);
  // labels of an inner ring dim once the camera has moved past it
  const fade = step => 1 - 0.82 * clamp(t - step - 0.4, 0, 1);

  function resize() {
    const r = svg.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    mobile = W < 861;
    k = mobile ? W / 520 : Math.min(W / 1440, H / 900) * 1.0;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    stars.forEach(s => set(s.el, { x: s.fx * W, y: s.fy * H }));
  }

  function camera() {
    const keys = mobile ? KEYS_M : KEYS;
    const i = Math.min(2, Math.floor(t)), f = smooth(clamp(t - i, 0, 1));
    const A = keys[i], B = keys[i + 1];
    cam.x = (A.ex + (B.ex - A.ex) * f) * W;
    cam.y = (A.ey + (B.ey - A.ey) * f) * H;
    cam.s = (A.s + (B.s - A.s) * f) * k;
  }

  function quad(a, b, bend) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  const label = (el, p, dx = 10, dy = -8) => set(el, { x: p[0] + dx, y: p[1] + dy });

  function draw(time) {
    camera();
    // planet
    set(core, { cx: cam.x, cy: cam.y, r: 270 * cam.s });
    limb.forEach(L => set(L.el, { cx: cam.x, cy: cam.y, r: L.r * cam.s, "stroke-width": Math.max(0.6, L.sw * cam.s) }));
    // rings
    RINGS.forEach(R => {
      set(R.el, { cx: cam.x, cy: cam.y, r: R.r * cam.s, opacity: R.op * Math.max(0.15, vis(R.step)) });
      const p = P(R.at, R.r);
      set(R.txt, { x: p[0] + 6, y: p[1] - 8, opacity: 0.6 * vis(R.step) * Math.max(0.5, fade(R.step)) });
    });

    // units drift along the line
    const spin = time * 0.0016;
    units.forEach(u => {
      u.p = P(u.a + spin, 335);
      set(u.g, { transform: `translate(${u.p[0].toFixed(1)},${u.p[1].toFixed(1)}) rotate(${(u.a + spin + 90).toFixed(1)})` });
    });
    meshes.forEach((m, i) => {
      const a = units[i].p, b = units[i + 1].p;
      set(m, { x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    });
    // sensor cone from the surface to the flagged unit
    const src = P(units[6].a + spin - 4, 270), tgt = units[6].p;
    const nx = -(tgt[1] - src[1]), ny = tgt[0] - src[0], nl = Math.hypot(nx, ny) || 1;
    const spread = 14;
    set(coneEl, { d: `M${src[0]},${src[1]} L${tgt[0] + (nx / nl) * spread},${tgt[1] + (ny / nl) * spread} L${tgt[0] - (nx / nl) * spread},${tgt[1] - (ny / nl) * spread} Z`, opacity: 1 - vis(1) * 0.6 });
    tracked.forEach(({ u, g }) => set(g, { transform: `translate(${u.p[0].toFixed(1)},${u.p[1].toFixed(1)})`, opacity: fade(0) }));
    if (hover) {
      set(hoverBr, { transform: `translate(${hover.p[0].toFixed(1)},${hover.p[1].toFixed(1)})`, opacity: 1 });
      hoverTx.textContent = `UNIT ${hover.id} · ${hover.conf}`;
    } else set(hoverBr, { opacity: 0 });

    // documents + query/cite paths
    const v1 = vis(1);
    DOCS.forEach(d => {
      const p = P(d.a, 621);
      set(d.g, { transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${d.a + 90})`, opacity: v1 });
      label(d.tx, p, 10, -8); d.tx.setAttribute("opacity", (0.68 * v1 * fade(1)).toFixed(2));
    });
    const from = units[10].p, doc = P(DOCS[3].a, 621);
    set(qPath, { d: quad(from, doc, 0.22), opacity: v1, "stroke-dashoffset": (-time / 40) % 50 });
    set(cPath, { d: quad(doc, P(units[10].a + spin - 6, 335), 0.3), opacity: v1, "stroke-dashoffset": (-time / 40) % 50 });
    label(qTx, [(from[0] + doc[0]) / 2, (from[1] + doc[1]) / 2], -60, 0); qTx.setAttribute("opacity", (0.68 * v1 * fade(1)).toFixed(2));
    const cm = P(DOCS[3].a + 8, 470);
    label(cTx, cm, 8, 0); cTx.setAttribute("opacity", (v1 * fade(1)).toFixed(2));

    // data cloud
    const v2 = vis(2);
    cloud.forEach(c => { const p = P(c.a + spin * 0.3, 980 + c.dr); set(c.el, { x: p[0], y: p[1], opacity: c.base * v2 }); });
    markets.forEach(m => {
      const p = P(m.a, 980);
      set(m.tick, { x: p[0] - 2, y: p[1] - 2, opacity: v2 });
      label(m.tx, p, 8, -10); m.tx.setAttribute("opacity", (0.6 * v2 * fade(2)).toFixed(2));
    });
    label(gauge, P(-30, 980), 14, 22); gauge.setAttribute("opacity", (v2 * fade(2)).toFixed(2));

    // field ops
    const v3 = vis(3);
    const dp = P(-40 + Math.sin(time / 3000) * 1.5, 1580), gp = P(-14, 270);
    set(drone, { transform: `translate(${dp[0].toFixed(1)},${dp[1].toFixed(1)})`, opacity: v3 });
    label(droneTx, dp, 14, -10); droneTx.setAttribute("opacity", (0.68 * v3).toFixed(2));
    set(ground, { transform: `translate(${gp[0].toFixed(1)},${gp[1].toFixed(1)}) rotate(${-14 + 90})`, opacity: Math.max(v3, 0) });
    label(groundTx, gp, 10, 16); groundTx.setAttribute("opacity", (0.68 * v3).toFixed(2));
    set(mPath, { d: quad(gp, dp, -0.18), opacity: v3, "stroke-dashoffset": (-time / 50) % 80 });
    set(rPath, { d: quad(dp, gp, -0.32), opacity: v3, "stroke-dashoffset": (-time / 50) % 50 });
    const mid = P(-30, 1000);
    label(appTx, mid, 12, 0); appTx.setAttribute("opacity", (0.68 * v3).toFixed(2));
    label(retTx, P(-22, 1260), 12, 0); retTx.setAttribute("opacity", v3.toFixed(2));
    loopers.forEach((g, i) => {
      const p = P(-70 + i * 22 + spin * 0.6, 1580);
      set(g, { transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`, opacity: v3 });
    });
  }

  /* ---------- loop ---------- */
  let running = false, raf = 0;
  const loop = now => { draw(now); raf = running ? requestAnimationFrame(loop) : 0; };
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running && !raf) raf = requestAnimationFrame(loop);
  }).observe(svg);
  new ResizeObserver(() => { resize(); draw(performance.now()); }).observe(svg);

  svg.addEventListener("pointermove", e => {
    const r = svg.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 28;
    units.forEach(u => { if (!u.p) return; const d = Math.hypot(u.p[0] - x, u.p[1] - y); if (d < bd) { bd = d; best = u; } });
    hover = best;
  });
  svg.addEventListener("pointerleave", () => (hover = null));

  resize();
  return {
    setProgress(p) { t = clamp(p * 4 - 0.5, 0, 3); },
  };
};
