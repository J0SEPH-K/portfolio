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

`work/gocreaty/` is a vanilla rebuild of GoCreaty's signed-in experience in this portfolio's style. `data.json` is a
snapshot pulled from the real backend against real trend data: 120 trending Shorts, each with its full analysis record
(reach verdict, 9 dimension scores, moment map, predicted retention, replication steps), view-count snapshots, 60
viral topics and the top creators. The "Ask" panel answers only from that Short's analysis record and cites the field.
