// Hub page choreography: loader → hero, scrubbed statement, pinned domain map,
// active-item work list with live iframe previews, agentic tribunal panel.
(() => {
  const CONFIG = {
    email: "jungjunkimlegitofficial101@gmail.com",
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- smooth scroll ---------- */
  const lenis = new Lenis({ duration: 1.1, smoothWheel: !reduce });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
  $$('a[href^="#"]').forEach(a =>
    a.addEventListener("click", e => {
      const target = $(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: 0 });
    })
  );

  /* ---------- small live bits ---------- */
  const clocks = $$("[data-clock]");
  const tick = () => {
    const t = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour12: false });
    clocks.forEach(c => (c.textContent = `Seoul ${t} KST`));
  };
  tick(); setInterval(tick, 1000);

  const mail = $("[data-email]");
  const mailText = $("[data-email-text]");
  mail.href = `mailto:${CONFIG.email}`;
  mailText.textContent = CONFIG.email;
  const copyBtn = $("[data-copy]");
  copyBtn.addEventListener("click", () => {
    const label = $("i", copyBtn);
    const done = () => { label.textContent = "Copied"; setTimeout(() => (label.textContent = "Copy"), 1600); };
    const pickText = () => { const r = document.createRange(); r.selectNodeContents(mailText); getSelection().removeAllRanges(); getSelection().addRange(r); };
    if (navigator.clipboard) navigator.clipboard.writeText(CONFIG.email).then(done, pickText);
    else pickText();
  });

  const cursorHud = $("[data-cursor]");
  const pad = n => String(Math.max(0, Math.round(n))).padStart(4, "0");
  ScanField($(".hero__canvas"), {
    onFrame: m => { cursorHud.textContent = m.inside ? `X ${pad(m.x)} · Y ${pad(m.y)}` : "Click to pulse"; },
  });

  /* ---------- loader → hero ---------- */
  const heroLines = $$(".hl > span");
  gsap.set(heroLines, { yPercent: 110 });
  const loader = Loader($(".loader"), $(".loader__tile"));
  const R = loader.R;
  const intro = gsap.timeline({ delay: 0.15 });
  intro
    .from(".loader__word--l", { xPercent: 40, opacity: 0, duration: 0.9, ease: "expo.out" }, 0)
    .from(".loader__word--r", { xPercent: -40, opacity: 0, duration: 0.9, ease: "expo.out" }, 0)
    // the window opens downward from the tile slot
    .to(R, { h: () => loader.tileRect().height, duration: 0.7, ease: "expo.out" }, 0.1)
    .to(R, { count: 100, duration: reduce ? 0.1 : 1.6, ease: "power2.inOut" }, 0.2)
    .to(".loader__word--l", { xPercent: -120, opacity: 0, duration: 0.8, ease: "expo.in" }, ">")
    .to(".loader__word--r", { xPercent: 120, opacity: 0, duration: 0.8, ease: "expo.in" }, "<")
    // grow the window itself to the viewport; pitch and scan line stay in screen pixels
    .to(R, { x: 0, y: 0, w: () => innerWidth, h: () => innerHeight, open: 1, duration: 1.0, ease: "expo.inOut" }, "<0.35")
    .to(".loader", { opacity: 0, duration: 0.45 }, ">-0.05")
    .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.08, ease: "expo.out" }, "<")
    .from([".hero__sub", ".hero__hud", ".hero__scroll", ".nav"], { opacity: 0, y: 12, duration: 0.8, stagger: 0.06 }, "<0.3")
    .add(() => {
      loader.stop();
      $(".loader").remove();
      document.body.classList.remove("is-loading");
      lenis.start();
    });

  // staggered drift on scroll, like the lines are pulled apart
  [[".hl--1", -6], [".hl--2", 10], [".hl--3", -3], [".hl--4", 8]].forEach(([sel, x]) =>
    gsap.to(sel, { xPercent: x, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } })
  );

  /* ---------- statement: three-state lot scanner ---------- */
  Statement($(".statement"));
  Tribunal($(".tribunal"));

  /* ---------- domain map (orbital) ---------- */
  Orbit.mount($(".domain__stage"), $(".domain"), {
    accent: "#8F4BFF",
    lavender: "#C9B8FF",
    cueRho: 0.952,
    sectionNumber: "002",
    sectionName: "An industrial AI domain map",
    scaleNote: "Diagram not to scale",
    ringLabels: { LEO: "Line", GEO: "Knowledge", GY: "Archive", MOON: "Field" },
    focusStatus: ["Live demo", "Live demo", "Live demo"],
    labels: {
      resolved: "Detected",
      gauge: "100,000 rows · 5.8 ms",
      rpo: ["Retrieving", "Cited"],
      structs: {
        factory: "Build", ground: "Operator", depotL: "Index", depotG: "Index",
        shipyard: "Agents", moon: "Drone", asteroid: "Site", refinery: "Inspection",
        ret: "Report", otv: "Query", sv: "Cache", rpo: "Retrieving", hyper: "Multimodal", fleet: "Fleet",
      },
    },
    figureLabels: ["What models can do", "What gets used on site"],
    beats: [
      { kicker: "Today", headline: "It starts with three live demos.",
        lines: ["01 Vision QC", "02 RAG Desk", "03 Grid 100K"],
        note: "Everything after grows from these three.", readout: ["Three live demos", "Vision · RAG · Data"] },
      { kicker: "Why I build", headline: "AI is judged by its interface.",
        caption: "Today, what gets used on the floor is a small slice of what models can do.",
        figure: true, readout: ["Adoption gap", "Today"] },
      { kicker: "The potential I see", headline: "Good interfaces close that gap.",
        caption: "When inspection, search, data and field operations work as one system.",
        figure: true, readout: ["Adoption gap", "Potential"] },
      { kicker: "My goal", headline: "Bring forward the day operators trust AI.",
        caption: "For that, three things must hold first, in this order.",
        lines: ["01 Results you trust at a glance", "02 Evidence behind every answer", "03 Fast data at any scale"],
        readout: ["Full architecture", "Trusted by default"] },
      { kicker: "A big ambition", headline: "Step one: make it visible.",
        caption: "You cannot judge a result you cannot see. So I started with the inspection screen.",
        readout: ["First", "Visibility"] },
      { kicker: "The first step", headline: "Detect, then explain.",
        caption: "Vision QC does not stop at marking defects: it shows confidence and evidence. Move the threshold and the whole history is re-judged.",
        link: { href: "work/vision-qc/index.html", label: "Demo · Vision QC →" }, readout: ["Vision QC", "Live demo"] },
      { kicker: "The next step", headline: "A source for every answer.",
        caption: "RAG Desk finds evidence in the documents, cites it for every sentence, and refuses when there is none.",
        link: { href: "work/rag-desk/index.html", label: "Demo · RAG Desk →" }, readout: ["RAG Desk", "Live demo"] },
      { kicker: "The next operational need", headline: "From data you show to data you move.",
        caption: "Grid 100K filters, sorts and aggregates 100,000 rows without a stutter. A few milliseconds per query.",
        link: { href: "work/grid-100k/index.html", label: "Demo · Grid 100K →" }, readout: ["Grid 100K", "Filter · Sort · Aggregate"] },
      { kicker: "In steady state", headline: "Many screens, one system.",
        caption: "Built on one design system, verified with one workflow, shipped with agents.",
        readout: ["One system", "Design · Verify · Ship"] },
      { kicker: "What I do", headline: "Frontend for industrial AI.",
        caption: "Today: inspection, search, data. Next: drones and field operations.",
        readout: ["Frontend for industrial AI", "+ Field ops next"] },
    ],
    panelTitle: "What an industrial AI frontend must get right",
    panelTitleEnd: "",
    softwareLabel: "Agent workflow",
    panel: ["Inspection UI", "Grounded answers", "Large-data grids", "Realtime telemetry", "Accessibility", "Agentic delivery"],
  });

  /* ---------- work list ---------- */
  const items = $$(".work__list [data-i]");
  const previews = $$(".wp");
  const preview = $(".work__preview");
  const metaTag = $("[data-meta-tag]"), metaStack = $("[data-meta-stack]");
  const META = [
    ["Live demo", "Real CV detector · Web Worker"],
    ["Live demo", "BM25 RAG · add your own docs"],
    ["Live demo", "100k rows · brush · CSV export"],
    ["Live demo", "Real trend data · grounded Q&A"],
  ];
  let active = -1, hovering = false;
  const fitIframes = () => {
    const s = preview.offsetWidth / 1440;
    $$("iframe", preview).forEach(f => (f.style.transform = `scale(${s})`));
  };
  const setActive = i => {
    if (i === active) return;
    active = i;
    items.forEach((it, k) => it.classList.toggle("is-active", k === i));
    previews.forEach((p, k) => p.classList.toggle("is-active", k === i));
    const f = $("iframe", previews[i]);
    if (f && !f.src) { f.src = f.dataset.src; fitIframes(); }
    metaTag.textContent = META[i][0]; metaStack.textContent = META[i][1];
    // follow the active row vertically, clamped inside the list
    const body = $(".work__body");
    const it = items[i];
    const center = it.offsetTop + it.offsetHeight / 2;
    const half = preview.offsetHeight / 2;
    const y = Math.max(half, Math.min(body.offsetHeight - half, center));
    gsap.to(preview, { top: y, duration: 0.8, ease: "expo.out" });
  };
  items.forEach((it, i) => {
    it.addEventListener("pointerenter", () => { hovering = true; setActive(i); });
    it.addEventListener("focus", () => setActive(i));
  });
  $(".work__list").addEventListener("pointerleave", () => (hovering = false));
  ScrollTrigger.create({
    trigger: ".work__list", start: "top 70%", end: "bottom 30%",
    onUpdate: () => {
      if (hovering) return;
      const mid = innerHeight / 2;
      let best = 0, bd = Infinity;
      items.forEach((it, k) => {
        const r = it.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bd) { bd = d; best = k; }
      });
      setActive(best);
    },
  });
  setActive(0);
  addEventListener("resize", fitIframes);

  /* ---------- case-note drawer ---------- */
  const CASES = {
    gocreaty: {
      tag: "Personal product · 2026",
      title: "GoCreaty",
      lede: "A SaaS that collects YouTube, Instagram and TikTok trends, explains why Shorts go viral, and automates faceless short-form production. I built the frontend myself and directed an agent fleet for the backend.",
      facts: [
        ["Role", "Solo frontend + backend agent orchestration"],
        ["Frontend", "Next.js (npm workspace monorepo)"],
        ["Backend", "FastAPI(async) · Celery · SQLAlchemy/Alembic · pgvector"],
        ["Pipeline", "Trend collection → LLM script → TTS → visuals → MP4 render → scheduled upload"],
        ["Agentic", "10 Claude Code agents in parallel via tmux + git worktrees. One prompt per lane; reviewed and merged in dependency order (DB models → API → services)."],
      ],
    },
  };
  const drawer = $(".drawer");
  const openCase = key => {
    const c = CASES[key];
    $('[data-d="tag"]', drawer).textContent = c.tag;
    $('[data-d="title"]', drawer).textContent = c.title;
    $('[data-d="lede"]', drawer).textContent = c.lede;
    $('[data-d="facts"]', drawer).innerHTML = c.facts
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    lenis.stop();
    $(".drawer__close", drawer).focus();
  };
  let lastFocus = null;
  const closeCase = () => {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    lenis.start();
    lastFocus && lastFocus.focus();
  };
  $$("[data-case]").forEach(b => b.addEventListener("click", () => { lastFocus = b; openCase(b.dataset.case); }));
  $$("[data-close]", drawer).forEach(b => b.addEventListener("click", closeCase));
  addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("is-open")) closeCase(); });

  /* ---------- marquees ---------- */
  $$(".marquee").forEach(m => {
    const unit = m.firstElementChild;
    for (let i = 0; i < 3; i++) m.appendChild(unit.cloneNode(true));
    const dir = +m.dataset.dir;
    const tween = gsap.fromTo(m.children, { xPercent: dir > 0 ? 0 : -100 }, { xPercent: dir > 0 ? -100 : 0, duration: 28, ease: "none", repeat: -1 });
    if (reduce) tween.pause();
    // scroll velocity nudges the speed
    ScrollTrigger.create({
      trigger: m, start: "top bottom", end: "bottom top",
      onUpdate: self => gsap.to(tween, { timeScale: 1 + Math.min(4, Math.abs(self.getVelocity()) / 600), duration: 0.2, overwrite: true,
        onComplete: () => gsap.to(tween, { timeScale: 1, duration: 0.8 }) }),
    });
  });

  // size the footer wordmark so it spans the viewport exactly
  const word = $(".foot__word");
  const fitWord = () => {
    word.style.fontSize = "100px";
    word.style.fontSize = (100 * (innerWidth - 2 * parseFloat(getComputedStyle(word.parentElement).paddingLeft))) / Math.max(word.offsetWidth, word.scrollWidth) + "px";
  };
  fitWord();
  addEventListener("resize", fitWord);
  document.fonts && document.fonts.ready.then(fitWord);

  const letters = [...word.textContent].map(c => {
    const sp = document.createElement("span");
    sp.textContent = c; sp.setAttribute("aria-hidden", "true");
    return sp;
  });
  word.textContent = ""; letters.forEach(l => word.appendChild(l));
  fitWord();
  const foot = $(".foot");
  let wordRaf = 0, px = -1e4;
  const shape = () => {
    wordRaf = 0;
    letters.forEach(l => {
      const r = l.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - px);
      const f = Math.max(0, 1 - d / 260);       // 1 under the cursor, 0 far away
      l.style.fontVariationSettings = `"wdth" ${125 - 55 * f}, "wght" ${900 - 600 * f}`;
    });
  };
  foot.addEventListener("pointermove", e => { px = e.clientX; if (!wordRaf) wordRaf = requestAnimationFrame(shape); });
  foot.addEventListener("pointerleave", () => { px = -1e4; if (!wordRaf) wordRaf = requestAnimationFrame(shape); });

  gsap.from(".foot__word", {
    yPercent: 60, ease: "none",
    scrollTrigger: { trigger: ".foot", start: "top bottom", end: "bottom bottom", scrub: true },
  });

  addEventListener("load", () => ScrollTrigger.refresh());
  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
