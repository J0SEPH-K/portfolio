// Grid 100K — 100,000 rows, a fixed pool of ~40 DOM rows, filters/sort/aggregates
// recomputed on every change, and a chart that is also a filter.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  if (location.hash === "#embed" || new URLSearchParams(location.search).has("embed")) document.body.classList.add("is-embed");

  /* ---------- deterministic sample data ---------- */
  let seed = 20261016;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = a => a[(rnd() * a.length) | 0];

  const MARKETS = ["Garak", "Gangseo", "Guri", "Eomgung", "Banyeo", "Daegu North", "Gwangju Gakhwa"];
  const ITEMS = {
    Apple: { p: 3800, o: ["Cheongsong, N. Gyeongsang", "Yeongju, N. Gyeongsang", "Chungju, N. Chungcheong", "Geochang, S. Gyeongsang"] },
    Pear: { p: 3200, o: ["Naju, S. Jeolla", "Cheonan, S. Chungcheong", "Anseong, Gyeonggi"] },
    Mandarin: { p: 2400, o: ["Seogwipo, Jeju", "Jeju City, Jeju"] },
    Strawberry: { p: 9800, o: ["Nonsan, S. Chungcheong", "Jinju, S. Gyeongsang", "Damyang, S. Jeolla"] },
    Grape: { p: 6200, o: ["Gimcheon, N. Gyeongsang", "Yeongdong, N. Chungcheong", "Sangju, N. Gyeongsang"] },
    Onion: { p: 900, o: ["Muan, S. Jeolla", "Changnyeong, S. Gyeongsang"] },
    Cabbage: { p: 700, o: ["Pyeongchang, Gangwon", "Haenam, S. Jeolla"] },
    Potato: { p: 1500, o: ["Gangneung, Gangwon", "Mungyeong, N. Gyeongsang"] },
    Garlic: { p: 5200, o: ["Uiseong, N. Gyeongsang", "Seosan, S. Chungcheong"] },
    "Chili pepper": { p: 7400, o: ["Yeongyang, N. Gyeongsang", "Goesan, N. Chungcheong"] },
  };
  const ITEM_NAMES = Object.keys(ITEMS);
  const GRADES = ["AA", "A", "B", "C"];
  const GRADE_MUL = { AA: 1.25, A: 1.0, B: 0.82, C: 0.65 };
  const STATUSES = ["Sold", "Settled", "No sale"];
  const slug = s => s.toLowerCase().replace(/\s+/g, "-");
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
    const g = rnd(), grade = g < 0.18 ? "AA" : g < 0.58 ? "A" : g < 0.88 ? "B" : "C";
    const drift = 1 + 0.12 * Math.sin((day / DAYS) * Math.PI * 2 + item.length) + (rnd() - 0.5) * 0.18;
    const price = Math.round((it.p * GRADE_MUL[grade] * drift) / 10) * 10;
    const qty = Math.round((40 + rnd() ** 2 * 2400) / 5) * 5;
    const s = rnd(), status = s < 0.05 ? "No sale" : s < 0.32 && day < DAYS - 3 ? "Settled" : "Sold";
    rows[i] = {
      id: "T" + String(1000000 + i * 7 + ((rnd() * 7) | 0)).slice(1),
      day, market: pick(MARKETS), item, grade, origin: pick(it.o),
      qty, price, amount: status === "No sale" ? 0 : qty * price, status,
    };
  }
  const genMs = performance.now() - t0;

  // per-item weighted average price, used to flag outliers and in the detail benchmark
  const itemAvg = {};
  ITEM_NAMES.forEach(n => (itemAvg[n] = { q: 0, a: 0 }));
  rows.forEach(r => { if (r.amount) { itemAvg[r.item].q += r.qty; itemAvg[r.item].a += r.amount; } });
  ITEM_NAMES.forEach(n => (itemAvg[n] = itemAvg[n].a / itemAvg[n].q));

  /* ---------- columns ---------- */
  const fmt = n => n.toLocaleString("en-US");
  // highlight the search term inside a cell
  const hl = v => {
    const q = state.q.trim();
    if (!q) return v;
    const i = String(v).toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? v : `${String(v).slice(0, i)}<mark>${String(v).slice(i, i + q.length)}</mark>${String(v).slice(i + q.length)}`;
  };
  const COLS = [
    { key: "id", label: "Trade ID", cls: "id", render: r => hl(r.id) },
    { key: "day", label: "Date", render: r => DATE_LABELS[r.day] },
    { key: "market", label: "Market", render: r => hl(r.market) },
    { key: "item", label: "Item", render: r => hl(r.item) },
    { key: "grade", label: "Grade", render: r => `<span class="gr gr--${r.grade}">${r.grade}</span>`, sort: r => GRADES.indexOf(r.grade) },
    { key: "origin", label: "Origin", render: r => hl(r.origin) },
    { key: "qty", label: "Qty kg", num: true, render: r => fmt(r.qty) },
    { key: "price", label: "₩/kg", num: true, render: r => {
      const d = r.price / (itemAvg[r.item] * GRADE_MUL[r.grade]) - 1;
      return `<span class="${d > 0.1 ? "up" : d < -0.1 ? "down" : ""}">${fmt(r.price)}</span>`;
    } },
    { key: "amount", label: "Amount ₩", num: true, render: r => (r.amount ? fmt(r.amount) : "—") },
    { key: "status", label: "Status", render: r => `<span class="st st--${slug(r.status)}">${r.status}</span>` },
  ];

  /* ---------- state ---------- */
  const state = { q: "", market: "", item: "", status: "", grades: new Set(GRADES), range: null, sortKey: "day", sortDir: -1 };
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
    b.setAttribute("aria-label", `Include grade ${g}`);
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
    Object.assign(state, { q: "", market: "", item: "", status: "", range: null, grades: new Set(GRADES) });
    gradesEl.querySelectorAll(".g").forEach(b => b.setAttribute("aria-pressed", "true"));
    update();
    $("[data-day-label]").textContent = "— drag to select days";
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
    const { q, market, item, status, grades, range } = state;
    const ql = q.toLowerCase();
    const out = [];
    for (let i = 0; i < N; i++) {
      const r = rows[i];
      if (market && r.market !== market) continue;
      if (item && r.item !== item) continue;
      if (status && r.status !== status) continue;
      if (!grades.has(r.grade)) continue;
      if (range && (r.day < range[0] || r.day > range[1])) continue;
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
    const byItem = {};
    daily = new Float64Array(60);
    for (let k = 0; k < view.length; k++) {
      const r = rows[view[k]];
      if (r.amount) { q += r.qty; a += r.amount; byItem[r.item] = (byItem[r.item] || 0) + r.amount; }
      const d = r.day - (DAYS - 60);
      if (d >= 0) daily[d] += r.amount;
    }
    $('[data-k="rows"]').textContent = fmt(view.length);
    $('[data-k="of"]').textContent = `of ${fmt(N)} · generated in ${genMs.toFixed(0)}ms`;
    $('[data-k="vol"]').textContent = fmt(Math.round(q / 1000));
    $('[data-k="avg"]').textContent = q ? fmt(Math.round(a / q)) : "—";
    $('[data-k="amt"]').textContent = "₩" + (a / 1e9).toFixed(1) + "B";
    renderTop(byItem);
  }

  const chart = $("[data-chart]");
  const label = $("[data-day-label]");
  let hoverBar = -1, brush = null;            // brush: [startBar, endBar] while dragging
  const OFF = DAYS - 60;
  function drawChart() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = chart.clientWidth, h = 70;
    if (!w) return;
    chart.width = w * dpr; chart.height = h * dpr;
    const g = chart.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const max = Math.max(1, ...daily), bw = w / 60;
    const sel = brush ? [Math.min(...brush), Math.max(...brush)] : state.range ? [state.range[0] - OFF, state.range[1] - OFF] : null;
    if (sel) { g.fillStyle = "rgba(212,255,58,.08)"; g.fillRect(sel[0] * bw, 0, (sel[1] - sel[0] + 1) * bw, h); }
    for (let i = 0; i < 60; i++) {
      const bh = (daily[i] / max) * (h - 4);
      const inSel = sel && i >= sel[0] && i <= sel[1];
      g.fillStyle = inSel ? "#d4ff3a" : i === hoverBar ? "rgba(236,236,228,.8)" : sel ? "rgba(236,236,228,.18)" : "rgba(212,255,58,.55)";
      g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
    }
  }
  const barAt = e => Math.max(0, Math.min(59, Math.floor(((e.clientX - chart.getBoundingClientRect().left) / chart.clientWidth) * 60)));
  const rangeText = () => state.range
    ? `${DATE_LABELS[state.range[0]]}${state.range[1] !== state.range[0] ? " → " + DATE_LABELS[state.range[1]] : ""} · double-click to clear`
    : "— drag to select days";
  chart.addEventListener("pointerdown", e => { chart.setPointerCapture(e.pointerId); brush = [barAt(e), barAt(e)]; drawChart(); });
  chart.addEventListener("pointermove", e => {
    hoverBar = barAt(e);
    if (brush) {
      brush[1] = hoverBar;
      const a = Math.min(...brush), b = Math.max(...brush);
      label.textContent = `${DATE_LABELS[OFF + a]} → ${DATE_LABELS[OFF + b]} · ${b - a + 1} days`;
    } else label.textContent = `${DATE_LABELS[OFF + hoverBar]} · ₩${(daily[hoverBar] / 1e9).toFixed(2)}B`;
    drawChart();
  });
  chart.addEventListener("pointerup", () => {
    if (!brush) return;
    const a = Math.min(...brush) + OFF, b = Math.max(...brush) + OFF;
    const same = state.range && state.range[0] === a && state.range[1] === b;
    state.range = same ? null : [a, b];
    brush = null;
    update();
    label.textContent = rangeText();
  });
  chart.addEventListener("dblclick", () => { state.range = null; update(); label.textContent = rangeText(); });
  chart.addEventListener("pointerleave", () => { hoverBar = -1; if (!brush) label.textContent = rangeText(); drawChart(); });

  /* ---------- top items for the current filter ---------- */
  function renderTop(byItem) {
    const rows = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 5), max = rows[0]?.[1] || 1;
    const ol = $("[data-top]");
    ol.innerHTML = rows.map(([k, v]) => `<li data-item="${k}"><span>${k}</span><i style="transform:scaleX(${(v / max).toFixed(3)})"></i><b>₩${(v / 1e9).toFixed(1)}B</b></li>`).join("");
    ol.querySelectorAll("li").forEach(li => (li.onclick = () => {
      const v = li.dataset.item;
      state.item = state.item === v ? "" : v;
      $("[data-filters]").item.value = state.item;
      update();
    }));
  }

  /* ---------- CSV export of exactly what's filtered ---------- */
  $("[data-export]").addEventListener("click", () => {
    const head = ["id", "date", "market", "item", "grade", "origin", "qty_kg", "price_krw_per_kg", "amount_krw", "status"];
    const lines = [head.join(",")];
    for (let k = 0; k < view.length; k++) {
      const r = rows[view[k]];
      lines.push([r.id, DATE_LABELS[r.day], r.market, r.item, r.grade, `"${r.origin}"`, r.qty, r.price, r.amount, r.status].join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grid-100k_${view.length}rows.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
      <h2>${r.item} · grade ${r.grade}<br><span style="color:var(--fg-3)">${r.origin}</span></h2>
      <dl>
        <div><dt>Date</dt><dd>${DATE_LABELS[r.day]}</dd></div>
        <div><dt>Market</dt><dd>${r.market}</dd></div>
        <div><dt>Quantity</dt><dd>${fmt(r.qty)} kg</dd></div>
        <div><dt>Price</dt><dd>₩${fmt(r.price)}/kg</dd></div>
        <div><dt>Amount</dt><dd>${r.amount ? "₩" + fmt(r.amount) : "— (no sale)"}</dd></div>
      </dl>
      <div class="bench">
        <p>Versus the weighted average for this item and grade: <b class="${diff > 0 ? "up" : "down"}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}%</b></p>
        <div class="bench__bar"><i style="left:${pos(bench)}%" title="Average"></i><b style="left:${pos(r.price)}%" title="This trade"></b></div>
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
