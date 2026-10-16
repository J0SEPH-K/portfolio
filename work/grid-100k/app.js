// Grid 100K — 100,000 rows, a fixed pool of ~40 DOM rows, filters/sort/aggregates
// recomputed on every change, and a chart that is also a filter.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  if (location.hash === "#embed" || new URLSearchParams(location.search).has("embed")) document.body.classList.add("is-embed");

  /* ---------- deterministic sample data ---------- */
  let seed = 20261016;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = a => a[(rnd() * a.length) | 0];

  const MARKETS = ["가락", "강서", "구리", "엄궁", "반여", "대구북부", "광주각화"];
  const ITEMS = {
    사과: { p: 3800, o: ["경북 청송", "경북 영주", "충북 충주", "경남 거창"] },
    배: { p: 3200, o: ["전남 나주", "충남 천안", "경기 안성"] },
    감귤: { p: 2400, o: ["제주 서귀포", "제주 제주시"] },
    딸기: { p: 9800, o: ["충남 논산", "경남 진주", "전남 담양"] },
    포도: { p: 6200, o: ["경북 김천", "충북 영동", "경북 상주"] },
    양파: { p: 900, o: ["전남 무안", "경남 창녕"] },
    배추: { p: 700, o: ["강원 평창", "전남 해남"] },
    감자: { p: 1500, o: ["강원 강릉", "경북 문경"] },
    마늘: { p: 5200, o: ["경북 의성", "충남 서산"] },
    고추: { p: 7400, o: ["경북 영양", "충북 괴산"] },
  };
  const ITEM_NAMES = Object.keys(ITEMS);
  const GRADES = ["특", "상", "중", "하"];
  const GRADE_MUL = { 특: 1.25, 상: 1.0, 중: 0.82, 하: 0.65 };
  const STATUSES = ["낙찰", "정산완료", "유찰"];
  const DAYS = 120;
  const END = new Date("2026-10-16T00:00:00+09:00").getTime();
  const DAY = 864e5;
  const dateStr = d => new Date(END - (DAYS - 1 - d) * DAY + 9 * 3600e3).toISOString().slice(0, 10);
  const DATE_LABELS = Array.from({ length: DAYS }, (_, d) => dateStr(d));

  const N = 100000;
  const rows = new Array(N);
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const item = pick(ITEM_NAMES), it = ITEMS[item];
    const day = (rnd() * DAYS) | 0;
    const g = rnd(), grade = g < 0.18 ? "특" : g < 0.58 ? "상" : g < 0.88 ? "중" : "하";
    const drift = 1 + 0.12 * Math.sin((day / DAYS) * Math.PI * 2 + item.length) + (rnd() - 0.5) * 0.18;
    const price = Math.round((it.p * GRADE_MUL[grade] * drift) / 10) * 10;
    const qty = Math.round((40 + rnd() ** 2 * 2400) / 5) * 5;
    const s = rnd(), status = s < 0.05 ? "유찰" : s < 0.32 && day < DAYS - 3 ? "정산완료" : "낙찰";
    rows[i] = {
      id: "T" + String(1000000 + i * 7 + ((rnd() * 7) | 0)).slice(1),
      day, market: pick(MARKETS), item, grade, origin: pick(it.o),
      qty, price, amount: status === "유찰" ? 0 : qty * price, status,
    };
  }
  const genMs = performance.now() - t0;

  // per-item weighted average price, used to flag outliers and in the detail benchmark
  const itemAvg = {};
  ITEM_NAMES.forEach(n => (itemAvg[n] = { q: 0, a: 0 }));
  rows.forEach(r => { if (r.amount) { itemAvg[r.item].q += r.qty; itemAvg[r.item].a += r.amount; } });
  ITEM_NAMES.forEach(n => (itemAvg[n] = itemAvg[n].a / itemAvg[n].q));

  /* ---------- columns ---------- */
  const fmt = n => n.toLocaleString("ko-KR");
  const COLS = [
    { key: "id", label: "거래번호", cls: "id" },
    { key: "day", label: "일자", render: r => DATE_LABELS[r.day] },
    { key: "market", label: "시장" },
    { key: "item", label: "품목" },
    { key: "grade", label: "등급", render: r => `<span class="gr gr--${r.grade}">${r.grade}</span>`, sort: r => GRADES.indexOf(r.grade) },
    { key: "origin", label: "산지" },
    { key: "qty", label: "물량 kg", num: true, render: r => fmt(r.qty) },
    { key: "price", label: "단가", num: true, render: r => {
      const d = r.price / (itemAvg[r.item] * GRADE_MUL[r.grade]) - 1;
      return `<span class="${d > 0.1 ? "up" : d < -0.1 ? "down" : ""}">${fmt(r.price)}</span>`;
    } },
    { key: "amount", label: "금액 원", num: true, render: r => (r.amount ? fmt(r.amount) : "—") },
    { key: "status", label: "상태", render: r => `<span class="st st--${r.status}">${r.status}</span>` },
  ];

  /* ---------- state ---------- */
  const state = { q: "", market: "", item: "", status: "", grades: new Set(GRADES), day: -1, sortKey: "day", sortDir: -1 };
  let view = new Int32Array(0);
  let active = -1;

  /* ---------- filters UI ---------- */
  const form = $("[data-filters]");
  const fill = (name, list) => list.forEach(v => form[name].add(new Option(v, v)));
  fill("market", MARKETS); fill("item", ITEM_NAMES); fill("status", STATUSES);
  const gradesEl = $("[data-grades]");
  GRADES.forEach(g => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "g"; b.textContent = g; b.setAttribute("aria-pressed", "true");
    b.setAttribute("aria-label", `${g} 등급 포함`);
    b.addEventListener("click", () => {
      state.grades.has(g) ? state.grades.delete(g) : state.grades.add(g);
      b.setAttribute("aria-pressed", state.grades.has(g));
      update();
    });
    gradesEl.appendChild(b);
  });
  let qTimer;
  form.q.addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = form.q.value.trim(); update(); }, 90); });
  ["market", "item", "status"].forEach(n => form[n].addEventListener("change", () => { state[n] = form[n].value; update(); }));
  form.addEventListener("submit", e => e.preventDefault());
  $("[data-reset]").addEventListener("click", () => {
    form.reset();
    Object.assign(state, { q: "", market: "", item: "", status: "", day: -1, grades: new Set(GRADES) });
    gradesEl.querySelectorAll(".g").forEach(b => b.setAttribute("aria-pressed", "true"));
    update();
  });

  /* ---------- header ---------- */
  const head = $("[data-head]");
  COLS.forEach(c => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "th" + (c.num ? " num" : "");
    b.setAttribute("role", "columnheader");
    b.textContent = c.label;
    b.dataset.key = c.key;
    b.addEventListener("click", () => {
      if (state.sortKey === c.key) state.sortDir *= -1;
      else { state.sortKey = c.key; state.sortDir = c.num ? -1 : 1; }
      update(false);
    });
    head.appendChild(b);
  });

  /* ---------- query ---------- */
  function query() {
    const { q, market, item, status, grades, day } = state;
    const ql = q.toLowerCase();
    const out = [];
    for (let i = 0; i < N; i++) {
      const r = rows[i];
      if (market && r.market !== market) continue;
      if (item && r.item !== item) continue;
      if (status && r.status !== status) continue;
      if (!grades.has(r.grade)) continue;
      if (day >= 0 && r.day !== day) continue;
      if (ql && !(r.item.includes(ql) || r.origin.includes(ql) || r.id.toLowerCase().includes(ql) || r.market.includes(ql))) continue;
      out.push(i);
    }
    const col = COLS.find(c => c.key === state.sortKey);
    const key = col.sort || (r => r[col.key]);
    const dir = state.sortDir;
    out.sort((a, b) => {
      const x = key(rows[a]), y = key(rows[b]);
      return (x < y ? -1 : x > y ? 1 : a - b) * dir;
    });
    return Int32Array.from(out);
  }

  /* ---------- virtual body ---------- */
  const ROW_H = 36;
  const scroller = $("[data-scroll]");
  const body = $("[data-body]");
  const spacer = $("[data-spacer]");
  const pool = [];
  function ensurePool() {
    const need = Math.ceil(scroller.clientHeight / ROW_H) + 12;
    while (pool.length < need) {
      const el = document.createElement("div");
      el.className = "tr"; el.setAttribute("role", "row");
      el.innerHTML = COLS.map(c => `<div role="gridcell" class="td ${c.num ? "num" : ""} ${c.cls || ""}"></div>`).join("");
      el.addEventListener("click", () => { setActive(+el.dataset.v); openDetail(); });
      body.appendChild(el);
      pool.push(el);
    }
    $("[data-dom]").textContent = pool.length;
  }
  function paint() {
    const start = Math.max(0, Math.floor(scroller.scrollTop / ROW_H) - 6);
    pool.forEach((el, k) => {
      const v = start + k;
      if (v >= view.length) { el.style.display = "none"; return; }
      el.style.display = "";
      el.dataset.v = v;
      el.style.transform = `translateY(${v * ROW_H}px)`;
      el.setAttribute("aria-rowindex", v + 2);
      el.classList.toggle("is-active", v === active);
      const r = rows[view[v]];
      const cells = el.children;
      COLS.forEach((c, j) => {
        const html = c.render ? c.render(r) : r[c.key];
        if (cells[j]._h !== html) { cells[j].innerHTML = html; cells[j]._h = html; }
      });
    });
  }
  let raf = 0;
  scroller.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); });
  new ResizeObserver(() => { ensurePool(); paint(); drawChart(); }).observe(scroller);

  /* ---------- aggregates + chart ---------- */
  let daily = new Float64Array(60);
  function aggregate() {
    let q = 0, a = 0;
    daily = new Float64Array(60);
    for (let k = 0; k < view.length; k++) {
      const r = rows[view[k]];
      if (r.amount) { q += r.qty; a += r.amount; }
      const d = r.day - (DAYS - 60);
      if (d >= 0) daily[d] += r.amount;
    }
    $('[data-k="rows"]').textContent = fmt(view.length);
    $('[data-k="of"]').textContent = `of ${fmt(N)} · generated in ${genMs.toFixed(0)}ms`;
    $('[data-k="vol"]').textContent = fmt(Math.round(q / 1000));
    $('[data-k="avg"]').textContent = q ? fmt(Math.round(a / q)) : "—";
    $('[data-k="amt"]').textContent = (a / 1e8).toFixed(1);
  }

  const chart = $("[data-chart]");
  let hoverBar = -1;
  function drawChart() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = chart.clientWidth, h = 70;
    if (!w) return;
    chart.width = w * dpr; chart.height = h * dpr;
    const g = chart.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const max = Math.max(1, ...daily);
    const bw = w / 60;
    for (let i = 0; i < 60; i++) {
      const bh = (daily[i] / max) * (h - 4);
      const sel = state.day === DAYS - 60 + i;
      g.fillStyle = sel ? "#d4ff3a" : i === hoverBar ? "rgba(236,236,228,.8)" : state.day >= 0 ? "rgba(236,236,228,.18)" : "rgba(212,255,58,.55)";
      g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
    }
  }
  const barAt = e => Math.floor(((e.clientX - chart.getBoundingClientRect().left) / chart.clientWidth) * 60);
  chart.addEventListener("pointermove", e => {
    hoverBar = barAt(e);
    const d = DAYS - 60 + hoverBar;
    $("[data-day-label]").textContent = `${DATE_LABELS[d]} · ${(daily[hoverBar] / 1e8).toFixed(2)}억원`;
    drawChart();
  });
  chart.addEventListener("pointerleave", () => {
    hoverBar = -1;
    $("[data-day-label]").textContent = state.day >= 0 ? `filtered: ${DATE_LABELS[state.day]} (click again to clear)` : "— click a bar to filter";
    drawChart();
  });
  chart.addEventListener("click", e => {
    const d = DAYS - 60 + barAt(e);
    state.day = state.day === d ? -1 : d;
    update();
    $("[data-day-label]").textContent = state.day >= 0 ? `filtered: ${DATE_LABELS[state.day]} (click again to clear)` : "— click a bar to filter";
  });

  /* ---------- selection + detail ---------- */
  function setActive(v) {
    active = Math.max(0, Math.min(view.length - 1, v));
    const top = active * ROW_H, bottom = top + ROW_H, headH = head.offsetHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight - headH) scroller.scrollTop = bottom - scroller.clientHeight + headH;
    paint();
  }
  const detail = $("[data-detail]");
  function openDetail() {
    if (active < 0) return;
    const r = rows[view[active]];
    const bench = itemAvg[r.item] * GRADE_MUL[r.grade];
    const lo = bench * 0.6, hi = bench * 1.4;
    const pos = v => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    const diff = (r.price / bench - 1) * 100;
    $("[data-detail-body]").innerHTML = `
      <p class="mono">${r.id} · ${r.status}</p>
      <h2>${r.item} ${r.grade}등급<br><span style="color:var(--fg-3)">${r.origin}</span></h2>
      <dl>
        <div><dt>일자</dt><dd>${DATE_LABELS[r.day]}</dd></div>
        <div><dt>시장</dt><dd>${r.market}</dd></div>
        <div><dt>물량</dt><dd>${fmt(r.qty)} kg</dd></div>
        <div><dt>단가</dt><dd>${fmt(r.price)} 원/kg</dd></div>
        <div><dt>금액</dt><dd>${r.amount ? fmt(r.amount) + " 원" : "— (유찰)"}</dd></div>
      </dl>
      <div class="bench">
        <p>동일 품목·등급 가중평균 대비 <b class="${diff > 0 ? "up" : "down"}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}%</b></p>
        <div class="bench__bar"><i style="left:${pos(bench)}%" title="평균"></i><b style="left:${pos(r.price)}%" title="이 거래"></b></div>
      </div>`;
    detail.hidden = false;
  }
  $("[data-detail-close]").addEventListener("click", () => { detail.hidden = true; scroller.focus(); });
  scroller.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); if (!detail.hidden) openDetail(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); if (!detail.hidden) openDetail(); }
    else if (e.key === "Enter") openDetail();
    else if (e.key === "Escape") detail.hidden = true;
  });

  /* ---------- update cycle ---------- */
  function update(resetScroll = true) {
    const t = performance.now();
    view = query();
    $("[data-ms]").textContent = (performance.now() - t).toFixed(1);
    spacer.style.height = view.length * ROW_H + "px";
    scroller.setAttribute("aria-rowcount", view.length + 1);
    $("[data-empty]").hidden = view.length > 0;
    head.querySelectorAll(".th").forEach(th =>
      th.setAttribute("aria-sort", th.dataset.key === state.sortKey ? (state.sortDir > 0 ? "ascending" : "descending") : "none"));
    if (resetScroll) { scroller.scrollTop = 0; active = -1; detail.hidden = true; }
    aggregate();
    ensurePool();
    paint();
    drawChart();
  }
  update();
})();
