// Hub page choreography: loader → hero, scrubbed statement, pinned domain map,
// active-item work list with live iframe previews, horizontal process rail.
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
    clocks.forEach(c => (c.textContent = `SEOUL ${t} KST`));
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
    onFrame: m => { cursorHud.textContent = m.inside ? `X ${pad(m.x)} · Y ${pad(m.y)}` : "CLICK TO PULSE"; },
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

  /* ---------- domain map (orbital) ---------- */
  Orbit.mount($(".domain__stage"), $(".domain"), {
    accent: "#8F4BFF",
    lavender: "#C9B8FF",
    cueRho: 0.952,
    sectionNumber: "002",
    sectionName: "An industrial AI domain map",
    scaleNote: "Diagram not to scale",
    ringLabels: { LEO: "LINE", GEO: "KNOWLEDGE", GY: "ARCHIVE", MOON: "FIELD" },
    focusStatus: ["Live demo", "Live demo", "Live demo"],
    labels: {
      resolved: "DETECTED",
      gauge: "100,000 ROWS · 5.8 MS",
      rpo: ["RETRIEVING", "CITED"],
      structs: {
        factory: "BUILD", ground: "OPERATOR", depotL: "INDEX", depotG: "INDEX",
        shipyard: "AGENTS", moon: "DRONE", asteroid: "SITE", refinery: "INSPECTION",
        ret: "REPORT", otv: "QUERY", sv: "CACHE", rpo: "RETRIEVING", hyper: "MULTIMODAL", fleet: "FLEET",
      },
    },
    figureLabels: ["모델이 할 수 있는 것", "현장에서 쓰이는 것"],
    beats: [
      { kicker: "Today", headline: "세 개의 라이브 데모로 시작합니다.",
        lines: ["01 Vision QC", "02 RAG Desk", "03 Grid 100K"],
        note: "이후의 모든 것은 이 셋에서 자랍니다.", readout: ["Three live demos", "Vision · RAG · Data"] },
      { kicker: "Why I build", headline: "AI의 가치는 화면에서 결정됩니다.",
        caption: "오늘날, 모델이 할 수 있는 일에 비해 현장에서 실제로 쓰이는 부분은 작습니다.",
        figure: true, readout: ["Adoption gap", "Today"] },
      { kicker: "The potential I see", headline: "좋은 인터페이스는 그 격차를 뒤집습니다.",
        caption: "검사, 검색, 데이터, 현장 관제가 하나의 시스템처럼 작동할 때.",
        figure: true, readout: ["Adoption gap", "Potential"] },
      { kicker: "My goal", headline: "작업자가 AI를 믿고 쓰는 날을 앞당기는 것.",
        caption: "그러려면 세 가지가 먼저, 이 순서로 참이어야 합니다.",
        lines: ["01 한눈에 믿을 수 있는 결과", "02 모든 답변에 근거", "03 어떤 규모에서도 빠른 데이터"],
        readout: ["Full architecture", "Trusted by default"] },
      { kicker: "A big ambition", headline: "첫 단계는, 먼저 보이게 하는 것.",
        caption: "보이지 않는 결과는 판단할 수 없습니다. 그래서 검사 화면부터 만들었습니다.",
        readout: ["First", "Visibility"] },
      { kicker: "The first step", headline: "검출하고, 설명한다.",
        caption: "Vision QC는 결함 표시에서 멈추지 않고 신뢰도와 근거를 함께 보여줍니다. 임계값을 바꾸면 이력 전체가 다시 판정됩니다.",
        link: { href: "work/vision-qc/index.html", label: "Demo · Vision QC →" }, readout: ["Vision QC", "Live demo"] },
      { kicker: "The next step", headline: "모든 답변에 출처를.",
        caption: "RAG Desk는 문서에서 근거를 찾아 문장마다 인용하고, 근거가 없으면 답하지 않습니다.",
        link: { href: "work/rag-desk/index.html", label: "Demo · RAG Desk →" }, readout: ["RAG Desk", "Live demo"] },
      { kicker: "The next operational need", headline: "보여주는 데이터에서, 움직이는 데이터로.",
        caption: "Grid 100K는 10만 건을 끊김 없이 필터·정렬·집계합니다. 쿼리 한 번에 수 밀리초.",
        link: { href: "work/grid-100k/index.html", label: "Demo · Grid 100K →" }, readout: ["Grid 100K", "Filter · Sort · Aggregate"] },
      { kicker: "In steady state", headline: "여러 화면, 하나의 시스템.",
        caption: "하나의 디자인 시스템으로 만들고, 하나의 워크플로로 검증하고, 에이전트와 함께 배포합니다.",
        readout: ["One system", "Design · Verify · Ship"] },
      { kicker: "What I do", headline: "산업 AI를 위한 프론트엔드.",
        caption: "지금은 검사, 검색, 데이터. 다음은 드론과 현장 관제입니다.",
        readout: ["Frontend for industrial AI", "+ Field ops next"] },
    ],
    panelTitle: "산업 AI 프론트엔드가 반드시 잘해야 하는 것",
    panelTitleEnd: "",
    softwareLabel: "agent workflow",
    panel: ["Inspection UI", "Grounded answers", "Large-data grids", "Realtime telemetry", "Accessibility", "Agentic delivery"],
  });

  /* ---------- work list ---------- */
  const items = $$(".work__list [data-i]");
  const previews = $$(".wp");
  const preview = $(".work__preview");
  const metaTag = $("[data-meta-tag]"), metaStack = $("[data-meta-stack]");
  const META = [
    ["LIVE DEMO", "Canvas 2D · Vanilla JS"],
    ["LIVE DEMO", "Streaming UI · Client RAG"],
    ["LIVE DEMO", "Virtual scroll · 100,000 rows"],
    ["LIVE APP", "Next.js · React Query · real trend data"],
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
      lede: "YouTube·Instagram·TikTok 트렌드를 수집해 얼굴 없는 숏폼 영상을 자동으로 만들고 예약 업로드하는 SaaS. 프론트엔드는 제가 직접, 백엔드는 에이전트 함대를 지휘해 만들었습니다.",
      facts: [
        ["Role", "프론트엔드 단독 개발 + 백엔드 에이전트 오케스트레이션"],
        ["Frontend", "Next.js (npm workspace 모노레포)"],
        ["Backend", "FastAPI(async) · Celery · SQLAlchemy/Alembic · pgvector"],
        ["Pipeline", "트렌드 수집 → LLM 스크립트 → TTS → 비주얼 → MP4 렌더 → 스케줄 업로드"],
        ["Agentic", "Claude Code 에이전트 10개를 tmux + git worktree로 병렬 실행. 레인별 프롬프트, 의존 순서(DB 모델 → API → 서비스)대로 리뷰·머지"],
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

  /* ---------- process rail (desktop pins + scrolls sideways) ---------- */
  const mm = gsap.matchMedia();
  mm.add("(min-width: 861px)", () => {
    const track = $(".process__track");
    gsap.to(track, {
      x: () => -(track.scrollWidth - innerWidth),
      ease: "none",
      scrollTrigger: {
        trigger: ".process__pin", start: "top top",
        end: () => "+=" + (track.scrollWidth - innerWidth),
        pin: true, scrub: true, invalidateOnRefresh: true,
      },
    });
    gsap.from(".process__title span", {
      xPercent: i => (i ? 30 : -30), ease: "none",
      scrollTrigger: { trigger: ".process", start: "top bottom", end: "top top", scrub: true },
    });
  });

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
