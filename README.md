# Jungjun Kim — Frontend for Industrial AI

Portfolio hub plus three live frontend demos, built with an agentic (Claude Code) workflow.

- `index.html`: hub (GSAP + ScrollTrigger + Lenis, canvas inspection field, pinned domain map)
- `work/vision-qc/`: machine-vision result console (defect overlays, threshold re-judging, yield)
- `work/rag-desk/`: grounded RAG chat UI (client-side BM25, streamed answers with citations, refusal when ungrounded)
- `work/grid-100k/`: 100,000-row virtualized data grid (filters, sort, aggregates, chart-as-filter)

Static site, no build step. All data is fictional sample data.

## Credits

The domain-map section re-implements the scroll behaviour of [Turion Space](https://www.turionspace.com)'s mission diagram
(sticky stage, 10-beat timeline, camera settle, orbiting units, sensor cones, capability panel). It was studied with
[REA](https://github.com/morluto/rea) static analysis plus source reading and rewritten here with this portfolio's own content.
The hero/work-list motion takes cues from [Bulletproof](https://www.wearebulletproof.com).

## GoCreaty demo

`work/gocreaty/` is the real GoCreaty frontend (Next.js 14), statically exported. The signed-in app is served
from API responses recorded off the real backend running against real (snapshot) trend data; `lib/demo/mock.ts`
answers requests in the browser, and write actions (analyze, chat) are simulated client-side.
