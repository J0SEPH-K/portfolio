// Orbital domain map. Behaviour reconstructed from Turion Space's mission
// diagram (studied with REA + source reading), re-implemented here:
//   - a sticky 100vh stage inside a tall track; progress = scrolled / (track - stage),
//     eased toward the target each frame (0.16, or 0.5 on big jumps)
//   - the camera moves only during the first 8% (log-scale zoom), then holds
//   - ten timed beats reveal tiers of the system; units orbit only while visible,
//     sensor cones "resolve" nearby dots, a transport flies a mission, and a
//     six-cell capability panel advances state per beat.
window.Orbit = (function () {
  const T = {
    camEnd: 0.08,
    focus: [0.05, 0.15], why: [0.15, 0.24], future: [0.24, 0.33], goal: [0.33, 0.45],
    hinge: [0.45, 0.53], first: [0.53, 0.62], geo: [0.62, 0.715], log: [0.715, 0.84],
    fleet: [0.84, 0.92], close: [0.92, 1],
    futIn: [0.225, 0.29], swap: [0.225, 0.295],
    z1: [0.345, 0.38], z2: [0.38, 0.415], z3: [0.415, 0.45],
    panelIn: [0.47, 0.51], flip: [0.5, 0.55],
  };
  const ORDER = ["focus", "why", "future", "goal", "hinge", "first", "geo", "log", "fleet", "close"];
  const RHO = { LEO: 1.24, GEO: 2.3, GY: 2.42, MOON: 3.25 };
  const RINGS = ["LEO", "GEO", "GY", "MOON"];
  // capability panel state per beat: 0 dotted (later), 1 dashed (building), 2 solid (live)
  const PANEL_STATES = [
    [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0],
    [2, 0, 0, 1, 1, 1], [2, 1, 0, 1, 1, 1], [2, 2, 1, 2, 1, 1], [2, 2, 2, 2, 2, 2], [2, 2, 2, 2, 2, 2],
  ];
  const STATE_CLASS = ["is-dotted", "is-dashed", "is-solid"];
  const PLANET = [
    { c: "#3B3FA8", w: 190, o: 0.06, d: 60 }, { c: "#5A55C8", w: 96, o: 0.12, d: 32 },
    { c: "#8C72E0", w: 40, o: 0.22, d: 14 }, { c: "#D4B4EC", w: 12, o: 0.5, d: 4 },
    { c: "#F2EAF7", w: 2.5, o: 0.95, d: 0 }, { c: "#6B5A8A", w: 40, o: 0.28, d: -20 },
    { c: "#2A2340", w: 90, o: 0.5, d: -70 },
  ];

  /* ---------- math ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (e, a, b) => clamp((e - a) / (b - a), 0, 1);
  const easeIO = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeOut = t => 1 - (1 - t) ** 3;
  const band = (e, a, b, r) => Math.min(ramp(e, a - r, a), 1 - ramp(e, b, b + r));
  const rad = d => (d * Math.PI) / 180;
  const lcg = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const fx = n => n.toFixed(1);

  function makeFleet() {
    const r = lcg(7), f = { vehicles: [], dots: [] };
    f.vehicles.push({ id: "d2", ring: "LEO", a: 78, speed: 1.3, tier: "today", cone: true, cue: true });
    f.vehicles.push({ id: "d1", ring: "LEO", a: 38, speed: 1.2, tier: "today", cone: true });
    f.vehicles.push({ id: "g1", ring: "GEO", a: 66, speed: 0.4, tier: "geo", cone: true, rpo: true });
    f.vehicles.push({ id: "g2", ring: "GEO", a: 24, speed: 0.4, tier: "geo", cone: true });
    for (let i = 0; i < 9; i++) f.vehicles.push({ id: "l" + i, ring: "LEO", a: 95 + i * 29 + r() * 10, speed: 1.1 + r() * 0.5, tier: "scale", cone: i % 3 === 0, order: i });
    for (let i = 0; i < 6; i++) f.vehicles.push({ id: "G" + i, ring: "GEO", a: 100 + i * 42 + r() * 12, speed: 0.36 + r() * 0.12, tier: "scale", cone: i % 2 === 0, order: i, hyper: i === 2 });
    for (let i = 0; i < 30; i++) f.dots.push({ ring: "LEO", a: r() * 360, speed: 0.9 + r() * 0.9 });
    for (let i = 0; i < 26; i++) f.dots.push({ ring: "GEO", a: r() * 360, speed: 0.3 + r() * 0.15 });
    for (let i = 0; i < 6; i++) f.dots.push({ ring: "GY", a: r() * 360, speed: 0.2 + r() * 0.08, dim: true });
    return f;
  }

  function mount(stage, track, cfg) {
    const NS = "http://www.w3.org/2000/svg";
    const svgEl = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
      parent && parent.appendChild(n);
      return n;
    };
    const div = (cls, parent, html) => {
      const n = document.createElement("div");
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      parent && parent.appendChild(n);
      return n;
    };
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const show = (el, on) => { el.style.display = on ? "" : "none"; return on; };
    const ACC = cfg.accent, LAV = cfg.lavender;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = reduce ? 0 : 1;

    stage.classList.add("ob");
    stage.style.setProperty("--ob-acc", ACC);
    stage.style.setProperty("--ob-lav", LAV);

    /* ---------- SVG scene ---------- */
    const svg = svgEl("svg", { class: "ob-svg", "aria-hidden": "true" }, stage);
    const defs = svgEl("defs", null, svg);
    const grad = (id, stops) => { const g = svgEl("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 0 }, defs); stops.forEach(s => svgEl("stop", s, g)); };
    grad("ob-cone", [{ offset: 0, "stop-color": ACC, "stop-opacity": 0.42 }, { offset: 1, "stop-color": ACC, "stop-opacity": 0 }]);
    grad("ob-hyper", [{ offset: 0, "stop-color": "#FFB18A", "stop-opacity": 0.45 }, { offset: 0.5, "stop-color": ACC, "stop-opacity": 0.25 }, { offset: 1, "stop-color": "#5EC8FF", "stop-opacity": 0 }]);
    const L = {};
    ["stars", "planet", "rings", "paths", "cones", "mesh", "dots", "structs", "vehicles", "brackets", "labels"].forEach(k => (L[k] = svgEl("g", { class: "ob-" + k }, svg)));

    const starRnd = lcg(21);
    const stars = Array.from({ length: 140 }, () => {
      const big = () => (starRnd() < 0.15 ? 2 : 1);
      const e = svgEl("rect", { width: big(), height: big(), fill: "#fff" }, L.stars);
      e.setAttribute("opacity", (0.12 + starRnd() * 0.5).toFixed(2));
      return { e, x: starRnd(), y: starRnd() };
    });

    const core = svgEl("circle", { fill: "#000" }, L.planet);
    const limb = PLANET.map(p => ({ ...p, e: svgEl("circle", { fill: "none", stroke: p.c, "stroke-width": p.w, "stroke-opacity": p.o }, L.planet) }));
    const ringEl = {}, ringTxt = {};
    RINGS.forEach(k => {
      ringEl[k] = svgEl("circle", { class: "ob-ring ob-ring-" + k, fill: "none" }, L.rings);
      ringTxt[k] = svgEl("text", { class: "ob-mono ob-ringlabel" }, L.labels);
      ringTxt[k].textContent = cfg.ringLabels[k];
    });

    const fleet = makeFleet();
    fleet.vehicles.forEach(v => {
      const g = svgEl("g", { class: "ob-veh" }, L.vehicles), s = v.ring === "GEO" ? 5 : 6;
      svgEl("line", { x1: -s * 1.9, y1: 0, x2: s * 1.9, y2: 0, stroke: ACC, "stroke-width": 1 }, g);
      svgEl("rect", { x: -s / 2, y: -s / 2, width: s, height: s, fill: ACC }, g);
      v.el = g;
      if (v.cone) v.coneEl = svgEl("path", { fill: v.hyper ? "url(#ob-hyper)" : "url(#ob-cone)" }, L.cones);
    });
    fleet.dots.forEach(d => (d.el = svgEl("rect", { width: 2, height: 2, fill: d.dim ? "#4a4a4a" : "#777" }, L.dots)));

    const brackets = Array.from({ length: 14 }, () => {
      const g = svgEl("g", { class: "ob-bracket" }, L.brackets), o = 7, k = 3;
      svgEl("path", { d: `M${-o},${-o + k}V${-o}H${-o + k} M${o - k},${-o}H${o}V${-o + k} M${o},${o - k}V${o}H${o - k} M${-o + k},${o}H${-o}V${o - k}`, fill: "none", stroke: LAV, "stroke-width": 1 }, g);
      const t = svgEl("text", { class: "ob-mono ob-tiny", x: 11, y: 3 }, g);
      t.textContent = cfg.labels.resolved;
      return { e: g, t };
    });

    // structures
    const S = {};
    const struct = cls => svgEl("g", { class: "ob-struct " + cls }, L.structs);
    S.factory = struct("factory");
    svgEl("rect", { x: -5, y: -5, width: 10, height: 10, fill: "none", stroke: "#fff" }, S.factory);
    svgEl("rect", { x: -2, y: -2, width: 4, height: 4, fill: "#fff" }, S.factory);
    S.ground = struct("ground");
    svgEl("path", { d: "M-5,4 L0,-5 L5,4 Z", fill: "none", stroke: "#fff" }, S.ground);
    const depot = () => { const g = struct("depot"); svgEl("polygon", { points: "0,-7 6,-3.5 6,3.5 0,7 -6,3.5 -6,-3.5", fill: "none", stroke: LAV }, g); svgEl("rect", { x: -2, y: -2, width: 4, height: 4, fill: LAV }, g); return g; };
    S.depotL = depot(); S.depotG = depot();
    S.shipyard = struct("shipyard");
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) svgEl("rect", { x: -9 + c * 7, y: -9 + r * 7, width: 4, height: 4, fill: "none", stroke: LAV }, S.shipyard);
    S.moon = struct("moon");
    svgEl("circle", { r: 11, fill: "#0b0b0b", stroke: "#9a9a9a" }, S.moon);
    svgEl("path", { d: "M0,-11 A11,11 0 0 1 0,11 A6,11 0 0 0 0,-11 Z", fill: "#9a9a9a", opacity: 0.35 }, S.moon);
    S.asteroid = struct("asteroid");
    svgEl("path", { d: "M-12,-4 L-6,-12 L4,-13 L12,-6 L13,3 L7,11 L-3,12 L-11,6 Z", fill: "none", stroke: "#9a9a9a" }, S.asteroid);
    S.refinery = struct("refinery");
    svgEl("circle", { r: 12, fill: "none", stroke: ACC, "stroke-width": 1.5 }, S.refinery);
    svgEl("circle", { r: 6, fill: "none", stroke: ACC }, S.refinery);
    svgEl("line", { x1: 0, y1: -12, x2: 0, y2: -6, stroke: ACC }, S.refinery);
    svgEl("line", { x1: 0, y1: 6, x2: 0, y2: 12, stroke: ACC }, S.refinery);
    S.otv = struct("otv");
    svgEl("rect", { x: -4, y: -7, width: 8, height: 14, fill: "none", stroke: LAV }, S.otv);
    svgEl("rect", { x: -4, y: -7, width: 8, height: 5, fill: LAV }, S.otv);
    S.otvFlame = svgEl("rect", { x: -1.5, y: 7, width: 3, height: 6, fill: "#FFB18A" }, S.otv);
    S.otvBuild = struct("otvbuild");
    svgEl("rect", { x: -4, y: -7, width: 8, height: 14, fill: "none", stroke: LAV, "stroke-dasharray": "2 2" }, S.otvBuild);
    S.sv = struct("sv");
    svgEl("line", { x1: -10, y1: 0, x2: 10, y2: 0, stroke: ACC }, S.sv);
    S.svBody = svgEl("rect", { x: -2.5, y: -2.5, width: 5, height: 5, fill: "none", stroke: ACC, "stroke-dasharray": "2 2" }, S.sv);
    S.svCone = svgEl("path", { fill: "url(#ob-cone)" }, L.cones);
    S.gauge = struct("gauge");
    svgEl("rect", { x: -22, y: -3, width: 44, height: 6, fill: "none", stroke: LAV }, S.gauge);
    S.gaugeFill = svgEl("rect", { x: -21, y: -2, width: 0, height: 4, fill: LAV }, S.gauge);
    const gaugeTxt = svgEl("text", { class: "ob-mono ob-tiny", x: 0, y: 16, "text-anchor": "middle" }, S.gauge);
    gaugeTxt.textContent = cfg.labels.gauge;

    const loopers = [0, 1].map(i => {
      const g = struct("looper");
      svgEl("rect", { x: -3, y: -5, width: 6, height: 10, fill: "none", stroke: LAV }, g);
      svgEl("rect", { x: -3, y: -5, width: 6, height: 3.5, fill: LAV }, g);
      return { e: g, phase: i * 0.5, a0: 110 + i * 30, a1: 85 + i * 30 };
    });
    const lunars = [0, 1].map(i => { const g = struct("lunar"); svgEl("rect", { x: -3, y: -3, width: 6, height: 6, fill: "none", stroke: LAV }, g); return { e: g, phase: i * 0.5 }; });
    const pkt = (fill, size, n) => Array.from({ length: n }, (_, i) => ({ e: svgEl("rect", { width: size, height: size, fill }, L.structs), phase: i / n }));
    const outPk = pkt("#bdbdbd", 3, 5), retPk = pkt(LAV, 3, 5), launchPk = pkt(ACC, 4, 3);

    const P = {};
    const path = cls => svgEl("path", { class: "ob-path " + cls }, L.paths);
    P.transfer = [path("ob-dash"), path("ob-dash")];
    P.plan = path("ob-dash ob-plan");
    P.mission = path("ob-mission");
    P.disposal = path("ob-dot");
    P.corridor = path("ob-dot");
    P.outbound = path("ob-dot");
    P.ret = path("ob-dot ob-ret");
    P.launch = path("ob-dash");
    P.groundLink = path("ob-link");
    P.rpo = path("ob-dot");
    const mesh = Array.from({ length: 24 }, () => svgEl("line", { class: "ob-meshline" }, L.mesh));

    const label = (txt, extra) => { const t = svgEl("text", { class: "ob-mono ob-label " + (extra || "") }, L.labels); t.textContent = txt; return t; };
    const LB = {};
    for (const k in cfg.labels.structs) LB[k] = label(cfg.labels.structs[k], k === "ret" ? "ob-accent" : "");
    const tags = [0, 1, 2].map(i => {
      const t = svgEl("text", { class: "ob-mono ob-label ob-tag" }, L.labels);
      svgEl("tspan", null, t).textContent = String(cfg.beats[0].lines[i] || "");
      svgEl("tspan", { class: "ob-tagstatus" }, t).textContent = cfg.focusStatus[i] ? " · " + String(cfg.focusStatus[i]) : "";
      return t;
    });

    /* ---------- HTML overlay ---------- */
    const ui = div("ob-ui", stage);
    const head = div("ob-head", ui);
    div("ob-kicker ob-mono", head, `<span class="ob-sq"></span><span>${esc(cfg.sectionNumber)}</span><span class="ob-sq ob-sq2"></span><span>${esc(cfg.sectionName)}</span>`);
    const readout = div("ob-readout ob-mono", head);
    const texts = div("ob-texts", ui);
    const figBeats = [];
    const beatEls = cfg.beats.map(b => {
      const el = div("ob-beat", texts);
      div("ob-beatkicker ob-mono", el, `<span class="ob-sq"></span>${esc(b.kicker)}`);
      div("ob-headline", el, esc(b.headline));
      if (b.caption) div("ob-caption", el, esc(b.caption));
      if (b.lines) { const ls = div("ob-lines ob-mono", el); b.lines.forEach(l => div("ob-line", ls, esc(l))); el._lines = [...ls.children]; }
      if (b.note) div("ob-caption ob-note", el, esc(b.note));
      if (b.link) div("ob-cta", el, `<a class="pill" href="${b.link.href}">${esc(b.link.label)}</a>`);
      if (b.figure) figBeats.push(el);
      return el;
    });
    // comparison figure (two circles that swap scale)
    let fig = null, figSvg, bigC, smallC, smallHalo, smallRings, bigTxt, smallTxt, figScale = 1;
    if (figBeats.length) {
      fig = div("ob-figure", texts);
      figSvg = svgEl("svg", { class: "ob-figsvg", "aria-hidden": "true" }, fig);
      smallHalo = svgEl("circle", { fill: ACC, "fill-opacity": 0.1 }, figSvg);
      smallC = svgEl("circle", { fill: ACC, "fill-opacity": 0.16, stroke: ACC, "stroke-width": 1.25 }, figSvg);
      smallRings = [0, 1].map(() => svgEl("circle", { fill: "none", stroke: ACC, "stroke-opacity": 0.4 }, figSvg));
      bigC = svgEl("circle", { fill: "#fff", "fill-opacity": 0.04, stroke: "#fff", "stroke-opacity": 0.6 }, figSvg);
      bigTxt = svgEl("text", { class: "ob-mono ob-figlabel", "text-anchor": "middle" }, figSvg);
      bigTxt.textContent = cfg.figureLabels[0];
      smallTxt = svgEl("text", { class: "ob-mono ob-figlabel ob-accent", "text-anchor": "middle" }, figSvg);
      smallTxt.textContent = cfg.figureLabels[1];
    }
    const panel = div("ob-panel", ui);
    const ph = div("ob-panelhead ob-mono", panel);
    const panelTitle = div("ob-paneltitle", ph, esc(cfg.panelTitle));
    const tickWrap = div("ob-panelsoft", ph, `<span class="ob-ticks"></span><span>${esc(cfg.softwareLabel)}</span>`).querySelector(".ob-ticks");
    const ticks = Array.from({ length: 20 }, () => { const i = document.createElement("i"); tickWrap.appendChild(i); return i; });
    const cells = div("ob-cells", panel);
    const cellEls = cfg.panel.map((name, i) => div("ob-cell ob-mono", cells, `<i class="ob-state"></i><span class="ob-cellnum">0${i + 1}</span><span class="ob-cellname">${esc(name)}</span>`));
    const scaleNote = div("ob-scalenote ob-mono", ui, esc(cfg.scaleNote));

    /* ---------- layout ---------- */
    let W = 0, H = 0, wide = true, base = { z: 1, ex: 0, ey: 0 }, lay = {}, arcs = {};
    function layout() {
      W = stage.clientWidth || innerWidth; H = stage.clientHeight || innerHeight;
      wide = W / H > 1.05;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      if (wide) {
        base = { z: 0.3 * H, ex: 0.1 * W, ey: 0.98 * H };
        lay = { factory: 62, ground: 36, depotL: 44, depotG: 24, ship: 50, shipRho: 2.62, moon: 62, ast: 50, astRho: 3.5, labels: { LEO: 84, GEO: 84, GY: 70, MOON: 50 }, panelTop: H - 112 };
      } else {
        base = { z: 0.15 * H, ex: -0.1 * W, ey: 0.86 * H };
        lay = { factory: 66, ground: 30, depotL: 52, depotG: 28, ship: 50, shipRho: 2.62, moon: 40, ast: 55, astRho: 3.3, labels: { LEO: 80, GEO: 80, GY: 64, MOON: 58 }, panelTop: H - 150 };
      }
      // the longest on-screen arc of each ring; orbiting angles are wrapped into it
      arcs = {};
      RINGS.forEach(k => {
        const rr = RHO[k] * base.z;
        let best = null, run = null;
        for (let a = 0; a <= 360; a += 2) {
          const x = base.ex + rr * Math.cos(rad(a)), y = base.ey - rr * Math.sin(rad(a));
          const vis = x > -10 && x < W + 10 && y > 40 && y < lay.panelTop + 20;
          if (vis) run ? (run[1] = a) : (run = [a, a]);
          if ((!vis || a === 360) && run) { if (!best || run[1] - run[0] > best[1] - best[0]) best = run; run = null; }
        }
        arcs[k] = best ? [best[0] - 5, best[1] + 5] : [0, 360];
      });
      stars.forEach(s => { s.e.setAttribute("x", Math.round(s.x * W)); s.e.setAttribute("y", Math.round(s.y * H)); });
      if (fig) {
        let h = 0;
        figBeats.forEach(b => { const d = b.style.display, v = b.style.visibility; b.style.visibility = "hidden"; b.style.display = ""; h = Math.max(h, b.offsetHeight); b.style.display = d; b.style.visibility = v; });
        fig.style.top = Math.round(h + (wide ? 16 : 14)) + "px";
        const w = fig.clientWidth || 380;
        figScale = w / 380;
        figSvg.setAttribute("width", w); figSvg.setAttribute("height", Math.round(246 * figScale));
        figSvg.setAttribute("viewBox", `0 0 ${w} ${Math.round(246 * figScale)}`);
      }
    }
    const wrap = (ring, a) => { const r = arcs[ring]; if (!r) return a; const span = r[1] - r[0]; return span <= 0 || span >= 360 ? a : r[0] + ((((a - r[0]) % span) + span) % span); };
    const gap = (ring, a, b) => { const r = arcs[ring]; let span = r ? r[1] - r[0] : 360; if (span <= 0 || span >= 360) span = 360; return (((b - a) % span) + span) % span; };

    // camera: zoom in log space from far above, settle by camEnd, then hold
    let cam;
    function camera(e) {
      const f = easeIO(ramp(e, 0, T.camEnd));
      const r0 = base.z * 4.2, x0 = base.ex + base.z * 1.3, top0 = -0.5 * H;
      const z = Math.exp(lerp(Math.log(r0), Math.log(base.z), f));
      return { ex: lerp(x0, base.ex, f), ey: lerp(top0, base.ey - base.z, f) + z, z, f };
    }
    const at = (rho, ang) => [cam.ex + rho * cam.z * Math.cos(rad(ang)), cam.ey - rho * cam.z * Math.sin(rad(ang))];

    /* ---------- reveal curves ---------- */
    function tier(e, t) {
      switch (t) {
        case "today": return 1;
        case "geo": return easeOut(ramp(e, T.geo[0], T.geo[0] + 0.05));
        case "logistics": return easeOut(ramp(e, T.log[0], T.log[0] + 0.04));
        case "scale": return easeOut(ramp(e, T.fleet[0], T.fleet[0] + 0.06));
        case "resources": return easeOut(ramp(e, T.close[0], T.close[0] + 0.07));
      }
      return 0;
    }
    // the "future potential" preview during the why→future swap, gone by the flip
    const preview = (e, n) => { const d = n ? (n - 1) * 0.02 : 0; return easeOut(ramp(e, T.futIn[0] + d, T.futIn[1] + d)) * (1 - ramp(e, T.flip[0], T.flip[1])); };
    // during "goal", spotlight one of three zones at a time; after the hinge, dim zones 2-3
    function zone(e, n) {
      let r = 1;
      const g = band(e, T.z1[0], T.z3[1], 0.02);
      if (g > 0) { const w = n === 1 ? T.z1 : n === 2 ? T.z2 : T.z3; r = lerp(1, lerp(0.45, 1, band(e, w[0], w[1], 0.015)), g); }
      if (n !== 1) r = Math.min(r, lerp(1, 0.4, ramp(e, T.hinge[0] + 0.012, T.hinge[0] + 0.045)));
      return r;
    }
    const GHOST = 0.14;
    const alphaOf = (e, t, n) => Math.max(preview(e, n) * zone(e, n), ramp(e, T.flip[0], T.flip[1]) * GHOST, tier(e, t));
    const motionOf = (e, t) => Math.max(preview(e), tier(e, t));
    const beatAt = e => { let r = 0; ORDER.forEach((k, i) => { if (e >= T[k][0]) r = i; }); return r; };
    const beatRange = i => (i === ORDER.length - 1 ? [T[ORDER[i]][0], 1.2] : T[ORDER[i]]);
    beatEls.forEach((el, i) => {
      if (!el._lines) return;
      if (ORDER[i] === "goal") el._cfg = { wins: [T.z1, T.z2, [T.z3[0], T.z3[1] + 0.05]], hold: false };
      else { const r = beatRange(i); el._cfg = { wins: el._lines.map((_, k) => [r[0] + 0.025 + k * 0.018, r[0] + 0.04 + k * 0.018]), hold: true }; }
    });

    const place = (el, p, a, extra) => { const on = show(el, a > 0.015); if (on) { el.setAttribute("transform", `translate(${fx(p[0])},${fx(p[1])})${extra || ""}`); el.style.opacity = a.toFixed(3); } return on; };
    const text = (el, p, a, anchor) => { if (show(el, a > 0.03)) { el.setAttribute("x", fx(p[0])); el.setAttribute("y", fx(p[1])); el.style.opacity = (a * 0.85).toFixed(3); el.setAttribute("text-anchor", anchor || "start"); } };
    const arcPath = (a0, a1, r0, r1) => { let d = ""; for (let i = 0; i <= 36; i++) { const s = i / 36, p = at(lerp(r0, r1, easeIO(s)), lerp(a0, a1, s)); d += (i ? " L" : "M") + fx(p[0]) + "," + fx(p[1]); } return d; };
    const quad = (p0, p1, bend) => {
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
      const c = [mx - (dy / l) * bend, my + (dx / l) * bend];
      return { d: `M${fx(p0[0])},${fx(p0[1])} Q${fx(c[0])},${fx(c[1])} ${fx(p1[0])},${fx(p1[1])}`, c, p0, p1 };
    };
    const onQuad = (q, t) => { const n = 1 - t; return [n * n * q.p0[0] + 2 * n * t * q.c[0] + t * t * q.p1[0], n * n * q.p0[1] + 2 * n * t * q.c[1] + t * t * q.p1[1]]; };
    function tagAt(el, p, ang, a) {
      if (!show(el, a > 0.03)) return;
      const x = Math.max(p[0] + 19 * Math.cos(rad(ang)), 8), y = p[1] - 19 * Math.sin(rad(ang)) + 3;
      el.setAttribute("x", fx(x)); el.setAttribute("y", fx(y)); el.style.opacity = a.toFixed(3);
    }
    const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

    /* ---------- frame ---------- */
    let clock = 0, spin = 0, panelKey = "";
    function render(e, dt) {
      cam = camera(e);
      const settling = e < T.camEnd + 0.01, z = cam.z, F = cam.f;
      clock += dt;
      const focusOut = 1 - ramp(e, T.focus[1] - 0.02, T.focus[1] + 0.005);
      const tag0 = Math.min(ramp(e, T.focus[0] + 0.03, T.focus[0] + 0.05), focusOut) * F;
      const tag1 = Math.min(ramp(e, T.focus[0] + 0.048, T.focus[0] + 0.068), focusOut) * F;
      const tag2 = Math.min(ramp(e, T.focus[0] + 0.066, T.focus[0] + 0.086), focusOut) * F;
      const figA = fig ? Math.min(ramp(e, T.why[0] + 0.015, T.why[0] + 0.05), 1 - ramp(e, T.future[1] - 0.035, T.future[1] - 0.005)) : 0;

      // planet + rings
      core.setAttribute("cx", cam.ex); core.setAttribute("cy", cam.ey); core.setAttribute("r", z);
      limb.forEach(p => { p.e.setAttribute("cx", cam.ex); p.e.setAttribute("cy", cam.ey); p.e.setAttribute("r", Math.max(1, z + p.d)); });
      const ringFade = 0.25 + 0.75 * ramp(e, 0.02, T.camEnd + 0.04);
      const leoRho = lerp(cfg.cueRho, RHO.LEO, F);
      RINGS.forEach(k => {
        const rho = k === "LEO" ? leoRho : RHO[k], el = ringEl[k];
        el.setAttribute("cx", cam.ex); el.setAttribute("cy", cam.ey); el.setAttribute("r", rho * z);
        const a = k === "LEO" ? 1 : ramp(e, 0.03, T.camEnd) * (k === "GEO" ? 1 : 0.7);
        el.style.opacity = (a * (k === "LEO" ? 1 : ringFade)).toFixed(3);
        if (k === "LEO") { el.style.stroke = F < 1 ? ACC : ""; el.style.strokeOpacity = F < 1 ? (0.55 - 0.3 * F).toFixed(3) : ""; }
        const ang = lay.labels[k], p = at(rho + 10 / z, ang), t = ringTxt[k];
        t.setAttribute("x", p[0]); t.setAttribute("y", p[1]); t.setAttribute("text-anchor", ang > 70 ? "middle" : "start");
        let o = ramp(e, T.camEnd - 0.02, T.camEnd + 0.03) * (0.6 * ringFade) * (k === "GY" ? 0.6 : 1);
        if (k === "LEO") o *= 1 - tag0;
        if (!wide) o *= 1 - 0.85 * figA;
        t.style.opacity = o.toFixed(3);
      });

      // vehicles
      let live = 0;
      const byRing = { LEO: [], GEO: [] };
      const fleetIn = ramp(F, 0.55, 1);
      fleet.vehicles.forEach(v => {
        let a, m;
        if (v.tier === "scale") {
          const o = v.order / 9, span = (T.fleet[1] - T.fleet[0]) * 0.8;
          const own = easeOut(ramp(e, T.fleet[0] + o * span, T.fleet[0] + 0.03 + o * span));
          a = Math.max(preview(e, 1) * zone(e, 1), ramp(e, T.flip[0], T.flip[1]) * GHOST, own);
          m = Math.max(preview(e), own);
        } else {
          a = alphaOf(e, v.tier, 1); m = motionOf(e, v.tier);
          if (v.tier === "today" && !v.cue) a *= fleetIn;
        }
        let rho = RHO[v.ring];
        if (v.cue) {
          const cueAng = 100 + ((clock * 1.3) % 50);
          v.a += v.speed * dt * motion * (m > 0.05 ? 1 : 0);
          v.shown = lerp(cueAng, wrap(v.ring, v.a), F);
          rho = leoRho; a = Math.max(a, 1 - F);
        } else {
          v.a += v.speed * dt * motion * m;
          v.shown = wrap(v.ring, v.a);
        }
        const p = at(rho, v.shown), on = a > 0.015;
        show(v.el, on);
        if (on) { v.el.setAttribute("transform", `translate(${fx(p[0])},${fx(p[1])}) rotate(${fx(-v.shown)})`); v.el.style.opacity = a.toFixed(3); }
        v.alpha = a; v.pt = p;
        if (a > 0.5 && !v.cue) live++;
        if (v.cue && F > 0.9 && a > 0.5) live++;
        if (a > 0.3) byRing[v.ring].push(v);
        if (v.coneEl) {
          const ca = a * (e < T.camEnd ? F : 1), on2 = ca > 0.03 && (!v.cue || F > 0.5);
          if (show(v.coneEl, on2)) {
            const len = (v.ring === "GEO" ? 0.42 : 0.3) * z, w = len * Math.tan(rad(13));
            v.coneEl.setAttribute("d", `M0,0 L${fx(len)},${fx(-w)} L${fx(len)},${fx(w)}Z`);
            v.coneEl.setAttribute("transform", `translate(${fx(p[0])},${fx(p[1])}) rotate(${fx(-(v.shown + 90))})`);
            v.coneEl.style.opacity = (ca * (v.hyper ? 1 : 0.9)).toFixed(3);
            v.coneLen = len;
          }
        }
      });

      // dots: drift, and get "resolved" when inside a unit's sensor cone
      let used = 0;
      const firstCatch = {};
      fleet.dots.forEach(d => {
        const rho = RHO[d.ring];
        const m = Math.max(preview(e), tier(e, d.ring === "LEO" ? "today" : d.ring === "GEO" ? "geo" : "logistics"));
        d.a += d.speed * dt * motion * Math.max(m, 0.3);
        let a = d.ring === "GY" ? Math.max(alphaOf(e, "logistics", 2), 0.35) : d.ring === "LEO" ? Math.max(alphaOf(e, "today", 1), 0.45) : Math.max(alphaOf(e, "geo", 1), 0.35);
        if (F < 1) a *= F;
        d.shown = wrap(d.ring, d.a);
        const p = at(rho, d.shown);
        d.el.setAttribute("x", fx(p[0] - 1)); d.el.setAttribute("y", fx(p[1] - 1));
        let caught = 0;
        const list = byRing[d.ring];
        if (list) for (const v of list) {
          if (!v.coneEl || v.alpha < 0.5) continue;
          const g = gap(d.ring, v.shown, d.shown), reach = ((v.coneLen || 0) / (rho * z)) * 180 / Math.PI;
          if (g > 1.5 && g < reach) { caught = Math.max(caught, v.alpha); if (!firstCatch[v.id] && (v.tier === "today" || v.tier === "geo")) firstCatch[v.id] = d; break; }
        }
        d.el.style.opacity = Math.min(1, a + caught * 0.6).toFixed(3);
        d.el.setAttribute("fill", caught > 0.5 ? LAV : d.dim ? "#4a4a4a" : "#8a8a8a");
        if (caught > 0.5 && used < brackets.length) {
          const b = brackets[used++];
          b.e.style.display = ""; b.e.setAttribute("transform", `translate(${fx(p[0])},${fx(p[1])})`); b.e.style.opacity = caught.toFixed(3);
          const labelled = Object.values(firstCatch).includes(d);
          b.t.style.display = labelled && e > T.camEnd && tag0 < 0.1 ? "" : "none";
        }
      });
      for (let i = used; i < brackets.length; i++) brackets[i].e.style.display = "none";

      // mesh between nearby units on the same ring
      const meshA = Math.max(preview(e, 1) * zone(e, 1) * 0.6, tier(e, "scale"));
      let mi = 0;
      if (meshA > 0.02) ["LEO", "GEO"].forEach(k => {
        const l = byRing[k];
        for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
          if (Math.abs(l[i].shown - l[j].shown) < 28 && mi < mesh.length) {
            const ln = mesh[mi++];
            ln.style.display = ""; ln.setAttribute("x1", fx(l[i].pt[0])); ln.setAttribute("y1", fx(l[i].pt[1])); ln.setAttribute("x2", fx(l[j].pt[0])); ln.setAttribute("y2", fx(l[j].pt[1]));
            ln.style.opacity = (meshA * Math.min(l[i].alpha, l[j].alpha) * 0.5).toFixed(3);
          }
        }
      });
      for (let i = mi; i < mesh.length; i++) mesh[i].style.display = "none";

      // ground station + factory + uplink
      const todayA = alphaOf(e, "today", 1) * F;
      const gp = at(1, lay.ground);
      place(S.ground, gp, todayA, ` rotate(${fx(90 - lay.ground)})`);
      text(LB.ground, [gp[0] + 10, gp[1] + 4], todayA * 0.8);
      const fp = at(1, lay.factory), facA = Math.max(alphaOf(e, "today", 2), alphaOf(e, "scale", 2)) * F;
      place(S.factory, fp, facA, ` rotate(${fx(90 - lay.factory)})`);
      text(LB.factory, [fp[0] - 10, fp[1] - 10], facA * 0.8, "end");
      let lead = null, best = 0;
      byRing.LEO.forEach(v => { if (v.tier === "today" && v.alpha > best) { best = v.alpha; lead = v; } });
      if (lead && todayA > 0.05 && lead.pt) {
        P.groundLink.style.display = "";
        P.groundLink.setAttribute("d", `M${fx(gp[0])},${fx(gp[1])} L${fx(lead.pt[0])},${fx(lead.pt[1])}`);
        P.groundLink.style.opacity = (todayA * 0.6).toFixed(3);
        P.groundLink.style.strokeDashoffset = (-(clock * 40 * motion) % 100).toFixed(1);
      } else P.groundLink.style.display = "none";

      // the three focus tags beside the lead unit, plus the planned transfer arc
      const aPlan = wide ? 70 : 72, aGeoSlot = wide ? 40 : 56;
      const buildA = Math.max(band(e, T.focus[0] + 0.03, T.future[0] - 0.015, 0.03), band(e, T.flip[1], T.log[0] + 0.01, 0.03)) * F * (1 - tier(e, "logistics"));
      const planA = band(e, T.focus[0] + 0.045, T.future[0] - 0.02, 0.03) * F;
      place(S.otvBuild, at(RHO.LEO, aPlan), buildA, ` rotate(${fx(-aPlan + 180)})`);
      if (show(P.plan, planA > 0.02)) {
        if (settling || !P.plan._set) { P.plan.setAttribute("d", arcPath(aPlan, aGeoSlot, RHO.LEO, RHO.GEO)); P.plan._set = !settling; }
        P.plan.style.opacity = planA.toFixed(3);
      }
      const cueV = fleet.vehicles[0];
      if (cueV && cueV.pt) {
        tagAt(tags[0], cueV.pt, cueV.shown, tag0 * Math.min(1, cueV.alpha * 2));
        tagAt(tags[1], cueV.pt, cueV.shown, tag1 * Math.min(1, cueV.alpha * 2));
        if (tag1 > 0.03) tags[1].setAttribute("y", fx(parseFloat(tags[1].getAttribute("y")) + 13));
      }
      const t2 = tag2 * Math.min(1, planA * 3);
      if (show(tags[2], t2 > 0.03)) {
        const p = at(lerp(RHO.LEO, RHO.GEO, 0.5), lerp(aPlan, aGeoSlot, 0.5));
        tags[2].setAttribute("x", fx(Math.max(8, p[0] + 6))); tags[2].setAttribute("y", fx(p[1] - 10)); tags[2].style.opacity = t2.toFixed(3);
      }

      // depots + transfer loopers
      const depA = alphaOf(e, "logistics", 2) * F;
      const dl = at(RHO.LEO, lay.depotL), dg = at(RHO.GEO, lay.depotG);
      place(S.depotL, dl, depA); text(LB.depotL, [dl[0] + 10, dl[1] + 4], depA * 0.8);
      place(S.depotG, dg, depA); text(LB.depotG, [dg[0] + 10, dg[1] + 4], depA * 0.8);
      const loopA = Math.max(preview(e, 2) * zone(e, 2), tier(e, "resources"), ramp(e, T.flip[0], T.flip[1]) * GHOST) * F;
      loopers.forEach((lp, i) => {
        const pth = P.transfer[i], a0 = wide ? lp.a0 - 30 : lp.a0 - 20, a1 = wide ? lp.a1 - 30 : lp.a1 - 10;
        if (settling || !pth._set) { pth.setAttribute("d", arcPath(a0, a1, RHO.LEO, RHO.GEO)); pth._set = !settling; }
        pth.style.opacity = (loopA * 0.9).toFixed(3); show(pth, loopA > 0.015);
        let u = (clock * 0.06 * motion + lp.phase) % 1;
        if (Math.max(preview(e), tier(e, "resources")) < 0.05) u = lp.phase;
        const p = at(lerp(RHO.LEO, RHO.GEO, easeIO(u)), lerp(a0, a1, u));
        place(lp.e, p, loopA, ` rotate(${fx(-lerp(a0, a1, u) + 180)})`);
      });

      // logistics mission: transport climbs to the slot, refuels, then retires to the archive ring
      const logA = tier(e, "logistics") * F, ct = ramp(e, T.log[0] + 0.02, T.log[1] - 0.01);
      if (logA > 0.02 && e < T.close[0] + 0.05) {
        const U = logA * (1 - ramp(e, T.close[0], T.close[0] + 0.05));
        if (settling || !P.mission._set) { P.mission.setAttribute("d", arcPath(aPlan, aGeoSlot, RHO.LEO, RHO.GEO)); P.mission._set = !settling; }
        show(P.mission, true); P.mission.style.opacity = (U * 0.9).toFixed(3);
        const climb = clamp(ct / 0.42, 0, 1), fuel = ramp(ct, 0.42, 0.6), look = ramp(ct, 0.62, 0.72), retire = ramp(ct, 0.74, 1);
        let rr, ang;
        if (retire > 0) { rr = lerp(RHO.GEO, RHO.GY, easeIO(retire)); ang = aGeoSlot - 3 - 10 * retire; }
        else if (look > 0) { rr = RHO.GEO; ang = aGeoSlot - 3 * look; }
        else { rr = lerp(RHO.LEO, RHO.GEO, easeIO(climb)); ang = lerp(aPlan, aGeoSlot, climb); }
        const op = at(rr, ang), sp = at(RHO.GEO, aGeoSlot);
        place(S.otv, op, U, ` rotate(${fx(-ang + 180)})`);
        S.otvFlame.style.opacity = (climb < 1 && climb > 0.02 && fuel === 0) || (retire > 0 && retire < 0.6) ? (0.6 + 0.4 * Math.sin(clock * 30)).toFixed(2) : "0";
        text(LB.otv, [op[0] + 12, op[1] + 4], U * (climb < 1 ? 1 : 0) * 0.9);
        place(S.sv, sp, U, ` rotate(${fx(-aGeoSlot)})`);
        S.svBody.setAttribute("fill", fuel > 0.99 ? ACC : "none");
        S.svBody.setAttribute("stroke-dasharray", fuel > 0.99 ? "" : "2 2");
        place(S.gauge, [sp[0], sp[1] - 34], band(ct, 0.4, 0.66, 0.05) * U);
        S.gaugeFill.setAttribute("width", (42 * fuel).toFixed(1));
        text(LB.sv, [sp[0] + 14, sp[1] + 4], U * (fuel > 0 && look < 1 ? 1 : 0) * 0.9);
        const coneA = U * ramp(ct, 0.62, 0.75);
        if (show(S.svCone, coneA > 0.02)) {
          const len = 0.42 * z, w = len * Math.tan(rad(13));
          S.svCone.setAttribute("d", `M0,0 L${fx(len)},${fx(-w)} L${fx(len)},${fx(w)}Z`);
          S.svCone.setAttribute("transform", `translate(${fx(sp[0])},${fx(sp[1])}) rotate(${fx(-(aGeoSlot + 90))})`);
          S.svCone.style.opacity = (coneA * 0.9).toFixed(3);
        }
        const dispA = U * ramp(ct, 0.72, 0.8);
        if (show(P.disposal, dispA > 0.02)) {
          let d = "";
          for (let i = 0; i <= 16; i++) { const s = i / 16, p = at(lerp(RHO.GEO, RHO.GY, easeIO(s)), aGeoSlot - 3 - 10 * s); d += (i ? " L" : "M") + fx(p[0]) + "," + fx(p[1]); }
          P.disposal.setAttribute("d", d); P.disposal.style.opacity = (dispA * 0.8).toFixed(3);
        }
      } else {
        [P.mission, S.otv, S.sv, S.gauge, S.svCone, P.disposal, LB.otv, LB.sv].forEach(el => (el.style.display = "none"));
      }

      // rendezvous: the flagged GEO unit closes on its nearest neighbour
      const rpoV = fleet.vehicles.find(v => v.rpo);
      const closing = ramp(e, T.geo[0] + 0.03, T.geo[1] - 0.02);
      const rpoA = tier(e, "geo") * F * band(e, T.geo[0] + 0.02, T.geo[1], 0.03);
      let rpoDone = false;
      if (rpoV && rpoA > 0.03) {
        let target = null, nearest = 999;
        fleet.dots.forEach(d => { if (d.ring !== "GEO") return; const g = gap("GEO", rpoV.shown, d.shown); if (g > 4 && g < nearest) { nearest = g; target = d; } });
        if (target) {
          const tp = at(RHO.GEO, target.shown);
          P.rpo.setAttribute("d", `M${fx(rpoV.pt[0])},${fx(rpoV.pt[1])} L${fx(tp[0])},${fx(tp[1])}`);
          show(P.rpo, true); P.rpo.style.opacity = (rpoA * 0.6).toFixed(3);
          setText(LB.rpo, closing < 0.7 ? cfg.labels.rpo[0] : cfg.labels.rpo[1]);
          text(LB.rpo, [(rpoV.pt[0] + tp[0]) / 2, (rpoV.pt[1] + tp[1]) / 2 - 8], rpoA * 0.9, "middle");
          rpoV.speed = 0.55 + 1.6 * closing * (nearest > 6 ? 1 : 0);
          rpoDone = true;
        }
      }
      if (!rpoDone) { P.rpo.style.display = "none"; LB.rpo.style.display = "none"; if (rpoV) rpoV.speed = 0.55; }

      // launches from the factory up to the line
      const launchA = Math.max(preview(e, 2) * zone(e, 2), tier(e, "scale"), ramp(e, T.flip[0], T.flip[1]) * GHOST) * F;
      const l0 = at(1, lay.factory), l1 = at(RHO.LEO, lay.factory);
      P.launch.setAttribute("d", `M${fx(l0[0])},${fx(l0[1])} L${fx(l1[0])},${fx(l1[1])}`);
      show(P.launch, launchA > 0.02); P.launch.style.opacity = (launchA * 0.8).toFixed(3);
      const launchM = Math.max(preview(e), tier(e, "scale"));
      launchPk.forEach(k => {
        let u = (clock * 0.5 * motion + k.phase) % 1;
        if (launchM < 0.05) u = k.phase;
        const p = at(lerp(1, RHO.LEO, u), lay.factory);
        k.e.setAttribute("x", fx(p[0] - 2)); k.e.setAttribute("y", fx(p[1] - 2));
        k.e.style.opacity = (launchA * (u < 0.9 ? 1 : (1 - u) * 10)).toFixed(3);
        show(k.e, launchA > 0.02);
      });
      const hv = fleet.vehicles.find(v => v.hyper);
      if (hv && hv.alpha > 0.4 && hv.pt) text(LB.hyper, [hv.pt[0] + 12, hv.pt[1] - 8], hv.alpha * tier(e, "scale") * 0.9);
      else LB.hyper.style.display = "none";

      // outer system: yard, moon, asteroid, refinery and the corridors between them
      const resA = alphaOf(e, "resources", 3) * F;
      const yp = at(lay.shipRho, lay.ship), mp = at(RHO.MOON, lay.moon), ap = at(lay.astRho, lay.ast);
      place(S.shipyard, yp, resA); text(LB.shipyard, [yp[0] + 16, yp[1] + 4], resA * 0.8);
      place(S.moon, mp, resA); text(LB.moon, [mp[0] + 16, mp[1] + 4], resA * 0.8);
      place(S.asteroid, ap, resA); text(LB.asteroid, [ap[0] - 20, ap[1] - 2], resA * 0.8, "end");
      const rp = [ap[0] + 34, ap[1] + 18];
      spin += dt * 20 * motion * Math.max(preview(e), tier(e, "resources"));
      place(S.refinery, rp, resA, ` rotate(${fx(spin % 360)})`);
      text(LB.refinery, [rp[0] + 18, rp[1] + 4], resA * 0.8);
      const corridor = quad(yp, mp, wide ? -40 : -30), outbound = quad(yp, rp, wide ? 50 : 30), back = quad(rp, dl, wide ? -120 : -70);
      P.corridor.setAttribute("d", corridor.d); P.outbound.setAttribute("d", outbound.d); P.ret.setAttribute("d", back.d);
      [P.corridor, P.outbound, P.ret].forEach(p => { show(p, resA > 0.02); p.style.opacity = (resA * 0.8).toFixed(3); });
      const resM = Math.max(preview(e), tier(e, "resources"));
      lunars.forEach(k => { let u = (clock * 0.08 * motion + k.phase) % 1; if (resM < 0.05) u = k.phase; place(k.e, onQuad(corridor, u < 0.5 ? u * 2 : 2 - u * 2), resA); });
      [[outPk, outbound, 0.8], [retPk, back, 1]].forEach(([list, q, mul]) => list.forEach(k => {
        let u = (clock * 0.07 * motion + k.phase) % 1; if (resM < 0.05) u = k.phase;
        const p = onQuad(q, u);
        k.e.setAttribute("x", fx(p[0] - 1.5)); k.e.setAttribute("y", fx(p[1] - 1.5));
        k.e.style.opacity = (resA * mul).toFixed(3); show(k.e, resA > 0.02);
      }));
      const rl = onQuad(back, 0.3);
      text(LB.ret, [rl[0] + 8, rl[1] - 6], resA * 0.9);

      // beat copy
      const cur = beatAt(e);
      beatEls.forEach((el, i) => {
        const r = beatRange(i), a = Math.min(ramp(e, r[0], r[0] + 0.03), 1 - ramp(e, r[1] - 0.03, r[1]));
        if (!show(el, a > 0.01)) return;
        el.style.opacity = a.toFixed(3);
        el.style.transform = `translateY(${fx((1 - a) * 14)}px)`;
        if (el._lines) el._lines.forEach((ln, k) => {
          const w = el._cfg.wins[Math.min(k, el._cfg.wins.length - 1)];
          let on, lit;
          if (el._cfg.hold) { on = ramp(e, w[0], w[1]); lit = on; } else { on = band(e, w[0], w[1], 0.012); lit = ramp(e, w[0], w[0] + 0.012); }
          ln.style.opacity = (0.3 + 0.7 * Math.max(on, lit * 0.55)).toFixed(3);
          ln.classList.toggle("is-on", on > 0.5);
        });
      });
      if (fig && show(fig, figA > 0.01)) {
        fig.style.opacity = figA.toFixed(3);
        const s = figScale, sw = easeIO(ramp(e, T.swap[0], T.swap[1]));
        const br = lerp(46, 30, sw) * s, sr = lerp(3.5, 100, sw) * s, bx = 70 * s, by = lerp(66, 92, sw) * s, sx = 252 * s, sy = lerp(66, 120, sw) * s;
        bigC.setAttribute("cx", fx(bx)); bigC.setAttribute("cy", fx(by)); bigC.setAttribute("r", fx(br));
        [smallC, smallHalo].forEach((c, i) => { c.setAttribute("cx", fx(sx)); c.setAttribute("cy", fx(sy)); c.setAttribute("r", fx(sr + (i ? 7 * s : 0))); });
        smallRings.forEach((c, i) => { c.setAttribute("cx", fx(sx)); c.setAttribute("cy", fx(sy)); c.setAttribute("r", fx(sr * (i ? 0.7 : 0.38))); c.style.opacity = sw.toFixed(3); });
        bigTxt.setAttribute("x", fx(bx)); bigTxt.setAttribute("y", fx(by + br + 17));
        smallTxt.setAttribute("x", fx(sx)); smallTxt.setAttribute("y", fx(sy + sr + 17));
      }
      const ro = (cfg.beats[cur].readout || []).map((s, i) => `<span class="ob-ro${i ? "" : " ob-ro0"}">${esc(s)}</span>`).join("");
      if (readout._html !== ro) { readout.innerHTML = ro; readout._html = ro; }
      readout.style.opacity = ramp(e, T.focus[0] + 0.02, T.focus[0] + 0.06).toFixed(3);

      // capability panel
      const closed = e >= T.close[0], key = cur + ":" + closed;
      if (key !== panelKey) {
        panelKey = key;
        PANEL_STATES[cur].forEach((s, i) => (cellEls[i].querySelector(".ob-state").className = "ob-state " + STATE_CLASS[s]));
        setText(panelTitle, closed && cfg.panelTitleEnd ? cfg.panelTitleEnd : cfg.panelTitle);
      }
      panel.style.opacity = ramp(e, T.panelIn[0], T.panelIn[1]).toFixed(3);
      const lit = Math.min(ticks.length, live);
      ticks.forEach((t, i) => (t.className = i < lit ? "is-on" : ""));
      scaleNote.style.opacity = (0.6 * ramp(e, T.camEnd, T.camEnd + 0.05)).toFixed(3);
    }

    /* ---------- scroll → progress, eased toward the target ---------- */
    let shown = 0, target = 0, last = 0, alive = true, pinned = null;
    const progress = () => {
      if (pinned != null) return pinned;
      const r = track.getBoundingClientRect(), span = track.offsetHeight - stage.offsetHeight;
      return span <= 0 ? 0 : clamp(-r.top / span, 0, 1);
    };
    function loop(now) {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      target = progress();
      const k = Math.abs(target - shown) > 0.25 ? 0.5 : 0.16;
      shown += (target - shown) * k;
      if (Math.abs(target - shown) < 5e-4) shown = target;
      render(shown, dt);
      requestAnimationFrame(loop);
    }
    layout();
    document.fonts && document.fonts.ready.then(() => alive && layout());
    new ResizeObserver(layout).observe(stage);
    requestAnimationFrame(loop);

    return {
      timeline: T, order: ORDER,
      setProgress(p) { pinned = p == null ? null : clamp(p, 0, 1); if (pinned != null) shown = pinned; },
      destroy() { alive = false; },
    };
  }

  return { mount, timeline: T };
})();
