// Agentic workflow panel: a debate tribunal on one canvas, six scroll states.
//   0  brief      your words → the Super Judge's rules; it asks before it assumes
//   1  research   eight agents, one idea each, pull from sources; some build their own tools
//   2  debate     every claim drops a tether to a source; no source → struck from the record
//   3  listen     three judges hear the debate live and each locks onto an agent
//   4  report     reports climb to the Super Judge, every line carrying its source
//   5  verdict    debate record + three reports + your rules converge on one winner
// The cursor swells nearby agents; a click makes the nearest agent speak.
window.Tribunal = function Tribunal(section) {
  const stage = section.querySelector(".st");
  const canvas = section.querySelector(".st__bg"), g = canvas.getContext("2d");
  const layer = section.querySelector(".st__layer"), slot = section.querySelector(".st__slot");
  const lines = [...section.querySelectorAll(".st__line")], dots = [...section.querySelectorAll(".st__dots i")];
  const statusEl = section.querySelector("[data-st-status]");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const INK = "17,18,16", OLIVE = "107,125,0", WARN = "226,83,31";
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  let seed = 2026;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const N = 8, WIN = 4, PICKS = [2, 4, 4], TOOLS = [1, 3, 6];
  const agents = Array.from({ length: N }, (_, i) => ({ i, x: 0, y: 0, s: 1, a: 0, tool: 0 }));
  const judges = [0, 1, 2].map(i => ({ i, x: 0, y: 0, s: 1, a: 0, lock: 0 }));
  const sup = { x: 0, y: 0, a: 0 }, you = { x: 0, y: 0, a: 0 };
  let sources = [];

  /* ---------- layout ---------- */
  let W = 0, H = 0, dpr = 1, ox = 0, oy = 0, gw = 0, gh = 0, narrow = false;
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const sr = slot.getBoundingClientRect(), st = stage.getBoundingClientRect();
    ox = sr.left - st.left; oy = sr.top - st.top; gw = sr.width; gh = sr.height;
    narrow = gw < 640;
    sup.x = ox + gw / 2; sup.y = oy + gh * 0.06;
    you.x = ox + (narrow ? 14 : gw * 0.14); you.y = sup.y;
    judges.forEach((j, i) => { j.x = ox + gw * (0.5 + (i - 1) * (narrow ? 0.3 : 0.22)); j.y = oy + gh * 0.34; });
    agents.forEach((a, i) => { a.x = ox + gw * (0.04 + 0.92 * i / (N - 1)); a.y = oy + gh * 0.68; });
    const step = narrow ? 9 : 11, n = Math.floor(gw / step);
    sources = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++)
      sources.push({ x: ox + k * step + (r ? step / 2 : 0) + 2, y: oy + gh - 10 + r * 7, hit: 0, ok: 0 });
  }

  /* ---------- pointer ---------- */
  const ptr = { x: -1e4, y: -1e4, on: 0, inside: false };
  const ripples = [];
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointermove", e => { [ptr.x, ptr.y] = local(e); ptr.inside = true; });
  canvas.addEventListener("pointerleave", () => (ptr.inside = false));
  canvas.addEventListener("pointerdown", e => {
    const [x, y] = local(e);
    ptr.x = x; ptr.y = y; ptr.inside = true;
    ripples.push({ x, y, t: 0 });
    if (ripples.length > 4) ripples.shift();
    if (e.pointerType !== "mouse") setTimeout(() => (ptr.inside = false), 900);
    let best = agents[0], bd = 1e9;
    agents.forEach(a => { const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } });
    if (phase === 0) pulses.push({ from: you, to: sup, t: 0, q: false });
    else if (phase === 1) for (let k = 0; k < 4; k++) research(best);
    else claim(best, true);
  });

  /* ---------- live events ---------- */
  const claimsLive = [], rays = [], pulses = [], packets = [];
  const tally = { made: 0, ok: 0, struck: 0, lines: 0 };
  let speaker = null;
  // a source within reach of x, so tethers fall roughly straight down
  const near = (x, span) => { const c = sources.filter(s => Math.abs(s.x - x) < span); return c.length ? c[(rnd() * c.length) | 0] : sources[0]; };
  function research(a) {
    const s = near(a.x, gw * 0.12);
    rays.push({ a, s, t: 0 });
  }
  function claim(a, forced) {
    let b; do { b = agents[(rnd() * N) | 0]; } while (b === a);
    const ok = forced ? rnd() < 0.7 : rnd() < 0.84;
    // a sourced claim lands on a real source; an unsourced one reaches for empty space
    const s = near((a.x + b.x) / 2, gw * 0.08);
    claimsLive.push({ a, b, s, ok, t: 0, lift: 28 + rnd() * 34, miss: (rnd() - 0.5) * 60 });
    speaker = a;
  }

  /* ---------- scroll ---------- */
  let p = 0, phase = -1, phaseAt = 0, visible = false, last = 0, spawn = 0, packetClock = 0;
  const progress = () => {
    const r = section.getBoundingClientRect(), span = section.offsetHeight - stage.offsetHeight;
    return span <= 0 ? 0 : clamp(-r.top / span, 0, 1);
  };
  const STATUS = [
    () => "Super Judge · 규칙은 당신의 말 그대로 · 모호하면 먼저 묻습니다",
    () => `8 agents · 아이디어 8개 · 조사 중 · 직접 만든 도구 ${agents.filter(a => a.tool > 0.5).length}개`,
    () => `주장 ${tally.made} · 출처 확인 ${tally.ok} · 기각 ${tally.struck}`,
    () => `Judge A → Agent 0${PICKS[0] + 1} · B → 0${PICKS[1] + 1} · C → 0${PICKS[2] + 1} · 토론은 계속됩니다`,
    () => `보고서 3건 · 문장 ${tally.lines} · 출처 없는 문장 0`,
    () => `Winner · Agent 0${WIN + 1} · 당신의 기준을 바꾸지 않고 판정`,
  ];
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

  /* ---------- draw helpers ---------- */
  const label = (x, y, text, color, alpha, align = "left") => {
    if (alpha < 0.02) return;
    g.font = "500 14px Archivo, 'IBM Plex Sans KR', sans-serif";
    g.textAlign = align;
    g.fillStyle = `rgba(${color},${alpha.toFixed(3)})`;
    g.fillText(text, x, y);
    g.textAlign = "left";
  };
  function bracket(x, y, r, color, alpha, dashed) {
    const k = Math.max(3, r * 0.45);
    g.strokeStyle = `rgba(${color},${alpha})`; g.lineWidth = 1.25;
    g.setLineDash(dashed ? [2, 2] : []);
    g.beginPath();
    g.moveTo(x - r, y - r + k); g.lineTo(x - r, y - r); g.lineTo(x - r + k, y - r);
    g.moveTo(x + r - k, y - r); g.lineTo(x + r, y - r); g.lineTo(x + r, y - r + k);
    g.moveTo(x + r, y + r - k); g.lineTo(x + r, y + r); g.lineTo(x + r - k, y + r);
    g.moveTo(x - r + k, y + r); g.lineTo(x - r, y + r); g.lineTo(x - r, y + r - k);
    g.stroke(); g.setLineDash([]);
  }
  const line = (x0, y0, x1, y1, color, alpha, w = 1, dash) => {
    g.strokeStyle = `rgba(${color},${alpha})`; g.lineWidth = w;
    g.setLineDash(dash || []);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.setLineDash([]);
  };
  // quadratic arc between two agents, drawn up to fraction f
  function arc(a, b, lift, f, color, alpha) {
    const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - lift - Math.abs(a.x - b.x) * 0.12;
    g.strokeStyle = `rgba(${color},${alpha})`; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(a.x, a.y);
    const n = 24;
    for (let k = 1; k <= Math.round(n * f); k++) {
      const t = k / n, u = 1 - t;
      g.lineTo(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y);
    }
    g.stroke();
    return [0.25 * a.x + 0.5 * mx + 0.25 * b.x, 0.25 * a.y + 0.5 * my + 0.25 * b.y];
  }

  /* ---------- frame ---------- */
  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    const target = progress();
    p += (target - p) * (Math.abs(target - p) > 0.25 ? 0.5 : 0.16);
    if (Math.abs(target - p) < 5e-4) p = target;

    const ph = Math.min(5, Math.floor(p * 6));
    if (ph !== phase) {
      if (ph < 2) { tally.made = tally.ok = tally.struck = 0; claimsLive.length = 0; }
      if (ph < 4) { tally.lines = 0; packets.length = 0; }
      if (ph < 3) judges.forEach(j => (j.lock = 0));
      if (ph < 1) agents.forEach(a => (a.tool = 0));
      phase = ph; phaseAt = now;
      lines.forEach((el, i) => el.classList.toggle("is-on", i === ph));
      dots.forEach((el, i) => el.classList.toggle("is-on", i <= ph));
    }
    const age = (now - phaseAt) / 1000;
    ptr.on += ((ptr.inside ? 1 : 0) - ptr.on) * 0.18;

    // spawn ambient activity for the current phase
    spawn -= dt;
    if (spawn <= 0) {
      if (phase === 0) { pulses.push({ from: you, to: sup, t: 0, q: false }); spawn = 0.9; }
      else if (phase === 1) { research(agents[(rnd() * N) | 0]); spawn = 0.07; }
      else if (phase <= 3) { claim(agents[(rnd() * N) | 0]); spawn = phase === 2 ? 0.32 : 0.6; }
      else if (phase === 4) { claim(agents[(rnd() * N) | 0]); spawn = 0.9; }
      else spawn = 1;
    }
    if (phase === 0 && age > 1.6 && age - dt <= 1.6) pulses.push({ from: sup, to: you, t: 0, q: true });
    if (phase === 1) TOOLS.forEach((k, n) => { if (age > 0.6 + n * 0.7) agents[k].tool = Math.min(1, agents[k].tool + dt * 2); });
    if (phase >= 3) judges.forEach((j, n) => { if (age > 0.5 + n * 0.6 || phase > 3) j.lock = Math.min(1, j.lock + dt * 2.5); });
    if (phase === 4) {
      packetClock -= dt;
      if (packetClock <= 0) { judges.forEach((j, n) => packets.push({ j, t: -n * 0.15 })); packetClock = 0.75; }
    }

    // node visibility by phase
    you.a = lerp(you.a, phase === 0 || phase === 5 ? 1 : 0.35, 0.1);
    sup.a = lerp(sup.a, phase === 0 || phase >= 4 ? 1 : 0.3, 0.1);
    judges.forEach(j => (j.a = lerp(j.a, phase >= 3 ? 1 : 0.18, 0.1)));
    agents.forEach(a => {
      const dim = phase === 5 && a.i !== WIN ? 0.25 : phase === 0 ? 0.2 : 1;
      a.a = lerp(a.a, dim, 0.1);
      const d = Math.hypot(a.x - ptr.x, a.y - ptr.y);
      const f = smooth(clamp(1 - d / 130, 0, 1)) * ptr.on;
      const want = 1 + f * 0.9 + (phase === 5 && a.i === WIN ? 0.8 : 0);
      a.s += (want - a.s) * (reduce ? 1 : 0.22);
    });

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.t += dt;
      if (r.t > 1.4) { ripples.splice(i, 1); continue; }
      g.strokeStyle = `rgba(${INK},${0.25 * (1 - r.t / 1.4)})`; g.lineWidth = 1;
      g.beginPath(); g.arc(r.x, r.y, 10 + r.t * 220, 0, Math.PI * 2); g.stroke();
    }

    // sources: the evidence floor
    sources.forEach(s => {
      s.hit = Math.max(0, s.hit - dt * 1.4); s.ok = Math.max(0, s.ok - dt * 0.8);
      const c = s.ok > 0.02 ? OLIVE : INK;
      const al = 0.22 + Math.max(s.hit, s.ok) * 0.78, sz = 2 + Math.max(s.hit, s.ok) * 2;
      g.fillStyle = `rgba(${c},${al.toFixed(3)})`;
      g.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
    });
    label(ox, oy + gh + 12, "Sources · 논문 · 공공데이터 · 문서 · 원문", INK, 0.5);

    // research rays
    for (let i = rays.length - 1; i >= 0; i--) {
      const r = rays[i]; r.t += dt;
      if (r.t > 0.9) { rays.splice(i, 1); continue; }
      const f = smooth(clamp(r.t / 0.35, 0, 1)), fade = 1 - clamp((r.t - 0.35) / 0.55, 0, 1);
      line(r.a.x, r.a.y, lerp(r.a.x, r.s.x, f), lerp(r.a.y, r.s.y, f), INK, 0.28 * fade);
      if (r.t > 0.35) r.s.hit = Math.max(r.s.hit, fade);
    }

    // claims: arc to the opponent, tether to a source, then verdict
    for (let i = claimsLive.length - 1; i >= 0; i--) {
      const c = claimsLive[i]; c.t += dt;
      const T = c.t;
      if (T > 2.6) { claimsLive.splice(i, 1); continue; }
      if (!c.counted && T > 1.0) {
        c.counted = true; tally.made++;
        c.ok ? tally.ok++ : tally.struck++;
        if (c.ok) c.s.ok = 1;
      }
      const fade = 1 - clamp((T - 1.6) / 1.0, 0, 1);
      const color = T > 1.0 ? (c.ok ? OLIVE : WARN) : INK;
      const [mx, my] = arc(c.a, c.b, c.lift, smooth(clamp(T / 0.45, 0, 1)), color, (T > 1.0 && !c.ok ? 0.85 : 0.6) * fade);
      if (T > 0.45) {
        const f = smooth(clamp((T - 0.45) / 0.45, 0, 1));
        const tx = c.ok ? c.s.x : mx + c.miss, ty = c.ok ? c.s.y : lerp(my, c.s.y, 0.55);
        line(mx, my, lerp(mx, tx, f), lerp(my, ty, f), c.ok ? (T > 1 ? OLIVE : INK) : (T > 1 ? WARN : INK), 0.45 * fade, 1, c.ok ? null : [3, 3]);
        if (T > 1.0) {
          if (c.ok) bracket(tx, ty, 5, OLIVE, 0.9 * fade);
          else {
            const k = 5;
            line(mx - k, my - k, mx + k, my + k, WARN, fade, 1.5); line(mx + k, my - k, mx - k, my + k, WARN, fade, 1.5);
            label(mx + 9, my - 6, "출처 없음 · 기각", WARN, fade);
            label(tx, ty + 4, "?", WARN, 0.8 * fade, "center");
          }
        }
      }
    }

    // judges listen to whoever is speaking, and lock onto their pick
    judges.forEach((j, n) => {
      if (phase >= 3) {
        if (speaker) line(j.x, j.y, speaker.x, speaker.y, INK, 0.12 * j.a, 1, [2, 4]);
        const pk = agents[PICKS[n]];
        if (j.lock > 0) {
          line(j.x, j.y, lerp(j.x, pk.x, j.lock), lerp(j.y, pk.y, j.lock), INK, 0.55 * j.a, 1.2);
          bracket(pk.x, pk.y, 9 + 4 * n + (1 - smooth(j.lock)) * 14, INK, 0.7 * j.lock * (phase === 5 && PICKS[n] !== WIN ? 0.3 : 1));
        }
      }
    });

    // report packets: judge → super judge, each line carrying a source mark
    for (let i = packets.length - 1; i >= 0; i--) {
      const k = packets[i]; k.t += dt;
      if (k.t < 0) continue;
      if (k.t > 1) { packets.splice(i, 1); tally.lines += 4; continue; }
      const f = smooth(k.t), x = lerp(k.j.x, sup.x, f), y = lerp(k.j.y, sup.y, f);
      g.fillStyle = `rgba(${INK},0.9)`;
      for (let r = 0; r < 3; r++) g.fillRect(x - 7, y - 5 + r * 4, 10, 1.5);
      g.fillStyle = `rgba(${OLIVE},1)`;
      for (let r = 0; r < 3; r++) g.fillRect(x + 4.5, y - 5.5 + r * 4, 2.5, 2.5);
    }
    if (phase >= 4) judges.forEach(j => line(j.x, j.y, sup.x, sup.y, INK, 0.2, 1));

    // brief: your words travel to the Super Judge; it asks back once
    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i]; q.t += dt / 1.1;
      if (q.t > 1) { pulses.splice(i, 1); continue; }
      const f = smooth(q.t), x = lerp(q.from.x, q.to.x, f), y = lerp(q.from.y, q.to.y, f);
      g.fillStyle = `rgba(${q.q ? WARN : INK},0.95)`;
      g.fillRect(x - 2.5, y - 2.5, 5, 5);
      if (q.q) label(x, y - 9, "확인 질문?", WARN, 0.95, "center");
    }
    line(you.x, you.y, sup.x, sup.y, INK, 0.25 * Math.max(you.a, 0.4), 1, phase === 5 ? null : [2, 3]);

    // verdict: three inputs converge
    if (phase === 5) {
      const f = smooth(clamp(age / 0.8, 0, 1));
      const w = agents[WIN];
      line(sup.x, sup.y, lerp(sup.x, w.x, f), lerp(sup.y, w.y, f), OLIVE, 0.9, 1.6);
      bracket(w.x, w.y, 16 + (1 - f) * 20, OLIVE, f);
      label(w.x, w.y + 46, "Winner", OLIVE, f, "center");
    }

    // nodes
    g.fillStyle = `rgba(${INK},${you.a})`;
    g.strokeStyle = `rgba(${INK},${you.a})`; g.lineWidth = 1.25;
    g.strokeRect(you.x - 5, you.y - 5, 10, 10);
    label(you.x, you.y - 14, narrow ? "You" : "You · 브리프", INK, you.a, narrow ? "left" : "center");

    g.save(); g.translate(sup.x, sup.y); g.rotate(Math.PI / 4);
    g.fillStyle = `rgba(${INK},${sup.a})`; g.fillRect(-7, -7, 14, 14);
    g.restore();
    label(sup.x, sup.y - 16, "Super Judge", INK, sup.a, "center");

    judges.forEach(j => {
      g.fillStyle = `rgba(${INK},${j.a})`; g.fillRect(j.x - 5, j.y - 5, 10, 10);
      label(j.x, j.y - 13, "Judge " + "ABC"[j.i], INK, j.a, "center");
    });

    agents.forEach(a => {
      const r = 5.5 * a.s;
      g.fillStyle = `rgba(${INK},${a.a})`;
      g.beginPath(); g.arc(a.x, a.y, r, 0, Math.PI * 2); g.fill();
      if (a === speaker && phase >= 2 && phase < 5) { g.strokeStyle = `rgba(${INK},0.5)`; g.lineWidth = 1; g.beginPath(); g.arc(a.x, a.y, r + 4, 0, Math.PI * 2); g.stroke(); }
      if (a.tool > 0) {
        const tx = a.x + 11, ty = a.y - 11, k = 3.5 * a.tool;
        line(tx - k, ty, tx + k, ty, OLIVE, a.a, 1.5); line(tx, ty - k, tx, ty + k, OLIVE, a.a, 1.5);
        if (phase === 1) label(tx + 6, ty - 4, "New skill", OLIVE, a.tool * 0.9);
      }
      const near = a.s > 1.25;
      if (!narrow || near || (phase === 5 && a.i === WIN)) label(a.x, a.y + Math.max(20, r + 24), "Agent 0" + (a.i + 1), INK, Math.min(1, a.a * (near ? 1 : 0.55)), "center");
    });

    setText(statusEl, STATUS[phase]());
    if (visible) requestAnimationFrame(frame);
  }

  new ResizeObserver(layout).observe(stage);
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) { last = 0; requestAnimationFrame(frame); }
  }).observe(section);
  document.fonts && document.fonts.ready.then(layout);
  layout();
};
