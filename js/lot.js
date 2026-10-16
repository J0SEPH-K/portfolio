// "99% accurate" made tangible: 1,000 inspected units, 10 of them misjudged.
// With verdicts only, the errors are invisible. With confidence shown, the
// low-confidence units form a short review queue that contains 9 of the 10.
window.Lot = function Lot(root) {
  const $ = s => root.querySelector(s);
  const canvas = $(".lot__grid"), ctx = canvas.getContext("2d");
  const INK = "17,18,16", OLIVE = "#6b7d00", WARN = "#e2531f";
  const REASONS = ["SCRATCH 의심 영역", "PARTICLE 경계값", "MURA 저대비", "조명 반사", "DEAD_PX 군집 의심"];

  // deterministic lot
  let seed = 1016;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const units = Array.from({ length: 1000 }, (_, i) => ({
    i, id: String(i + 1).padStart(4, "0"),
    ng: rnd() < 0.03, conf: 0.9 + rnd() * 0.099, wrong: false,
    reason: REASONS[(rnd() * REASONS.length) | 0], mix: 0,
  }));
  const pickFree = () => { let u; do { u = units[(rnd() * 1000) | 0]; } while (u.wrong || u.lowFlag); return u; };
  for (let n = 0; n < 10; n++) { const u = pickFree(); u.wrong = true; u.conf = n === 0 ? 0.93 : 0.55 + rnd() * 0.22; }
  for (let n = 0; n < 14; n++) { const u = pickFree(); u.lowFlag = true; u.conf = 0.62 + rnd() * 0.17; }
  const THR = 0.8;
  const queue = units.filter(u => u.conf < THR);
  const caught = queue.filter(u => u.wrong).length;

  let explain = false, hover = null, pinned = null;
  let cols = 50, rows = 20, cell = 12, gap = 3, dpr = 1;

  function layout() {
    const w = canvas.clientWidth;
    cols = w < 520 ? 25 : 50; rows = 1000 / cols;
    gap = w < 520 ? 2 : 3;
    cell = (w - gap * (cols - 1)) / cols;
    const h = rows * cell + gap * (rows - 1);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.style.height = h + "px";
    canvas.width = w * dpr; canvas.height = h * dpr;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    units.forEach(u => {
      const x = (u.i % cols) * (cell + gap), y = Math.floor(u.i / cols) * (cell + gap);
      const m = u.mix; // 0 = verdict only, 1 = with evidence
      const low = u.conf < THR;
      // verdict-only look: PASS faint, NG solid
      let a = u.ng ? 0.62 : 0.13;
      // evidence look: opacity follows confidence, review queue turns olive
      const ea = low ? 1 : (u.ng ? 0.5 : 0.1) + (u.conf - 0.9) * 0.6;
      ctx.fillStyle = low && m > 0 ? lerpColor(`rgba(${INK},${a})`, OLIVE, m) : `rgba(${INK},${a + (ea - a) * m})`;
      ctx.fillRect(x, y, cell, cell);
      if (m > 0.5 && u.wrong && low) {
        ctx.strokeStyle = WARN; ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 1.5, y - 1.5, cell + 3, cell + 3);
      }
      if (u === hover || u === pinned) {
        ctx.strokeStyle = `rgb(${INK})`; ctx.lineWidth = 2;
        ctx.strokeRect(x - 2.5, y - 2.5, cell + 5, cell + 5);
      }
    });
  }
  // blend an rgba() string toward a hex colour (only used for the olive fade)
  function lerpColor(from, hex, m) {
    const f = from.match(/[\d.]+/g).map(Number);
    const h = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const c = [0, 1, 2].map(i => Math.round(f[i] + (h[i] - f[i]) * m));
    return `rgba(${c.join(",")},${(f[3] + (1 - f[3]) * m).toFixed(3)})`;
  }

  // staggered sweep when the mode changes
  let anim = 0;
  function setMode(on) {
    explain = on;
    root.querySelectorAll(".seg").forEach(b => {
      const active = (b.dataset.mode === "explain") === on;
      b.classList.toggle("is-on", active); b.setAttribute("aria-pressed", active);
    });
    $("[data-lot-q]").textContent = on
      ? `근거를 보여주면 작업자는 ${queue.length}개만 다시 보면 됩니다. 오판 10개 중 ${caught}개가 그 안에 있습니다.`
      : "1,000개 중 10개는 오판입니다. 어느 것인지 찾을 수 있나요?";
    $("[data-lot-review]").textContent = on ? `${queue.length} units` : "0 units";
    $("[data-lot-caught]").textContent = on ? `${caught} / 10` : "0 / 10";
    const t0 = performance.now();
    cancelAnimationFrame(anim);
    const step = now => {
      let moving = false;
      units.forEach(u => {
        const delay = (u.i % cols) / cols * 380;
        const p = Math.max(0, Math.min(1, (now - t0 - delay) / 360));
        const target = on ? 1 : 0;
        const from = on ? 0 : 1;
        u.mix = from + (target - from) * (1 - Math.pow(1 - p, 3));
        if (p < 1) moving = true;
      });
      draw();
      if (moving) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function card(u) {
    const el = $("[data-lot-card]");
    if (!u) { el.innerHTML = '<p class="mono">Hover a unit</p><p class="lot__hint">각 칸은 검사된 유닛 하나입니다. 근거를 켜면 신뢰도가 낮은 유닛이 드러납니다.</p>'; return; }
    const low = u.conf < THR;
    const verdict = u.ng ? "NG" : "PASS";
    el.innerHTML = `<p class="mono">Unit #${u.id}</p>
      <p class="lot__verdict">${verdict}${explain ? ` <span>신뢰도 ${u.conf.toFixed(2)}</span>` : ""}</p>
      <p class="lot__hint">${!explain ? "판정만으로는 이 결과를 믿어도 되는지 알 수 없습니다."
        : low ? `근거: ${u.reason} (${u.conf.toFixed(2)} &lt; ${THR.toFixed(2)}) → 작업자 검토 대상${u.wrong ? " · <b>실제 오판</b>" : ""}`
        : u.wrong ? "높은 신뢰도의 오판. 근거 표시로도 잡히지 않는 1건입니다." : "신뢰도가 충분해 자동 처리됩니다."}</p>`;
  }

  const at = e => {
    const r = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / (cell + gap)), rr = Math.floor((e.clientY - r.top) / (cell + gap));
    if (c < 0 || c >= cols || rr < 0 || rr >= rows) return null;
    return units[rr * cols + c] || null;
  };
  canvas.addEventListener("pointermove", e => { const u = at(e); if (u !== hover) { hover = u; card(pinned || u); draw(); } });
  canvas.addEventListener("pointerleave", () => { hover = null; card(pinned); draw(); });
  canvas.addEventListener("click", e => { const u = at(e); pinned = pinned === u ? null : u; card(pinned || u); draw(); });
  root.querySelectorAll(".seg").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode === "explain")));

  new ResizeObserver(() => { layout(); draw(); }).observe(canvas);
  layout(); setMode(false); card(null);
};
