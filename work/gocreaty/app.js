/* GoCreaty — native demo over a real snapshot of the product's trend database.
   Trending feed → per-Short analysis (reach verdict, dimensions, retention, moment map,
   replication) → grounded Q&A over that analysis. Virals topic cloud, top creators. */
(() => {
  "use strict";
  if (location.hash === "#embed") document.documentElement.classList.add("is-embed");

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n | 0);
  const cleanTitle = (t) => t.replace(/#\S+/g, "").replace(/\s+/g, " ").trim() || t;
  const DIMS = ["hook", "script", "cuts", "layout", "captions", "sound", "meme", "emotion", "production"];

  let D, byId, catName;
  const st = { q: "", sort: "rank", cat: 0, view: "trending", topic: 0 };

  fetch("data.json?v=10162030").then((r) => r.json()).then((d) => {
    D = d;
    byId = new Map(d.videos.map((v) => [v.id, v]));
    catName = new Map(d.categories.items.map((c) => [c.id, c.name]));
    d.videos.forEach((v) => { v.reach = d.analyses[v.id]?.reach_verdict?.reach_score ?? 0; v.clean = cleanTitle(v.title); });
    initTrending(); initVirals(); initCreators();
    route();
    addEventListener("hashchange", route);
  });

  /* ---------- routing ---------- */
  function route() {
    const h = location.hash.slice(1);
    const view = ["trending", "virals", "creators"].includes(h) ? h : st.view;
    st.view = view;
    $$(".view").forEach((s) => (s.hidden = s.dataset.view !== view));
    $$(".tabs a").forEach((a) => a.classList.toggle("is-on", a.dataset.tab === view));
    if (view === "virals") layoutCloud();
    closeDetail(true);
  }

  /* ---------- trending ---------- */
  function initTrending() {
    const present = [...new Set(D.videos.map((v) => v.cat))];
    const cats = [[0, "All"], ...D.categories.items.filter((c) => present.includes(c.id)).map((c) => [c.id, c.name])];
    $("[data-cats]").innerHTML = cats.map(([id, n]) => `<button data-c="${id}" aria-pressed="${id === 0}">${esc(n)}</button>`).join("");
    $("[data-cats]").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      st.cat = +b.dataset.c;
      $$("[data-cats] button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderCards();
    });
    $("[data-sort]").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      st.sort = b.dataset.s;
      $$("[data-sort] button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderCards();
    });
    $("[data-q]").addEventListener("input", (e) => { st.q = e.target.value.trim().toLowerCase(); renderCards(); });
    $("[data-cards]").addEventListener("click", (e) => { const c = e.target.closest("[data-id]"); if (c) openDetail(c.dataset.id); });
    renderCards();
  }

  function renderCards() {
    let list = D.videos.filter((v) => (!st.cat || v.cat === st.cat) &&
      (!st.q || v.title.toLowerCase().includes(st.q) || v.creator.toLowerCase().includes(st.q)));
    const key = { rank: (a, b) => a.rank - b.rank, views: (a, b) => b.views - a.views, reach: (a, b) => b.reach - a.reach }[st.sort];
    list = list.slice().sort(key);
    $("[data-count]").textContent = `${list.length} / ${D.videos.length} Shorts`;
    $("[data-cards]").innerHTML = list.length ? list.map((v) => `
      <button class="card" data-id="${v.id}" aria-label="${esc(v.clean)}">
        <img src="https://i.ytimg.com/vi/${v.yt}/${v.th}.jpg" alt="" loading="lazy" decoding="async" onerror="this.src='https://i.ytimg.com/vi/${v.yt}/hqdefault.jpg';this.onerror=null">
        <span class="card__rank">#${v.rank}</span>
        <span class="card__reach" title="Reach score">${v.reach}</span>
        <span class="card__meta">
          <span class="card__title">${esc(v.clean)}</span>
          <span class="card__stats"><span><b>${fmt(v.views)}</b> views</span><span>${esc(v.creator)}</span></span>
        </span>
      </button>`).join("") : `<p class="empty mono">No Shorts match “${esc(st.q)}”</p>`;
  }

  /* ---------- detail ---------- */
  let lastFocus = null;
  function openDetail(id) {
    const v = byId.get(id), a = D.analyses[id];
    if (!v || !a) return;
    lastFocus = document.activeElement;
    const rv = a.reach_verdict, sw = a.swipe_prediction;
    const eng = ((v.likes + v.comments) / Math.max(1, v.views) * 100).toFixed(2);
    const body = $("[data-detail-body]");
    body.innerHTML = `
      <div class="dhead">
        <div>
          <p class="mono" style="margin:0 0 6px;color:var(--fg-3)">#${v.rank} trending · ${esc(catName.get(v.cat) || "")} · ${esc(a.genre?.primary || "")} · ${v.dur}s</p>
          <h1>${esc(v.clean)}</h1>
          <p class="who">${v.avatar ? `<img src="${esc(v.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${esc(v.creator)}</p>
        </div>
        <button class="close" data-close>Close · Esc</button>
      </div>
      <div class="dgrid">
        <div class="left">
          <div class="player" data-player>
            <img src="https://i.ytimg.com/vi/${v.yt}/${v.th}.jpg" alt="" onerror="this.src='https://i.ytimg.com/vi/${v.yt}/hqdefault.jpg';this.onerror=null">
            <button data-play aria-label="Play on YouTube"><span>▶</span></button>
          </div>
          <div>
            <div class="kpis">
              <div class="kpi"><span>Views</span><b>${fmt(v.views)}</b></div>
              <div class="kpi"><span>Likes</span><b>${fmt(v.likes)}</b></div>
              <div class="kpi"><span>Engage</span><b>${eng}%</b></div>
            </div>
            <div class="panel" style="margin-top:8px">
              <h2><span>View velocity</span><b data-vel></b></h2>
              <svg class="chart" data-velchart viewBox="0 0 300 120" preserveAspectRatio="none"></svg>
            </div>
          </div>
        </div>

        <div class="right">
          <div class="panel">
            <h2><span>Reach verdict</span><b>${esc(rv.band)}</b></h2>
            <div class="verdict">
              <div class="ring" data-ring></div>
              <div>
                <span class="verdict__band">${sw.predicted_viewed_pct}% predicted watch · hook swipe risk ${esc(sw.hook_swipe_risk)}</span>
                <p class="verdict__head">${esc(rv.headline)}</p>
                <p>${esc(rv.mechanism)} ${esc(rv.limiting_factor)}</p>
                <div class="dim-note" data-dimnote>Hover a segment of the ring to read that dimension.</div>
              </div>
            </div>
          </div>

          <div class="panel">
            <h2><span>Why it's trending</span><b>confidence</b></h2>
            <div class="factors">${a.why_trending.map((f) => `
              <div class="factor"><b>${esc(f.factor)}</b><p>${esc(f.detail)}</p><span>${Math.round(f.confidence * 100)}%<i style="--w:${f.confidence * 100}%"></i></span></div>`).join("")}
            </div>
          </div>

          <div class="two">
            <div class="panel">
              <h2><span>Predicted retention</span><b data-ret>${sw.predicted_viewed_pct}% viewed</b></h2>
              <svg class="chart" data-retchart viewBox="0 0 300 150" preserveAspectRatio="none"></svg>
              <p class="mono" data-retnote style="margin:10px 0 0;color:var(--fg-2);text-transform:none;letter-spacing:0;font-size:14px;min-height:34px"></p>
            </div>
            <div class="panel">
              <h2><span>Moment map</span><b>${v.dur}s</b></h2>
              <div class="timeline">${a.moment_map.map((m) => `
                <div class="beat"><span>${esc(m.t)}</span><b>${esc(m.role[0].toUpperCase() + m.role.slice(1))}</b><p>${esc(m.beat)}</p></div>`).join("")}
              </div>
            </div>
          </div>

          <div class="two">
            <div class="panel">
              <h2><span>Make your own</span><b data-stepcount>0/${a.replication_steps.length}</b></h2>
              <ol class="steps" data-steps>${a.replication_steps.map((s) => `<li tabindex="0">${esc(s)}</li>`).join("")}</ol>
              <div class="tags">${a.techniques.map((t) => `<span title="${esc(t.detail)}">${esc(t.name)}</span>`).join("")}</div>
            </div>
            <div class="panel">
              <h2><span>Ask about this Short</span><b>grounded</b></h2>
              <div class="chat">
                <div class="chat__log" data-log aria-live="polite"></div>
                <div class="chips" data-chips>
                  ${["Why is it trending?", "How do I fix it?", "Where do viewers drop?", "Who is it for?", "훅이 왜 좋아?"].map((q) => `<button>${q}</button>`).join("")}
                </div>
                <form class="ask" data-ask><input placeholder="Ask about hook, retention, sound, thumbnail…" aria-label="질문"><button aria-label="Send">↵</button></form>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const det = $("[data-detail]");
    det.hidden = false; det.scrollTop = 0;
    document.body.style.overflow = "hidden";
    drawRing($("[data-ring]", body), a, rv.reach_score);
    drawVelocity(v, D.snapshots[id] || []);
    drawRetention(a.predicted_retention, v.dur);

    $("[data-close]", body).onclick = () => closeDetail();
    $("[data-play]", body).onclick = () => {
      $("[data-player]", body).innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.yt}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="${esc(v.clean)}"></iframe>`;
    };
    const steps = $("[data-steps]", body);
    const toggle = (li) => { li.classList.toggle("done"); $("[data-stepcount]", body).textContent = `${$$(".done", steps).length}/${a.replication_steps.length}`; };
    steps.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) toggle(li); });
    steps.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("li")) { e.preventDefault(); toggle(e.target); } });

    const log = $("[data-log]", body);
    const ask = (q) => { if (!q.trim()) return; say(log, "me", q); answer(log, q, v, a); };
    $("[data-chips]", body).addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { ask(b.textContent); b.remove(); } });
    $("[data-ask]", body).addEventListener("submit", (e) => { e.preventDefault(); const i = e.target.querySelector("input"); ask(i.value); i.value = ""; });
    $("[data-close]", body).focus({ preventScroll: true });
  }

  function closeDetail(silent) {
    const det = $("[data-detail]");
    if (det.hidden) return;
    det.hidden = true;
    $("[data-detail-body]").innerHTML = "";
    document.body.style.overflow = "";
    if (!silent && lastFocus) lastFocus.focus({ preventScroll: true });
  }
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  /* reach ring: one wedge per dimension, length = score */
  function drawRing(el, a, score) {
    const n = DIMS.length, r0 = 52, r1 = 96, gap = 0.035;
    const pt = (r, t) => [r * Math.sin(t), -r * Math.cos(t)];
    const arc = (ra, rb, t0, t1) => {
      const [x0, y0] = pt(rb, t0), [x1, y1] = pt(rb, t1), [x2, y2] = pt(ra, t1), [x3, y3] = pt(ra, t0);
      return `M${x0} ${y0}A${rb} ${rb} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${ra} ${ra} 0 0 0 ${x3} ${y3}Z`;
    };
    let svg = `<svg viewBox="-125 -125 250 250">`;
    DIMS.forEach((k, i) => {
      const d = a.dimensions[k]; if (!d) return;
      const t0 = (i / n) * Math.PI * 2 + gap, t1 = ((i + 1) / n) * Math.PI * 2 - gap, tm = (t0 + t1) / 2;
      const rr = r0 + (r1 - r0) * d.score / 100;
      const [lx, ly] = pt(r1 + 16, tm);
      const col = d.score >= 85 ? "var(--accent)" : d.score >= 70 ? "rgba(212,255,58,.55)" : "rgba(236,236,228,.3)";
      svg += `<path d="${arc(r0, r1, t0, t1)}" fill="rgba(236,236,228,.05)"/>`;
      svg += `<path data-k="${k}" d="${arc(r0, rr, t0, t1)}" fill="${col}"><title>${k} ${d.score}</title></path>`;
      svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${k[0].toUpperCase() + k.slice(1)}</text>`;
    });
    el.innerHTML = svg + `</svg><div class="ring__score"><div><b>${score}</b><small>REACH</small></div></div>`;
    const note = $("[data-dimnote]");
    const show = (k) => {
      const d = a.dimensions[k];
      $$("path[data-k]", el).forEach((p) => (p.style.opacity = p.dataset.k === k ? 1 : 0.35));
      note.innerHTML = `<b>${k[0].toUpperCase() + k.slice(1)} · ${d.score} · ${esc(d.band)}</b><br>${esc(d.notes)}`;
    };
    $$("path[data-k]", el).forEach((p) => {
      p.addEventListener("mouseenter", () => show(p.dataset.k));
      p.addEventListener("click", () => show(p.dataset.k));
    });
    el.addEventListener("mouseleave", () => $$("path[data-k]", el).forEach((p) => (p.style.opacity = 1)));
    const weakest = DIMS.filter((k) => a.dimensions[k]).sort((x, y) => a.dimensions[x].score - a.dimensions[y].score)[0];
    show(weakest);
  }

  function drawVelocity(v, snaps) {
    const svg = $("[data-velchart]");
    if (snaps.length < 2) { svg.innerHTML = ""; return; }
    const t = snaps.map((s) => Date.parse(s[0] + ":00Z")), y = snaps.map((s) => s[1]);
    const t0 = t[0], t1 = t[t.length - 1], y0 = Math.min(...y), y1 = Math.max(...y);
    const X = (x) => ((x - t0) / (t1 - t0 || 1)) * 300, Y = (q) => 112 - ((q - y0) / (y1 - y0 || 1)) * 100;
    const line = t.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(y[i]).toFixed(1)}`).join("");
    svg.innerHTML = `<path d="${line}L300 120L0 120Z" fill="rgba(212,255,58,.08)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    const hours = (t1 - t0) / 36e5;
    $("[data-vel]").textContent = `+${fmt(y1 - y0)} in ${hours.toFixed(0)}h`;
  }

  function drawRetention(pts, dur) {
    const svg = $("[data-retchart]"), note = $("[data-retnote]");
    const sec = (s) => { const [m, x] = s.split(":").map(Number); return m * 60 + x; };
    const P = pts.map((p) => ({ x: (sec(p.t) / Math.max(dur, 1)) * 300, y: 140 - p.level * 1.3, ...p }));
    const d = P.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
    svg.innerHTML = `<path d="${d}L${P[P.length - 1].x} 150L0 150Z" fill="rgba(212,255,58,.08)"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <line data-cur x1="0" x2="0" y1="0" y2="150" stroke="rgba(236,236,228,.4)" vector-effect="non-scaling-stroke"/>`;
    const cur = $("[data-cur]", svg);
    const pick = (i) => { const p = P[i]; cur.setAttribute("x1", p.x); cur.setAttribute("x2", p.x); note.textContent = `${p.t} · ${p.level}% still watching — ${p.note}`; };
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 300;
      let bi = 0; P.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(P[bi].x - x)) bi = i; });
      pick(bi);
    });
    const low = P.reduce((m, p, i) => (p.level < P[m].level ? i : m), 0);
    pick(low);
  }

  /* ---------- grounded Q&A: every answer is assembled from this Short's analysis record ---------- */
  function say(log, who, text, src) {
    const b = document.createElement("div");
    b.className = `bubble ${who}`;
    log.appendChild(b);
    if (who === "me") { b.textContent = text; log.scrollTop = log.scrollHeight; return; }
    b.classList.add("typing");
    let i = 0;
    const step = () => {
      i = Math.min(text.length, i + 3);
      b.textContent = text.slice(0, i);
      log.scrollTop = log.scrollHeight;
      if (i < text.length) setTimeout(step, 12);
      else { b.classList.remove("typing"); if (src) { const s = document.createElement("small"); s.className = "mono"; s.style.cssText = "display:block;margin-top:8px;color:var(--fg-3)"; s.textContent = "↳ " + src; b.appendChild(s); } }
    };
    step();
  }

  function answer(log, q, v, a) {
    const t = q.toLowerCase();
    const has = (...w) => w.some((x) => t.includes(x));
    const rv = a.reach_verdict, sw = a.swipe_prediction, dm = a.dimensions;
    let text, src;
    if (has("drop", "retention", "swipe", "이탈", "리텐션", "넘기", "시청")) {
      const dr = sw.drops?.[0];
      text = `Predicted ${sw.predicted_viewed_pct}% viewed, hook swipe risk ${sw.hook_swipe_risk}. ${sw.verdict}` +
        (dr ? `\n\nBiggest drop at ${dr.t} (${dr.severity}): ${dr.cause}\nFix: ${dr.fix}` : "");
      src = "swipe_prediction";
    } else if (has("fix", "improve", "better", "weak", "개선", "고치", "약점", "부족")) {
      text = `${rv.limiting_factor}\n\nOne fix: ${rv.one_fix}` + (rv.top_fixes?.[1] ? `\nThen: ${rv.top_fixes[1]}` : "");
      src = "reach_verdict.limiting_factor · one_fix";
    } else if (has("hook", "훅", "처음", "시작", "first")) {
      const m = a.moment_map[0];
      text = `Hook scores ${dm.hook.score} (${dm.hook.band}). ${dm.hook.notes}\n\nAt ${m.t}: ${m.beat}`;
      src = "dimensions.hook · moment_map[0]";
    } else if (has("copy", "replicate", "make", "따라", "만들", "how do i")) {
      text = a.replication_steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
      src = "replication_steps";
    } else if (has("sound", "music", "audio", "음악", "사운드", "소리")) {
      const tech = a.techniques.filter((x) => x.category === "audio").map((x) => `${x.name}: ${x.detail}`).join("\n");
      text = `Sound scores ${dm.sound.score} (${dm.sound.band}). ${dm.sound.notes}` + (tech ? `\n\n${tech}` : "");
      src = "dimensions.sound · techniques";
    } else if (has("thumb", "썸네일", "cover")) {
      text = a.thumbnail_tip; src = "thumbnail_tip";
    } else if (has("who", "audience", "타겟", "누구", "시청자")) {
      text = `${a.audience.target}. Why it lands: ${a.audience.appeal}.\nTarget feeling: ${a.vibe.target_feeling}.`;
      src = "audience · vibe";
    } else if (has("gear", "camera", "production", "장비", "촬영", "편집", "cost")) {
      const p = a.production_style;
      text = `Effort: ${p.effort}. Setup: ${p.setup}. Replicable by ${p.replicable_by}.`;
      src = "production_style";
    } else if (has("score", "점수", "reach")) {
      const top = DIMS.filter((k) => dm[k]).sort((x, y) => dm[y].score - dm[x].score);
      text = `Reach ${rv.reach_score} (${rv.band}). Strongest: ${top.slice(0, 2).map((k) => `${k} ${dm[k].score}`).join(", ")}. Weakest: ${top.slice(-2).map((k) => `${k} ${dm[k].score}`).join(", ")}.`;
      src = "reach_verdict · dimensions";
    } else if (has("why", "trend", "viral", "왜", "뜨", "인기")) {
      const f = a.why_trending.slice().sort((x, y) => y.confidence - x.confidence).slice(0, 2);
      text = f.map((x) => `${x.factor} (${Math.round(x.confidence * 100)}%): ${x.detail}`).join("\n\n") +
        `\n\n${fmt(v.views)} views at ${fmt(a.signals.velocity_vph)}/h — ${a.signals.z_score}σ above its category.`;
      src = "why_trending · signals";
    } else {
      text = `I only answer from this Short's analysis, and that question isn't covered. Try: hook, retention, fixes, sound, thumbnail, audience, or how to make one.`;
      src = null;
    }
    setTimeout(() => say(log, "ai", text, src), 260);
  }

  /* ---------- virals: topic cloud ---------- */
  function initVirals() {
    $("[data-vtotal]").textContent = D.total_videos || D.videos.length;
    const max = Math.log(D.topics[0].views), min = Math.log(D.topics[D.topics.length - 1].views);
    $("[data-cloud]").innerHTML = D.topics.map((t, i) => {
      const k = (Math.log(t.views) - min) / (max - min || 1);
      return `<button data-t="${i}" style="font-size:${(13 + k * k * 46).toFixed(1)}px">${esc(t.topic)}</button>`;
    }).join("");
    $("[data-cloud]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pickTopic(+b.dataset.t); });
    $("[data-topic]").addEventListener("click", (e) => { const x = e.target.closest("[data-open]"); if (x) { e.preventDefault(); openDetail(x.dataset.open); } });
    addEventListener("resize", () => { if (st.view === "virals") layoutCloud(); });
    pickTopic(0);
  }

  // spiral placement with rectangle collision, biggest words first
  function layoutCloud() {
    const box = $("[data-cloud]"), W = box.clientWidth, H = box.clientHeight;
    if (!W) return;
    const placed = [];
    const hit = (r) => placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    $$("button", box).forEach((b) => {
      const w = b.offsetWidth + 10, h = b.offsetHeight + 6;
      let a = 0, ok = null;
      for (let s = 0; s < 4000 && !ok; s++) {
        a += 0.11;
        const rad = 4 * a;
        const cx = W / 2 + rad * Math.cos(a) * (W / H), cy = H / 2 + rad * Math.sin(a);
        const r = { x: cx - w / 2, y: cy - h / 2, w, h };
        if (r.x < 0 || r.y < 0 || r.x + w > W || r.y + h > H) continue;
        if (!hit(r)) ok = r;
      }
      if (ok) { placed.push(ok); b.style.left = ok.x + w / 2 + "px"; b.style.top = ok.y + h / 2 + "px"; b.style.visibility = ""; }
      else b.style.visibility = "hidden";
    });
  }

  function pickTopic(i) {
    st.topic = i;
    const t = D.topics[i];
    $("[data-cloud]").classList.add("has-pick");
    $$("[data-cloud] button").forEach((b) => b.classList.toggle("is-on", +b.dataset.t === i));
    const ytPct = (t.yt / Math.max(1, t.yt + t.tt)) * 100;
    const yt = t.examples.filter((x) => byId.has(x.id)), tt = t.examples.filter((x) => !byId.has(x.id));
    $("[data-topic]").innerHTML = `
      <p class="mono">Topic · #${i + 1} by views</p>
      <h2>${esc(t.topic)}</h2>
      <div class="tstats">
        <div class="kpi"><span>Videos</span><b>${t.count}</b></div>
        <div class="kpi"><span>Total views</span><b>${fmt(t.views)}</b></div>
        <div class="kpi"><span>Median</span><b>${fmt(t.median)}</b></div>
        <div class="kpi"><span>Creators</span><b>${t.creators.length}</b></div>
      </div>
      <p class="mono" style="display:flex;justify-content:space-between;margin:0"><span style="color:var(--accent)">YouTube ${t.yt}</span><span style="color:#5ec8ff">TikTok ${t.tt}</span></p>
      <div class="split"><i style="width:${ytPct}%"></i></div>
      ${yt.length ? `<p class="mono" style="margin:0 0 8px">Top YouTube examples</p>
      <div class="ex">${yt.slice(0, 3).map((x) => { const v = byId.get(x.id);
        return `<a href="#" data-open="${x.id}" title="${esc(cleanTitle(x.title))}"><img src="https://i.ytimg.com/vi/${v.yt}/${v.th}.jpg" alt="" loading="lazy"><span>${fmt(x.views)}</span></a>`; }).join("")}</div>` : ""}
      ${tt.length ? `<p class="mono" style="margin:16px 0 6px">Top TikTok examples</p>
      <ul class="ttl">${tt.slice(0, 3).map((x) => `<li><span>${esc(cleanTitle(x.title))}</span><b class="mono">${fmt(x.views)}</b></li>`).join("")}</ul>` : ""}
      ${t.creators.length ? `<p class="mono" style="margin:16px 0 6px">Creators</p><p style="margin:0;color:var(--fg-2);font-size:13px">${t.creators.slice(0, 8).map(esc).join(" · ")}</p>` : ""}`;
  }

  /* ---------- creators ---------- */
  function initCreators() {
    const list = D.creators.youtube.slice().sort((a, b) => b.trending_views - a.trending_views);
    const max = list[0]?.trending_views || 1;
    $("[data-board]").innerHTML = list.map((c, i) => `
      <li tabindex="0" data-c="${esc(c.creator_name)}">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        ${c.creator_avatar_url ? `<img src="${esc(c.creator_avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="av">${esc(c.creator_name[0])}</span>`}
        <div><b>${esc(c.creator_name)}</b><small>${fmt(c.follower_count)} subscribers · ${c.trending_video_count} trending</small>
          <div class="bar2"><i style="width:${(c.trending_views / max) * 100}%"></i></div></div>
        <div class="v">${fmt(c.trending_views)}<small class="mono">trending views</small></div>
      </li>`).join("");
    const go = (li) => {
      st.q = li.dataset.c.toLowerCase(); $("[data-q]").value = li.dataset.c;
      location.hash = "trending"; renderCards();
    };
    $("[data-board]").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) go(li); });
    $("[data-board]").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("li")) go(e.target); });
  }
})();
