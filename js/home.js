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
  if (CONFIG.email) { mail.href = `mailto:${CONFIG.email}`; mail.textContent = CONFIG.email; }
  else { mail.href = "#contact"; }
  const copyBtn = $("[data-copy]");
  copyBtn.addEventListener("click", () => {
    const done = () => { copyBtn.textContent = "Copied"; setTimeout(() => (copyBtn.textContent = "Copy"), 1600); };
    const pickText = () => { const r = document.createRange(); r.selectNodeContents(mail); getSelection().removeAllRanges(); getSelection().addRange(r); };
    if (navigator.clipboard) navigator.clipboard.writeText(CONFIG.email).then(done, pickText);
    else pickText();
  });

  const cursorHud = $("[data-cursor]");
  const pad = n => String(Math.max(0, Math.round(n))).padStart(4, "0");
  ScanField($(".hero__canvas"), {
    onFrame: m => { if (m.x > 0) cursorHud.textContent = `X ${pad(m.x)} · Y ${pad(m.y)}`; },
  });

  /* ---------- loader → hero ---------- */
  const heroLines = $$(".hl > span");
  gsap.set(heroLines, { yPercent: 110 });
  const count = $(".loader__count");
  const counter = { v: 0 };
  const intro = gsap.timeline({ delay: 0.15 });
  intro
    .from(".loader__word--l", { xPercent: 40, opacity: 0, duration: 0.9, ease: "expo.out" }, 0)
    .from(".loader__word--r", { xPercent: -40, opacity: 0, duration: 0.9, ease: "expo.out" }, 0)
    .from(".loader__tile", { scaleY: 0, duration: 0.7, ease: "expo.out" }, 0.1)
    .to(counter, {
      v: 100, duration: reduce ? 0.1 : 1.3, ease: "power2.inOut",
      onUpdate: () => (count.textContent = String(Math.round(counter.v)).padStart(3, "0")),
    }, 0.2)
    .to(".loader__word--l", { xPercent: -120, opacity: 0, duration: 0.8, ease: "expo.in" }, ">")
    .to(".loader__word--r", { xPercent: 120, opacity: 0, duration: 0.8, ease: "expo.in" }, "<")
    .to(".loader__tile", {
      scaleX: () => innerWidth / $(".loader__tile").offsetWidth * 1.05,
      scaleY: () => innerHeight / $(".loader__tile").offsetHeight * 1.05,
      duration: 0.9, ease: "expo.inOut",
    }, "<0.35")
    .to(".loader", { opacity: 0, duration: 0.4 }, ">-0.1")
    .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.08, ease: "expo.out" }, "<")
    .from([".hero__sub", ".hero__hud", ".hero__scroll", ".nav"], { opacity: 0, y: 12, duration: 0.8, stagger: 0.06 }, "<0.3")
    .add(() => {
      $(".loader").remove();
      document.body.classList.remove("is-loading");
      lenis.start();
    });

  // staggered drift on scroll, like the lines are pulled apart
  [[".hl--1", -6], [".hl--2", 10], [".hl--3", -3], [".hl--4", 8]].forEach(([sel, x]) =>
    gsap.to(sel, { xPercent: x, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } })
  );

  /* ---------- statement: per-character scrub ---------- */
  const title = $("[data-reveal]");
  const wrapChars = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        [...n.textContent].forEach(c => {
          const s = document.createElement("span");
          s.className = "ch"; s.textContent = c;
          frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") wrapChars(n);
    });
  };
  title.setAttribute("aria-label", title.textContent.replace(/\s+/g, " ").trim());
  wrapChars(title);
  gsap.to($$(".ch", title), {
    opacity: 1, stagger: 0.02, ease: "none",
    scrollTrigger: { trigger: title, start: "top 80%", end: "bottom 45%", scrub: true },
  });

  /* ---------- domain map ---------- */
  const svg = $(".domain__map");
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    parent && parent.appendChild(n);
    return n;
  };
  const ticks = $(".ticks", svg);
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2, r1 = 250, r2 = i % 10 ? 256 : 266;
    el("line", { x1: Math.cos(a) * r1, y1: Math.sin(a) * r1, x2: Math.cos(a) * r2, y2: Math.sin(a) * r2 }, ticks);
  }
  const NODES = [
    { label: "VISION QC", r: 170, a: -140, crumb: "VISION / INSPECTION" },
    { label: "RAG DESK", r: 170, a: -30, crumb: "RAG / KNOWLEDGE" },
    { label: "GRID 100K", r: 250, a: 60, crumb: "PLATFORM / DATA" },
    { label: "FIELD OPS", r: 250, a: 155, crumb: "DRONE / FIELD" },
  ];
  // decorative satellites on the rings
  const links = $(".map-links", svg);
  for (let i = 0; i < 26; i++) {
    const r = [90, 170, 250][i % 3], a = Math.random() * Math.PI * 2;
    el("circle", { class: "sat", r: 1.6, cx: Math.cos(a) * r, cy: Math.sin(a) * r }, links);
  }
  const nodeGroup = $(".map-nodes", svg);
  const nodeEls = NODES.map(n => {
    const rad = (n.a * Math.PI) / 180;
    n.x = Math.cos(rad) * n.r; n.y = Math.sin(rad) * n.r;
    const g = el("g", { class: "node", transform: `translate(${n.x} ${n.y})` }, nodeGroup);
    el("circle", { class: "halo", r: 18 }, g);
    el("circle", { class: "dot", r: 7 }, g);
    const t = el("text", { class: "node-label", y: n.y > 0 ? 34 : -22 }, g);
    t.textContent = n.label;
    return g;
  });
  const linkPath = el("path", { d: "" }, links);

  const panels = $$(".dpanel"), steps = $$(".domain__steps li"), bars = steps.map(li => $("i", li));
  const crumb = $("[data-crumb]");
  let current = -1;
  const setStep = i => {
    if (i === current) return;
    current = i;
    panels.forEach((p, k) => p.classList.toggle("is-active", k === i));
    steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
    nodeEls.forEach((n, k) => n.classList.toggle("is-active", k === i));
    crumb.textContent = NODES[i].crumb;
    const n = NODES[i];
    // elbow link from the core out to the active node
    linkPath.setAttribute("d", `M0 0 L${(n.x * 0.55).toFixed(1)} ${(n.y * 0.1).toFixed(1)} L${n.x.toFixed(1)} ${n.y.toFixed(1)}`);
    const len = linkPath.getTotalLength();
    gsap.fromTo(linkPath, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.7, ease: "expo.out" });
  };
  setStep(0);

  ScrollTrigger.create({
    trigger: ".domain__pin",
    start: "top top",
    end: () => "+=" + innerHeight * 3,
    pin: true,
    scrub: true,
    onUpdate: self => {
      const p = self.progress, n = NODES.length;
      setStep(Math.min(n - 1, Math.floor(p * n)));
      bars.forEach((b, k) => (b.style.width = Math.max(0, Math.min(1, p * n - k)) * 100 + "%"));
      gsap.set(".map-rings", { rotation: p * 50, svgOrigin: "0 0" });
    },
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
    ["CASE NOTE", "Next.js · FastAPI · 10 agents"],
    ["CASE NOTE", "Python · ffmpeg · edge-tts"],
    ["CASE NOTE", "Roblox · Luau · UI/UX"],
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
    shorts: {
      tag: "Personal pipeline · 2026",
      title: "AI Shorts Engine",
      lede: "주제 선정부터 1080×1920 완성 영상까지, 하루 두 번 사람 손 없이 돌아가는 숏폼 생성 파이프라인. 로컬에서 엔드 투 엔드 검증 완료.",
      facts: [
        ["Script", "claude CLI로 구조화된 JSON 스크립트 생성"],
        ["Voice", "edge-tts의 WordBoundary 이벤트로 단어 단위 자막 타이밍 확보 — 원문을 이미 알기에 음성 정렬(Whisper)이 필요 없다는 설계 판단"],
        ["Captions", "Pillow로 단어별 PNG를 렌더해 투명 트랙으로 합성 (libass 없는 ffmpeg 환경 대응, 결과적으로 이식성↑)"],
        ["Compose", "Pexels B-roll + ffmpeg overlay, ffprobe·프레임 검사로 출력 검증"],
        ["Safety", "launchd 스케줄, 업로드는 기본 비활성 — 사람이 결과를 본 뒤에만 켜도록 설계"],
      ],
    },
    dashdash: {
      tag: "Roblox game · Luau",
      title: "DashDash",
      lede: "비트에 맞춰 야간 고속도로를 달리며 유리 게이트를 통과하는 리듬 레이싱 게임. 게임 UI/UX와 제작 툴링을 맡았습니다.",
      facts: [
        ["UI", "대시보드 카드, 상점/인벤토리 모달, 실시간 등급 HUD — 세 화면이 하나의 등급 함수를 공유해 숫자가 항상 일치"],
        ["Tooling", "약 3,600줄 규모의 채보(차트) 에디터 플러그인"],
        ["Debugging", "플레이테스트 중 저장한 데이터가 사라지는 문제를 영속 미러 + 모드 전환 시점 동기화로 해결"],
        ["UX audit", "최소 글자 크기, 세이프 에어리어, 터치 타깃, 빈 상태 화면 등 1차 개선 적용"],
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

  gsap.from(".foot__word", {
    yPercent: 60, ease: "none",
    scrollTrigger: { trigger: ".foot", start: "top bottom", end: "bottom bottom", scrub: true },
  });

  addEventListener("load", () => ScrollTrigger.refresh());
  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
