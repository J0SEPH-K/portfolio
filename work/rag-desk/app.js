// RAG Desk — retrieval-augmented answering that actually runs, in the browser.
//   index:    documents → sentence-aware chunks (~260 chars) → tokens (words + Hangul bigrams) → BM25
//   ask:      follow-up rewrite → BM25 top-k → rerank (keep ≥45% of top) → extractive compose
//   ground:   every sentence cites its chunk; if nothing clears the bar, it refuses
// Add your own .txt/.md (or paste text) and it is chunked and indexed on the spot.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  if (location.hash === "#embed") document.documentElement.classList.add("is-embed");
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- tokenizer ---------- */
  const STOP = new Set(["어떻", "떻게", "해야", "하나", "나요", "뭐야", "인가", "가요", "는지", "있나", "얼마", "마나", "무엇", "엇인",
    "알려", "려줘", "합니", "니까", "까요", "되나", "돼요", "는데", "은데", "하면", "해요", "주세", "세요", "그럼", "그러", "러면", "그건", "그거", "이때", "경우",
    "the", "a", "an", "is", "are", "of", "to", "in", "and", "or", "what", "how", "why", "do", "does", "it", "for", "on", "with", "be", "i", "you", "this", "that",
    "if", "when", "my", "me", "can", "should", "there", "get", "about", "much", "many", "will", "would", "we", "our", "its", "by", "at", "as", "who", "which", "then", "so", "than", "into", "tell"]);
  // light English stemming so "alarm" and "alarms", "calibrate" and "calibrated" meet
  const stem = w => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "").replace(/e$/, "") : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
  function tokens(text) {
    const out = [];
    text.toLowerCase().split(/[^0-9a-z가-힣℃%]+/).forEach(w => {
      if (!w) return;
      if (/[가-힣]/.test(w)) {
        if (w.length === 1) return;
        for (let i = 0; i < w.length - 1; i++) { const bg = w.slice(i, i + 2); if (!STOP.has(bg)) out.push(bg); }
      } else if (!STOP.has(w)) out.push(stem(w));
    });
    return out;
  }

  /* ---------- documents + index ---------- */
  const SAVE = "ragdesk-docs-v1";
  let userDocs = [];
  try { userDocs = JSON.parse(localStorage.getItem(SAVE) || "[]"); } catch {}
  function chunkText(text) {
    const sents = text.replace(/\r/g, "").split(/(?<=[.!?。]|다\.)\s+|\n{2,}/).map(s => s.trim()).filter(Boolean);
    const out = [];
    let cur = "";
    sents.forEach(s => { if ((cur + " " + s).length > 260 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s; });
    if (cur) out.push(cur);
    return out;
  }
  let docs = [], chunks = [], N = 0, avgdl = 1, df = new Map();
  function buildIndex() {
    docs = [...CORPUS.map(d => ({ ...d, mine: false })), ...userDocs.map(d => ({ ...d, mine: true }))];
    chunks = [];
    docs.forEach(doc => doc.chunks.forEach((text, i) => chunks.push({ doc, i, text, toks: tokens(text) })));
    N = chunks.length;
    avgdl = chunks.reduce((a, c) => a + c.toks.length, 0) / Math.max(1, N);
    df = new Map();
    chunks.forEach(c => new Set(c.toks).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    chunks.forEach(c => { c.tf = new Map(); c.toks.forEach(t => c.tf.set(t, (c.tf.get(t) || 0) + 1)); });
    $("[data-docs]").textContent = docs.length;
    $("[data-chunks]").textContent = N;
    renderLibrary();
  }
  function bm25(qt, own) {
    const k1 = 1.2, b = 0.75, uniq = [...new Set(qt)];
    return chunks.map(c => {
      let s = 0;
      uniq.forEach(t => {
        const f = c.tf.get(t); if (!f) return;
        const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
        s += (own.has(t) ? 1 : 0.5) * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.toks.length) / avgdl));
      });
      return { c, score: s, cover: uniq.filter(t => c.tf.has(t)).length / Math.max(1, uniq.length), ownHit: [...own].some(t => c.tf.has(t)) };
    }).sort((a, b) => b.score - a.score);
  }
  const sentences = text => (text.match(/[^.!?]+[.!?]?/g) || [text]).map(s => s.trim()).filter(Boolean);
  // highlight words that share a query token
  function highlight(text, qset) {
    return esc(text).replace(/[0-9A-Za-z가-힣℃%]+/g, w => (tokens(w).some(t => qset.has(t)) ? `<mark>${w}</mark>` : w));
  }

  /* ---------- library ---------- */
  function renderLibrary() {
    const ul = $("[data-docs-list]");
    ul.innerHTML = "";
    docs.forEach(d => {
      const li = document.createElement("li");
      if (d.mine) li.className = "mine";
      li.innerHTML = `<button><span>${esc(d.title)}</span><small>${esc(d.tag)} · ${d.chunks.length} chunks</small></button>`;
      $("button", li).onclick = () => openDoc(d, -1, null);
      ul.appendChild(li);
    });
  }
  function addDoc(title, text) {
    const chunksOf = chunkText(text);
    if (!chunksOf.length) return toast("The document has no text.");
    const doc = { id: "u" + Date.now(), title: title.slice(0, 60) || "Pasted document", tag: "My document", chunks: chunksOf };
    userDocs.push(doc);
    try { localStorage.setItem(SAVE, JSON.stringify(userDocs)); } catch {}
    buildIndex();
    toast(`Indexed · “${doc.title}” · ${chunksOf.length} chunks`);
    renderSuggestions();
  }
  const add = $("[data-add]"), file = $("[data-file]");
  add.addEventListener("click", e => { if (e.target !== file) file.click(); });
  add.addEventListener("keydown", e => { if (e.key === "Enter") file.click(); });
  file.addEventListener("change", async () => { for (const f of file.files) addDoc(f.name.replace(/\.(txt|md)$/i, ""), await f.text()); file.value = ""; });
  ["dragenter", "dragover"].forEach(t => add.addEventListener(t, e => { e.preventDefault(); add.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(t => add.addEventListener(t, e => { e.preventDefault(); add.classList.remove("is-over"); }));
  add.addEventListener("drop", async e => { for (const f of e.dataTransfer.files) if (/text|markdown|\.md$|\.txt$/i.test(f.type + f.name)) addDoc(f.name.replace(/\.(txt|md)$/i, ""), await f.text()); });
  document.addEventListener("paste", e => {
    if (e.target.closest("textarea, input")) return;
    const t = e.clipboardData.getData("text");
    if (t && t.length > 80) addDoc(t.split("\n")[0].slice(0, 40), t);
  });

  let toastT;
  function toast(msg) { const t = $("[data-toast]"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

  /* ---------- evidence panel ---------- */
  const reader = $("[data-reader]");
  function openDoc(doc, chunkIdx, sentence, qset) {
    $("[data-reader-title]").textContent = `${doc.title} · ${doc.tag}`;
    $("[data-reader-body]").innerHTML = doc.chunks.map((t, i) => {
      let html = qset ? highlight(t, qset) : esc(t);
      if (i === chunkIdx && sentence) html = html.replace(esc(sentence), s => `<mark>${s}</mark>`);
      return `<p class="${i === chunkIdx ? "hit" : ""}" data-c="${i}"><span class="mono">§${i + 1}</span>${html}</p>`;
    }).join("");
    reader.hidden = false;
    $$(".lib__docs button").forEach((b, i) => b.classList.toggle("is-open", docs[i] === doc));
    const hit = $(`[data-c="${chunkIdx}"]`, reader);
    hit && hit.scrollIntoView({ block: "center" });
  }
  $("[data-reader-close]").onclick = () => { reader.hidden = true; $$(".lib__docs button").forEach(b => b.classList.remove("is-open")); };
  function renderEvidence(ranked, cited, qset, ms) {
    const ol = $("[data-ev]"), max = ranked[0]?.score || 1;
    $("[data-ev-meta]").textContent = ranked.length ? `top ${ranked.length} of ${N} · ${ms.toFixed(2)} ms` : `0 of ${N} cleared the bar`;
    ol.innerHTML = ranked.length ? "" : '<li class="ev__empty">No passage supports this question, so there is no answer.</li>';
    ranked.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "card" + (cited.has(i) ? " cited" : "");
      li.dataset.i = i; li.tabIndex = 0;
      li.innerHTML = `<div class="card__top"><span class="card__n">${i + 1}</span><span class="card__src">${esc(r.c.doc.title)} §${r.c.i + 1}</span>${cited.has(i) ? '<span class="card__tag">CITED</span>' : ""}</div>
        <p>${highlight(r.c.text, qset)}</p>
        <div class="score"><i style="transform:scaleX(0)"></i><span>${r.score.toFixed(2)}</span></div>`;
      li.onclick = () => openDoc(r.c.doc, r.c.i, null, qset);
      li.onkeydown = e => e.key === "Enter" && li.onclick();
      ol.appendChild(li);
      requestAnimationFrame(() => ($("i", li).style.transform = `scaleX(${r.score / max})`));
    });
    reader.hidden = true;
  }

  /* ---------- the turn ---------- */
  let lastTerms = [], busy = false;
  const log = $("[data-log]");
  const scroll = () => (log.scrollTop = log.scrollHeight);
  function rewrite(q) {
    const follow = q.replace(/[\s?？!.]/g, "").length <= 6 || /^(그럼|그러면|그건|그거|그때|이때|그 경우|왜|더|자세히|and |what about|what if|then|why|more|and if)/i.test(q.trim());
    return follow && lastTerms.length ? { text: `${q} (${lastTerms.join(" ")})`, rewritten: true } : { text: q, rewritten: false };
  }
  const topicTerms = q => q.split(/\s+/).filter(w => /[가-힣a-z]{2,}/i.test(w) && !/^(어떻게|무엇|얼마나|언제|하나요|뭐야|있나요|알려줘|해야|what|how|why|does|the|when|is|are|if|do|can|should|much|many|long|within)$/i.test(w)).slice(0, 3)
    .map(w => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|이면|면)$/, ""));

  async function ask(q) {
    q = q.trim();
    if (busy || !q) return;
    busy = true; $("[data-send]").disabled = true;
    $("[data-hello]")?.remove();
    const u = document.createElement("div"); u.className = "msg msg--user"; u.textContent = q; log.appendChild(u);
    const m = document.createElement("div"); m.className = "msg msg--bot";
    m.innerHTML = `<p class="trace"></p><div class="answer"></div>`; log.appendChild(m); scroll();
    const trace = $(".trace", m), answer = $(".answer", m);
    const step = async (html, delay) => { const s = document.createElement("span"); s.innerHTML = html; trace.appendChild(s); await wait(delay); s.classList.add("on"); };

    const rw = rewrite(q);
    await step(rw.rewritten ? `rewrite <b>“${esc(rw.text)}”</b>` : "rewrite <b>—</b>", 160);
    const t0 = performance.now();
    const qt = tokens(rw.text), own = new Set(tokens(q)), qset = new Set(qt);
    const ranked = bm25(qt, own), ms = performance.now() - t0;
    await step(`retrieve <b>${N} chunks · ${ms.toFixed(2)} ms</b>`, 220);
    const top = ranked[0];
    const grounded = top && top.score >= 2.2 && top.cover >= 0.25 && top.ownHit;
    const kept = grounded ? ranked.filter(r => r.score >= top.score * 0.45).slice(0, 5) : [];
    await step(`rerank <b>keep ${kept.length}</b>`, 200);

    if (!grounded) {
      renderEvidence([], new Set(), qset, ms);
      await step("compose <b>refuse</b>", 120);
      answer.classList.add("refuse");
      await type(answer, [{ text: "I found no evidence for this in the indexed documents, so I won't guess. Rephrase the question, or add a relevant document to the library on the left." }]);
      lastTerms = [];
      return done();
    }
    const parts = [], cited = new Set();
    kept.slice(0, 3).forEach((r, i) => {
      const ss = sentences(r.c.text).map(s => ({ s, o: tokens(s).filter(t => qset.has(t)).length })).sort((a, b) => b.o - a.o);
      ss.filter((x, k) => x.o > 0 && (k === 0 || x.o >= ss[0].o * 0.6)).slice(0, 2)
        .forEach(x => { parts.push({ text: x.s, src: i, chunk: r.c }); cited.add(i); });
    });
    renderEvidence(kept, cited, qset, ms);
    await step(`compose <b>${parts.length} sentences · ${cited.size} cited</b>`, 120);
    await type(answer, [{ text: "According to the documents:", lead: true }, ...parts]);
    const fu = SUGGEST.filter(s => parts.some(p => p.chunk.doc.id === s.doc) && s.q !== q).slice(0, 2);
    if (fu.length) {
      const f = document.createElement("div"); f.className = "follow";
      fu.forEach(s => { const b = document.createElement("button"); b.textContent = s.q; b.onclick = () => ask(s.q); f.appendChild(b); });
      m.appendChild(f);
    }
    const tt = topicTerms(q); if (tt.length) lastTerms = tt;
    done();
  }
  function done() { busy = false; $("[data-send]").disabled = false; scroll(); $("#q").focus(); }
  async function type(el, parts) {
    for (const p of parts) {
      const span = document.createElement("span");
      span.className = "s" + (p.lead ? " lead" : "") + " typing";
      el.appendChild(span);
      for (let i = 0; i < p.text.length; i += 3) { span.textContent = p.text.slice(0, i + 3); if (i % 30 === 0) scroll(); await wait(12); }
      span.classList.remove("typing");
      if (p.src !== undefined) {
        const b = document.createElement("button");
        b.className = "cite"; b.textContent = p.src + 1;
        b.setAttribute("aria-label", `Source ${p.src + 1}: ${p.chunk.doc.title}`);
        const card = () => $(`.card[data-i="${p.src}"]`);
        b.onmouseenter = () => { span.classList.add("hot"); card()?.classList.add("hot"); };
        b.onmouseleave = () => { span.classList.remove("hot"); card()?.classList.remove("hot"); };
        b.onclick = () => openDoc(p.chunk.doc, p.chunk.i, p.text);
        span.appendChild(b);
      }
      el.appendChild(document.createTextNode(" "));
    }
    scroll();
  }

  /* ---------- suggestions ---------- */
  const SUGGEST = [
    { q: "What makes an apple grade AA?", doc: "grade" },
    { q: "How soon is shipment settlement paid?", doc: "settle" },
    { q: "What do I do when the cold storage alarm sounds?", doc: "cold" },
    { q: "And during a power outage?", doc: "cold" },
    { q: "How often is the sorting camera calibrated?", doc: "machine" },
    { q: "What is the consignment fee?", doc: "settle" },
    { q: "What if an outage lasts over 30 minutes?", doc: "incident" },
  ];
  function renderSuggestions() {
    const box = $("[data-sugg]"); if (!box) return;
    box.innerHTML = "";
    [0, 1, 2, 4].forEach(i => { const b = document.createElement("button"); b.textContent = SUGGEST[i].q; b.onclick = () => ask(SUGGEST[i].q); box.appendChild(b); });
    const r = document.createElement("button"); r.className = "ghost"; r.textContent = "What's the weather in Seoul today?"; r.title = "No evidence in the documents: watch it refuse"; r.onclick = () => ask(r.textContent); box.appendChild(r);
    const mine = userDocs[userDocs.length - 1];
    if (mine) { const b = document.createElement("button"); b.textContent = `Summarize “${mine.title}”`; b.onclick = () => ask(`${mine.title} ${mine.chunks[0].slice(0, 40)}`); box.appendChild(b); }
  }

  const ta = $("#q");
  $("[data-form]").addEventListener("submit", e => { e.preventDefault(); const q = ta.value; ta.value = ""; ta.style.height = ""; ask(q); });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("[data-form]").requestSubmit(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; });

  buildIndex();
  renderSuggestions();
})();
