// RAG Desk — the UI contract of a grounded chatbot, running fully client-side:
// rewrite → BM25 retrieve → rerank → extractive compose, streamed with citations.
// When nothing in the index supports an answer, it says so instead of guessing.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  if (location.hash === "#embed" || new URLSearchParams(location.search).has("embed")) document.body.classList.add("is-embed");
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- tokenizer: words + Hangul bigrams ---------- */
  const STOP = new Set(["어떻", "떻게", "해야", "하나", "나요", "뭐야", "인가", "가요", "는지", "있나", "얼마", "마나", "무엇", "엇인",
    "알려", "려줘", "합니", "니까", "까요", "되나", "되요", "돼요", "는데", "은데", "하면", "해요", "주세", "세요", "그럼", "그러", "러면", "그건", "그거", "이때", "경우"]);
  function tokens(text) {
    const out = [];
    text.toLowerCase().split(/[^0-9a-z가-힣℃%]+/).forEach(w => {
      if (!w) return;
      if (/[가-힣]/.test(w)) {
        if (w.length === 1) return;
        for (let i = 0; i < w.length - 1; i++) {
          const bg = w.slice(i, i + 2);
          if (!STOP.has(bg)) out.push(bg);
        }
      } else if (w.length >= 1) out.push(w);
    });
    return out;
  }

  /* ---------- index ---------- */
  const chunks = [];
  CORPUS.forEach(doc => doc.chunks.forEach((text, i) => chunks.push({ doc, i, text, toks: tokens(text) })));
  const N = chunks.length;
  const avgdl = chunks.reduce((a, c) => a + c.toks.length, 0) / N;
  const df = new Map();
  chunks.forEach(c => new Set(c.toks).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  chunks.forEach(c => { c.tf = new Map(); c.toks.forEach(t => c.tf.set(t, (c.tf.get(t) || 0) + 1)); });
  $("[data-index-size]").textContent = N;

  function bm25(qt, own = new Set(qt)) {
    const k1 = 1.2, b = 0.75;
    const uniq = [...new Set(qt)];
    return chunks.map(c => {
      let s = 0;
      uniq.forEach(t => {
        const f = c.tf.get(t); if (!f) return;
        const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
        // the user's own words outweigh terms inherited from the previous turn
        s += (own.has(t) ? 1 : 0.5) * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.toks.length) / avgdl));
      });
      const cover = uniq.filter(t => c.tf.has(t)).length / Math.max(1, uniq.length);
      const ownHit = [...own].some(t => c.tf.has(t));
      return { c, score: s, cover, ownHit };
    }).sort((a, b) => b.score - a.score);
  }

  const sentences = text => text.match(/[^.]+[.]?/g).map(s => s.trim()).filter(Boolean);

  /* ---------- conversation state ---------- */
  let lastQueryTerms = [];
  let busy = false;
  let turnSources = [];
  const log = $("[data-log]");

  function rewrite(q) {
    const followUp = q.replace(/[\s?？!.]/g, "").length <= 6 || /^(그럼|그러면|그건|그거|그때|이때|그 경우|왜|더|자세히)/.test(q.trim());
    if (followUp && lastQueryTerms.length) return { text: `${q} (${lastQueryTerms.join(" ")})`, rewritten: true };
    return { text: q, rewritten: false };
  }
  const topicTerms = q => q.split(/\s+/).filter(w => /[가-힣]{2,}/.test(w) && !/^(어떻게|무엇|얼마나|언제|하나요|뭐야|있나요|알려줘|해야)/.test(w)).slice(0, 3)
    .map(w => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|이면|면)$/, ""));

  /* ---------- rendering ---------- */
  function addUser(q) {
    $("[data-empty]")?.remove();
    const el = document.createElement("div");
    el.className = "msg msg--user";
    el.textContent = q;
    log.appendChild(el);
    scroll();
  }
  function addAssistant() {
    const el = document.createElement("div");
    el.className = "msg msg--bot";
    el.innerHTML = `<ol class="pipe mono"></ol><div class="answer"></div>`;
    log.appendChild(el);
    scroll();
    return el;
  }
  const scroll = () => (log.scrollTop = log.scrollHeight);
  function pipeStep(el, label) {
    const li = document.createElement("li");
    li.innerHTML = `<i></i><span>${label}</span><b></b>`;
    $(".pipe", el).appendChild(li);
    scroll();
    return { done: (detail) => { li.classList.add("is-done"); $("b", li).textContent = detail; } };
  }

  function renderSources(ranked, cited) {
    const list = $("[data-sources]");
    const max = ranked[0]?.score || 1;
    $("[data-src-meta]").textContent = ranked.length ? `top ${ranked.length} · BM25` : "no match";
    list.innerHTML = ranked.length ? "" : '<li class="src__empty">관련 문단을 찾지 못했습니다.</li>';
    ranked.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "scard" + (cited.has(i) ? " is-cited" : "");
      li.dataset.i = i;
      li.tabIndex = 0;
      li.innerHTML = `
        <div class="scard__top mono"><span class="num">${i + 1}</span><span>${esc(r.c.doc.title)} §${r.c.i + 1}</span>${cited.has(i) ? '<span class="tag">cited</span>' : ""}</div>
        <p>${esc(r.c.text.slice(0, 92))}…</p>
        <div class="score"><i style="width:${(r.score / max) * 100}%"></i><span class="mono">${r.score.toFixed(2)}</span></div>`;
      li.addEventListener("click", () => openDoc(r.c.doc, r.c.i, null));
      li.addEventListener("keydown", e => e.key === "Enter" && openDoc(r.c.doc, r.c.i, null));
      list.appendChild(li);
    });
  }

  function hot(i, on) { $$(`.scard[data-i="${i}"]`).forEach(c => c.classList.toggle("is-hot", on)); }

  /* ---------- doc viewer ---------- */
  const viewer = $("[data-viewer]");
  function openDoc(doc, chunkIdx, sentence) {
    $("[data-viewer-title]").textContent = `${doc.title} · ${doc.tag}`;
    $("[data-viewer-body]").innerHTML = doc.chunks.map((t, i) => {
      let html = esc(t);
      if (i === chunkIdx && sentence) html = html.replace(esc(sentence), `<mark>${esc(sentence)}</mark>`);
      return `<p class="${i === chunkIdx ? "is-hit" : ""}" data-c="${i}"><span class="mono">§${i + 1}</span>${html}</p>`;
    }).join("");
    viewer.hidden = false;
    const hit = $(`[data-c="${chunkIdx}"]`, viewer);
    hit && hit.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  $("[data-viewer-close]").addEventListener("click", () => (viewer.hidden = true));

  /* ---------- the turn ---------- */
  async function ask(q) {
    if (busy || !q.trim()) return;
    busy = true; $("[data-send]").disabled = true;
    addUser(q);
    const el = addAssistant();

    let t0 = performance.now();
    const rw = rewrite(q);
    const rewriteMs = performance.now() - t0;
    await wait(240);
    pipeStep(el, rw.rewritten ? `Rewrite → “${rw.text}”` : "Rewrite → 원문 유지").done(`${rewriteMs.toFixed(2)}ms`);

    t0 = performance.now();
    const qt = tokens(rw.text);
    const ranked = bm25(qt, new Set(tokens(q)));
    const retrieveMs = performance.now() - t0;
    const s1 = pipeStep(el, `Retrieve · BM25 over ${N} chunks`);
    await wait(320); s1.done(`${retrieveMs.toFixed(2)}ms`);

    const top = ranked[0];
    // grounded only if the top chunk matches the user's own words, not just inherited context
    const grounded = top && top.score >= 2.2 && top.cover >= 0.25 && top.ownHit;
    const kept = grounded ? ranked.filter(r => r.score >= top.score * 0.45).slice(0, 4) : [];
    const s2 = pipeStep(el, `Rerank · keep ${kept.length} (≥45% of top)`);
    await wait(260); s2.done(grounded ? `top ${top.score.toFixed(2)}` : "below threshold");

    const answer = $(".answer", el);
    if (!grounded) {
      renderSources([], new Set());
      pipeStep(el, "Compose → 거절 (근거 없음)").done("—");
      await stream(answer, [{ text: "등록된 문서에서 이 질문에 대한 근거를 찾지 못했습니다. 추측으로 답하지 않습니다. 질문을 바꾸거나, 관련 문서를 라이브러리에 추가해 주세요." }]);
      answer.classList.add("is-refusal");
      lastQueryTerms = [];
      return finish();
    }

    // extractive compose: best-overlapping sentence(s) from each kept chunk
    const qset = new Set(qt);
    const parts = [];
    const cited = new Set();
    kept.slice(0, 3).forEach((r, i) => {
      const ss = sentences(r.c.text)
        .map(s => ({ s, o: tokens(s).filter(t => qset.has(t)).length }))
        .sort((a, b) => b.o - a.o);
      const take = ss.filter((x, k) => x.o > 0 && (k === 0 || x.o >= ss[0].o * 0.6)).slice(0, 2);
      take.forEach(x => { parts.push({ text: x.s, src: i, sentence: x.s, chunk: r.c }); cited.add(i); });
    });
    renderSources(kept, cited);
    pipeStep(el, `Compose · extractive · ${parts.length} sentences`).done(`${cited.size} cited`);
    await stream(answer, [{ text: "문서 기준으로 정리하면 다음과 같습니다.", lead: true }, ...parts]);

    // follow-up suggestions from the cited docs
    const docs = [...new Set(parts.map(p => p.chunk.doc.id))];
    const more = SUGGEST.filter(s => docs.includes(s.doc) && s.q !== q).slice(0, 2);
    if (more.length) {
      const f = document.createElement("div");
      f.className = "followups";
      more.forEach(s => { const b = document.createElement("button"); b.className = "chip mono"; b.textContent = s.q; b.onclick = () => ask(s.q); f.appendChild(b); });
      el.appendChild(f);
    }
    lastQueryTerms = topicTerms(q).length ? topicTerms(q) : lastQueryTerms;
    finish();
  }

  function finish() { busy = false; $("[data-send]").disabled = false; scroll(); $("#q").focus(); }

  async function stream(container, parts) {
    for (const p of parts) {
      const span = document.createElement("span");
      span.className = "sent";
      container.appendChild(span);
      if (p.lead) { span.classList.add("lead"); }
      for (let i = 0; i < p.text.length; i += 2) {
        span.textContent = p.text.slice(0, i + 2);
        if (i % 12 === 0) scroll();
        await wait(14);
      }
      if (p.src !== undefined) {
        const b = document.createElement("button");
        b.className = "cite mono"; b.textContent = p.src + 1;
        b.setAttribute("aria-label", `출처 ${p.src + 1}: ${p.chunk.doc.title}`);
        b.addEventListener("pointerenter", () => { hot(p.src, true); span.classList.add("is-hot"); });
        b.addEventListener("pointerleave", () => { hot(p.src, false); span.classList.remove("is-hot"); });
        b.addEventListener("click", () => openDoc(p.chunk.doc, p.chunk.i, p.sentence));
        span.appendChild(b);
      }
      container.appendChild(document.createTextNode(" "));
    }
    scroll();
  }

  /* ---------- chrome ---------- */
  const SUGGEST = [
    { q: "사과 특 등급 기준이 뭐야?", doc: "grade" },
    { q: "출하 정산은 며칠 안에 지급돼?", doc: "settle" },
    { q: "저온저장고 경보가 울리면 어떻게 해야 해?", doc: "cold" },
    { q: "선별 카메라 보정 주기는?", doc: "machine" },
    { q: "정전되면?", doc: "cold" },
    { q: "수수료는 얼마야?", doc: "settle" },
    { q: "장애가 30분 넘게 계속되면?", doc: "incident" },
    { q: "오늘 서울 날씨 어때?", doc: null },
  ];
  const sugg = $("[data-sugg]");
  [0, 1, 2, 3, 7].forEach(i => {
    const b = document.createElement("button");
    b.className = "chip mono"; b.textContent = SUGGEST[i].q;
    if (!SUGGEST[i].doc) b.title = "근거 없는 질문 — 거절 동작 확인";
    b.addEventListener("click", () => ask(SUGGEST[i].q));
    sugg.appendChild(b);
  });

  const docsEl = $("[data-docs]");
  CORPUS.forEach(d => {
    const li = document.createElement("li");
    li.innerHTML = `<button><span>${esc(d.title)}</span><small class="mono">${d.tag} · ${d.chunks.length}§</small></button>`;
    $("button", li).addEventListener("click", () => openDoc(d, -1, null));
    docsEl.appendChild(li);
  });

  const ta = $("#q");
  $("[data-form]").addEventListener("submit", e => { e.preventDefault(); const q = ta.value; ta.value = ""; ta.style.height = ""; ask(q); });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("[data-form]").requestSubmit(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; });
  $("[data-new]").addEventListener("click", () => location.reload());
})();
