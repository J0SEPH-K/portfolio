// "99% accurate" made tangible: 1,000 inspected units, 10 of them misjudged.
// Step 1: verdicts only, the errors are invisible. Step 2: show confidence, and
// the low-confidence units become a short review queue. Step 3: move the
// threshold and watch queue size trade against errors caught.
// Every visual value eases toward its target, so changes always animate.
window.Lot = function Lot(root) {
  const $ = s => root.querySelector(s);
  const grid = $(".lot__grid"), g = grid.getContext("2d");
  const hist = $(".lot__hist"), h = hist.getContext("2d");
  const sw = $("[data-evidence]"), thrIn = $("#lot-thr"), thrOut = $("[data-thr-out]");
  const card = $("[data-lot-card]"), question = $("[data-lot-q]");
  const steps = [...root.querySelectorAll(".lot__step")];
  const INK = [17, 18, 16], OLIVE = [107, 125, 0], WARN = "#e2531f";
  const REASONS = ["SCRATCH 의심 영역", "PARTICLE 경계값", "MURA 저대비", "조명 반사", "DEAD_PX 군집 의심"];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- deterministic lot ---------- */
  let seed = 1016;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const units = Array.from({ length: 1000 }, (_, i) => ({
    i, id: String(i + 1).padStart(4, "0"),
    ng: rnd() < 0.03,
    conf: 0.8 + (1 - rnd() ** 2.2) * 0.199,
    wrong: false,
    reason: REASONS[(rnd() * REASONS.length) | 0],
    ev: 0, q: 0, reveal: 0,           // eased display values
  }));
  const pick = () => { let u; do { u = units[(rnd() * 1000) | 0]; } while (u.wrong || u.low); return u; };
  for (let n = 0; n < 10; n++) { const u = pick(); u.wrong = true; u.conf = n === 0 ? 0.93 : 0.55 + rnd() * 0.22; }
  for (let n = 0; n < 14; n++) { const u = pick(); u.low = true; u.conf = 0.62 + rnd() * 0.17; }

  /* ---------- state ---------- */
  let evidence = false, thr = 0.8, hover = null, pinned = null, touched = false;
  const hov = { x: 0, y: 0, s: 0 };          // eased hover lens
  const shown = { queue: 0, caught: 0, load: 0 };
  const stats = () => {
    if (!evidence) return { queue: 0, caught: 0, load: 0 };
    const q = units.filter(u => u.conf < thr);
    return { queue: q.length, caught: q.filter(u => u.wrong).length, load: q.length / 10 };
  };

  /* ---------- layout ---------- */
  const PAD = 8;                              // room for rings and the lens, so nothing clips
  let cols = 40, rows = 25, cell = 12, gap = 3, ox = PAD, dpr = 1, W = 0, H = 0;
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = grid.clientWidth;
    const narrow = W < 520;
    cols = W > 760 ? 50 : 40; rows = 1000 / cols; gap = narrow ? 1.5 : 3;
    const byW = (W - 2 * PAD - gap * (cols - 1)) / cols;
    const maxH = narrow ? Infinity : Math.max(260, Math.min(innerHeight * 0.5, 440));
    const byH = (maxH - 2 * PAD - gap * (rows - 1)) / rows;
    cell = Math.max(5, Math.min(byW, byH));
    const gw = cols * cell + gap * (cols - 1);
    ox = PAD + Math.max(0, (W - 2 * PAD - gw) / 2);
    H = rows * cell + gap * (rows - 1) + 2 * PAD;
    grid.style.height = H + "px";
    grid.width = W * dpr; grid.height = H * dpr;
    const hw = hist.clientWidth, hh = 44;
    hist.width = hw * dpr; hist.height = hh * dpr; hist.style.height = hh + "px";
  }
  const cellXY = u => [ox + (u.i % cols) * (cell + gap), PAD + Math.floor(u.i / cols) * (cell + gap)];

  /* ---------- drawing ---------- */
  const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
  function rr(x, y, w, hgt, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hgt, r) : g.rect(x, y, w, hgt); }
  function drawGrid() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const r = Math.min(3, cell * 0.22);
    // faint crosshair through the hovered unit, like an inspection reticle
    if (hov.s > 0.01 && hover) {
      const [x, y] = cellXY(hover);
      g.fillStyle = `rgba(17,18,16,${0.05 * hov.s})`;
      g.fillRect(PAD / 2, y - 1, W - PAD, cell + 2);
      g.fillRect(x - 1, PAD / 2, cell + 2, H - PAD);
    }
    units.forEach(u => {
      const [x, y] = cellXY(u);
      const ev = u.ev, q = u.q * ev;
      // verdict-only look
      let a = u.ng ? 0.62 : 0.12;
      // with evidence, keep verdicts but calm everything outside the queue
      a = a + ((u.ng ? 0.5 : 0.07 + (1 - u.conf) * 0.6) - a) * ev;
      const col = q > 0.01 ? mix(INK, OLIVE, q) : INK;
      const alpha = (a + (1 - a) * q) * u.reveal;
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha.toFixed(3)})`;
      rr(x, y, cell, cell, r); g.fill();
      if (u.wrong && q > 0.5) {
        g.strokeStyle = WARN; g.lineWidth = 1.5; g.globalAlpha = (q - 0.5) * 2;
        rr(x - 2, y - 2, cell + 4, cell + 4, r + 1.5); g.stroke(); g.globalAlpha = 1;
      }
      if (u === pinned) {
        g.strokeStyle = "rgb(17,18,16)"; g.lineWidth = 2;
        rr(x - 3, y - 3, cell + 6, cell + 6, r + 2); g.stroke();
      }
    });
    // hover lens: the unit lifts and grows
    if (hov.s > 0.01 && hover) {
      const s = cell * (1 + 0.9 * hov.s), x = hov.x + cell / 2 - s / 2, y = hov.y + cell / 2 - s / 2;
      g.save();
      g.shadowColor = "rgba(0,0,0,0.25)"; g.shadowBlur = 10 * hov.s; g.shadowOffsetY = 2 * hov.s;
      const q = hover.q * hover.ev, col = q > 0.01 ? mix(INK, OLIVE, q) : INK;
      g.fillStyle = "#ffffff"; rr(x, y, s, s, r + 2); g.fill();
      g.shadowColor = "transparent";
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${hover.ng || q > 0.5 ? 0.9 : 0.35})`;
      rr(x + 2, y + 2, s - 4, s - 4, r + 1); g.fill();
      g.restore();
    }
  }

  function drawHist() {
    const hw = hist.width / dpr, hh = hist.height / dpr;
    h.setTransform(dpr, 0, 0, dpr, 0, 0);
    h.clearRect(0, 0, hw, hh);
    const lo = 0.55, hi = 1, bins = 45, counts = new Array(bins).fill(0), wrongBins = new Array(bins).fill(0);
    units.forEach(u => { const b = Math.min(bins - 1, Math.max(0, Math.floor(((u.conf - lo) / (hi - lo)) * bins))); counts[b]++; if (u.wrong) wrongBins[b]++; });
    const max = Math.sqrt(Math.max(...counts)), bw = hw / bins, base = hh - 8;
    const on = evidence ? 1 : 0.35;
    counts.forEach((c, b) => {
      if (!c) return;
      const v = lo + ((b + 0.5) / bins) * (hi - lo), bh = Math.max(2, (Math.sqrt(c) / max) * (base - 6));
      const inQ = evidence && v < thr;
      h.fillStyle = inQ ? `rgba(107,125,0,${0.9 * on})` : `rgba(17,18,16,${0.22 * on})`;
      h.fillRect(b * bw + 0.5, base - bh, Math.max(1, bw - 1), bh);
      if (wrongBins[b]) { h.fillStyle = WARN; h.globalAlpha = on; h.fillRect(b * bw + bw / 2 - 1.5, base - bh - 5, 3, 3); h.globalAlpha = 1; }
    });
    h.fillStyle = `rgba(17,18,16,${0.25 * on})`; h.fillRect(0, base, hw, 1);
    const tx = ((thr - lo) / (hi - lo)) * hw;
    h.fillStyle = `rgba(17,18,16,${on})`; h.fillRect(tx - 1, 0, 2, base + 4);
    h.beginPath(); h.moveTo(tx - 5, base + 8); h.lineTo(tx + 5, base + 8); h.lineTo(tx, base + 3); h.closePath(); h.fill();
  }

  /* ---------- copy + panel ---------- */
  const fmtNum = (k, v) => (k === "load" ? v.toFixed(1) + "%" : Math.round(v).toString());
  function writeStats() {
    root.querySelector('[data-stat="queue"]').textContent = fmtNum("queue", shown.queue);
    root.querySelector('[data-stat="caught"]').innerHTML = fmtNum("caught", shown.caught) + "<small>/10</small>";
    root.querySelector('[data-stat="load"]').textContent = fmtNum("load", shown.load);
  }
  function writeQuestion() {
    const s = stats();
    question.textContent = evidence
      ? `근거를 보여주면 작업자는 ${s.queue}개만 다시 보면 됩니다. 오판 10개 중 ${s.caught}개가 그 안에 있습니다.`
      : "이 격자의 1,000개 유닛 중 10개는 AI가 틀리게 판정했습니다. 어느 것인지 찾을 수 있나요?";
  }
  function setStep() {
    const cur = !evidence ? 2 : touched ? 0 : 3;   // the step to do next glows
    steps.forEach((li, k) => {
      const n = k + 1;
      li.classList.toggle("is-next", n === cur);
      li.classList.toggle("is-done", n === 1 ? evidence || !!hover : n === 2 ? evidence : touched);
    });
  }
  function writeCard(u) {
    if (!u) {
      card.innerHTML = evidence
        ? `<p class="mono">Tip</p><p>올리브색 유닛이 작업자가 다시 볼 검토 대상입니다. 빨간 테두리는 실제 오판입니다.</p>`
        : `<p class="mono">Tip</p><p>유닛에 마우스를 올려 판정을 확인하세요. 클릭하면 고정됩니다.</p>`;
      return;
    }
    const low = u.conf < thr;
    const status = !evidence ? "판정만으로는 믿어도 되는지 알 수 없습니다."
      : low ? `근거: ${u.reason} (${u.conf.toFixed(2)} < ${thr.toFixed(2)}) → 작업자 검토${u.wrong ? " · <b>실제 오판</b>" : ""}`
      : u.wrong ? "높은 신뢰도의 오판입니다. 근거만으로는 잡히지 않습니다."
      : "신뢰도가 충분해 자동 처리됩니다.";
    card.innerHTML = `<p class="mono">Unit #${u.id}${pinned === u ? " · pinned" : ""}</p>
      <p class="lot__verdict">${u.ng ? "NG" : "PASS"}${evidence ? `<span class="lot__conf"><i style="width:${(u.conf * 100).toFixed(0)}%"></i></span><em class="mono">${u.conf.toFixed(2)}</em>` : ""}</p>
      <p>${status}</p>`;
  }

  /* ---------- animation loop ---------- */
  let visible = false, raf = 0, toggledAt = 0, revealedAt = 0;
  const ease = (cur, target, k) => (Math.abs(target - cur) < 0.002 ? target : cur + (target - cur) * k);
  function frame(now) {
    raf = 0;
    let moving = false;
    const st = stats();
    units.forEach(u => {
      const col = u.i % cols, delay = (col / cols) * 0.35;           // left-to-right sweep
      const flipped = now - toggledAt > delay * 1000;
      const evT = flipped ? (evidence ? 1 : 0) : (evidence ? 0 : 1);
      const qT = u.conf < thr ? 1 : 0;
      const revT = revealedAt && now - revealedAt > delay * 1400 ? 1 : 0;
      const k = reduce ? 1 : 0.16;
      const a = ease(u.ev, evT, k), b = ease(u.q, qT, k), c = ease(u.reveal, revT, reduce ? 1 : 0.12);
      if (a !== evT || b !== qT || c !== revT) moving = true;   // keep going until every target is reached
      u.ev = a; u.q = b; u.reveal = c;
    });
    if (hover) {
      const [x, y] = cellXY(hover);
      hov.x = hov.s < 0.05 ? x : ease(hov.x, x, 0.35); hov.y = hov.s < 0.05 ? y : ease(hov.y, y, 0.35);
    }
    const sT = hover ? 1 : 0, ns = ease(hov.s, sT, reduce ? 1 : 0.22);
    if (ns !== hov.s || (hover && (hov.x !== cellXY(hover)[0] || hov.y !== cellXY(hover)[1]))) moving = true;
    hov.s = ns;
    ["queue", "caught", "load"].forEach(k => { const v = ease(shown[k], st[k], 0.2); if (v !== shown[k]) moving = true; shown[k] = v; });
    writeStats();
    drawGrid();
    if (moving && visible) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  /* ---------- input ---------- */
  const at = e => {
    const r = grid.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left - ox + gap / 2) / (cell + gap)), rr2 = Math.floor((e.clientY - r.top - PAD + gap / 2) / (cell + gap));
    return c < 0 || c >= cols || rr2 < 0 || rr2 >= rows ? null : units[rr2 * cols + c] || null;
  };
  grid.addEventListener("pointermove", e => {
    const u = at(e);
    if (u !== hover) { hover = u; writeCard(pinned || u); setStep(); kick(); }
  });
  grid.addEventListener("pointerleave", () => { hover = null; writeCard(pinned); kick(); });
  grid.addEventListener("click", e => { const u = at(e); pinned = pinned === u ? null : u; writeCard(pinned || u); kick(); });

  function setEvidence(on) {
    evidence = on;
    toggledAt = performance.now();
    sw.setAttribute("aria-checked", on);
    sw.querySelector(".lot__switchlabel").textContent = on ? "근거 표시 중" : "판정 + 근거 보기";
    root.classList.toggle("is-evidence", on);
    thrIn.disabled = !on;
    writeQuestion(); writeCard(pinned || hover); setStep(); drawHist(); kick();
  }
  sw.addEventListener("click", () => setEvidence(!evidence));
  const setThr = v => {
    thr = Math.round(Math.min(0.97, Math.max(0.6, v)) * 100) / 100;
    thrIn.value = thr; thrOut.textContent = thr.toFixed(2);
    touched = true;
    writeQuestion(); writeCard(pinned || hover); setStep(); drawHist(); kick();
  };
  thrIn.addEventListener("input", () => setThr(+thrIn.value));
  // dragging on the histogram moves the threshold too
  let dragging = false;
  const histPick = e => { if (!evidence) return; const r = hist.getBoundingClientRect(); setThr(0.55 + ((e.clientX - r.left) / r.width) * 0.45); };
  hist.addEventListener("pointerdown", e => { dragging = true; hist.setPointerCapture(e.pointerId); histPick(e); });
  hist.addEventListener("pointermove", e => dragging && histPick(e));
  hist.addEventListener("pointerup", () => (dragging = false));

  new ResizeObserver(() => { layout(); drawGrid(); drawHist(); }).observe(grid);
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) { if (!revealedAt) revealedAt = performance.now(); kick(); }
  }, { threshold: 0.15 }).observe(grid);

  layout();
  writeQuestion(); writeCard(null); setStep(); writeStats(); drawHist(); drawGrid();
};
