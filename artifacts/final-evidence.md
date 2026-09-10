# Robot Foundry .02 — five-fighter redesign evidence

This report supersedes the earlier four-fighter prototype report. Old screenshots under `robot-showcase/` are retained as before-images, not evidence for the redesign.

## Delivered

- Five original procedural hard-surface fighters. Chamfered/tapered armor, layered chest, mechanical joint rings, knuckle detail, inset optics, robot-specific helmet/chest/shoulder/forearm hardware.
- Exactly 15 semantic rigid pivots per robot. Fixed surface details welded by material inside their owning part. No Bone/Skeleton/SkinnedMesh or animated scale.
- Two hundred full-pose presentation animation clips: 40 per fighter. Each fighter has bespoke identity clips plus shared semantic combat vocabulary variants.
- Six bounded design-comparison attributes, strengths/weaknesses, actual clip duration and Vietnamese move descriptions.
- Unobstructed PBR studio with environment reflections, key/fill/rim lights, ground shadows, common-scale camera framing and independent responsive viewport.
- Corrected seek/frame-step pause, complete pose ownership, repeated switching, one-shot replay, speed persistence and disposal.

## Checks executed

- `pnpm validate` — PASS.
  - Five unique catalog IDs and immutable authored definitions.
  - Fifteen named pivots, meter height and floor alignment for every robot.
  - Two hundred valid complete clips, no non-finite values or scale animation, closed loop endpoints.
  - Phase 0: 58 assertions; Phase 1: **46** (posture/knockdown/guard-break added); Phase 2: 27; Phase 3: 15; Phase 4 local coaching: **20** (command supersession added).
  - AI balance: 374 assertions across 45 deterministic bouts, 15 pairings, 3 seeds, 5,241 action starts, 2,467 contacts.
  - `validate:ai-balance` checks bounded KO progress, telegraph contracts, action diversity, deterministic traces, arena bounds and fighter separation.
  - Five distinct signature pose trajectories (not labels or timing-only changes).
  - Seek/frame-step pause and resume, one-shot completion/replay.
  - 25 samples per clip: finite world transforms, unchanged part scale, sole geometry on/above floor.
- `pnpm build` — PASS. Approximately 730 kB main bundle / 193 kB gzip. Non-fatal Vite 500 kB bundle advisory remains.
- `git diff --check` and JS syntax checks — PASS after normalizing CSS line endings.
- `SHOWCASE_URL=http://127.0.0.1:5190 pnpm test:browser` against production preview — PASS.
  - Isolated temporary Edge profile; CDP pointer clicks for roster, signatures, playback controls and Fight Mode coaching, DOM clicks for complete 200-clip coverage.
  - Five fighter selections, all 30 clip buttons, active UI metadata, pause/frame-step, slider input, speed persistence.
  - Signature samples from 0–100%, then an unpaused Kestrel sequence through a full loop.
  - Desktop 1440×1000, mobile 390×844 with viewport and scrolled attribute dossier captures.
  - Zero collected runtime exceptions, console errors, failed requests, or warnings in final run.
- `SHOWCASE_URL=http://127.0.0.1:5216 pnpm test:browser:fight` — PASS.
  - Fight Mode autonomous ticks, HP/stamina HUD, temporary `stay outside` override, Live Fight tactic boundary rejection, direct jab lifecycle, reset, exit and no-error checks.
- `pnpm validate:coach-worker` — PASS, 16 assertions; bounded fenced/prose/truncated/oversized model-output and v2 tactic proposal cases covered.
  - Worker rejects wrong methods, malformed JSON, unsupported languages, oversized/invalid boundaries and Live Fight tactic mutation.
- `pnpm validate:phase4` — PASS, 20 assertions (adds command supersession test).
- `pnpm validate:phase5` — PASS, 34 assertions; v1/v2 schema validation, migration, strategy resolver, wait/counter/move intents and multi-tactic priority arbitration.
  - Bounded tactic schema/cost, whitelist validation, trigger/sequence/abort/repeat runtime, capacity overflow, revision-safe local store and CombatBrain tactic intent boundary.
- `pnpm validate:phase6` — PASS, 17 assertions.
  - Three-use Time-out economy, consume-on-open/no-refund cancel, simulation pause/resume, atomic review commit, revision conflict, stale/malicious patch rejection.
  - Worker preserves request IDs, returns structured `AI_UNAVAILABLE`, accepts only validated Workers AI intents and rejects model actions outside the combat registry.
- `pnpm validate:phase7` — PASS, 40 assertions.
  - Seeded adherence/stress roll, miss reasons, no-illegal-action fallback, retained playbook history, explicit rollback and storage reload.
- `pnpm validate:phase8` — PASS, 46 assertions after replay-boundary and persistence/history hardening.
  - KO/time/draw lifecycle, terminal pause, reset/retry, versioned replay export/playback, authoritative input capture, `ReplayPlayer` playback/seek, replay import/retention, malformed/corrupt persistence fallback and incompatible-version rejection.
- `pnpm validate:phase9` — PASS, 25 deterministic acceptance assertions, including autonomous contact/health progression, complete knockdown command rejection, stamina exhaustion and reset continuation.
  - Offline autonomy/result/retry, impossible-command legality, temporary blackboard expiry, Live Fight tactic boundary, three-use Time-out economy and replay round-trip.
- `pnpm test:worker:production` — PASS.
  - Live Worker health, exact CORS origin, deterministic local fast-path command, invalid payload and blocked-origin checks.
- `pnpm test:acceptance` — PASS.
  - Starts a production preview and runs Fight Mode (including replay playback & match history dialog), showcase desktop/mobile and reduced-motion browser smoke with 0 errors.
- `pnpm test:phase9` — PASS.
  - Full release-oriented validation chain: deterministic acceptance, all regression validators, security scan, deterministic production Worker infrastructure smoke and production-preview browser acceptance. The model-dependent Worker AI canary is separately opt-in; unknown model phrases now degrade to safe `MODEL_UNRECOGNIZED` instead of mutating combat or exposing a gateway failure.
- `pnpm exec wrangler deploy --dry-run` — PASS. Worker bundle approximately 33.6 KiB compressed approximately 9.4 KiB after tactic-patch proposal support; AI binding and origin variable are configured.
- Worker production deployment — PASS at `https://robot-foundry-coach.hieudo831.workers.dev`; latest deployed version includes bounded model-output extraction, safe `MODEL_UNRECOGNIZED` degradation and `/api/coach/tactic-patch` proposal validation.

## Phase 9 QA evidence

- QA-only deterministic hooks are gated behind `?qa=1` and support seed, active-play state, pause-for-capture and reduced motion.
- Canvas inspector passed against the production preview with seed `9001` and zero console/page errors:
  - `artifacts/qa/active-desktop/`
  - `artifacts/qa/active-mobile/`
  - Production captures: `artifacts/qa/production-desktop/` and `artifacts/qa/production-mobile/`.
- Mobile touch smoke covers touch navigation, Fight Mode, Time-out open/cancel, reset and overflow.
- Active-scene performance evidence is in `artifacts/qa/performance.json`.
- Consolidated release QA report: `artifacts/qa/release-report.md`.
- Added `public/favicon.svg` after the inspector identified a preview 404.
- Added `@playwright/test` and `pngjs` as project QA dependencies for measured canvas inspection.

The QA performance sample recorded 332 renderer calls, 61,918 triangles, 146 geometries and 4 textures. The approximately 5.5–6.5 FPS reading came from Edge headless SwiftShader and is not a hardware claim. Renderer-call tuning and physical Android/iOS profiling remain open. The deployed frontend also passed direct Fight Mode/showcase smoke and desktop/mobile canvas inspection.

## Visual evidence

All current captures: `artifacts/redesign/`.

| Fighter | Idle screenshot | Signature screenshot |
|---|---|---|
| Titan | `forge-titan.png` | `forge-titan-signature.png` |
| Aegis | `aegis-prime.png` | `aegis-prime-signature.png` |
| Vanta | `vanta-razor.png` | `vanta-razor-signature.png` |
| Kestrel | `volt-kestrel.png` | `volt-kestrel-signature.png` |
| Mantis | `solstice-mantis.png` | `solstice-mantis-signature.png` |

- `mobile-stage.png`: unobstructed mobile hero and animation selector.
- `mobile-stats.png`: readable attributes/tradeoffs/signature description.
- `motion-1.png` … `motion-5.png`: unpaused Kestrel signature snapshots. `fight-mode.png` captures the two-fighter Fight Mode layout and HUD. `report.json` retains sampled animation times and pause state; software screenshot latency means spacing is not uniform.
- `report.json`: runtime diagnostics, signature quaternion samples, motion times, errors/warnings.

Inspected captures show distinct silhouette/material features, full body framing, changing rigid poses, and planted support feet; no collapsing body or skin deformation. A masked-eye defect on the two slim helmets was found and fixed. These are stylized geometry assets, not photoreal production models.

## Build & Performance diagnostics

- `pnpm build`: Vite `manualChunks` divides the client bundle into two clean chunks:
  - `vendor-three-*.js`: 604.10 kB (152.60 kB gzip) — Three.js engine and math.
  - `index-*.js`: 183.45 kB (55.43 kB gzip) — game simulation, UI, AI, tactics, coaching and models.
  - Build completes in ~330 ms with **0 large-chunk warnings**.

Entire studio + selected fighter, including shadow pass:

| Robot | Calls | Triangles |
|---|---:|---:|
| Titan | 188 | 30,754 |
| Aegis | 192 | 29,758 |
| Vanta | 192 | 28,418 |
| Kestrel | 190 | 31,466 |
| Mantis | 192 | 30,246 |

Below the reference desktop budget of 300 calls. Above the reference mobile call target of 150: retained fixed mechanical detail and studio ticks for this visual iteration. No hardware/mobile FPS claim. Browser evidence uses SwiftShader software rendering (~3–6 FPS during screenshot capture), which is not representative of an accelerated browser.

## Limitations / scope boundaries

- Presentation animation remains separate from authoritative simulation. Combat includes 18 registered moves, health/stamina/posture, contact, defense, KO/knockdown/get-up, autonomous CombatBrain, local coaching, bounded tactical runtime, Time-out/editor, adherence, one timed-round result lifecycle and domain replay export/playback.
- Phase 4A is local/free: bilingual text parser plus optional browser Web Speech API. Phase 4B adds an optional Cloudflare Worker/Workers AI fallback; Phase 6 adds reviewed tactic-patch proposals. Phase C adds schema v2 strategy intents, v1 migration, profile-dependent TacticalIntentResolver and bounded multi-tactic Time-out editing. No audio recording or transcript persistence. Browser/vendor speech processing behavior is outside app control. Worker deployment is live at `https://robot-foundry-coach.hieudo831.workers.dev` with `ALLOWED_ORIGIN` configured to `https://robot-foundry-7m7.pages.dev` and verified with live cross-origin requests. Model updated to `@cf/meta/llama-3.2-3b-instruct` after upstream deprecation of 3.1-8b.
- Animation is presentation choreography with sole grounding, not full-body IK/physics. Extreme joint poses can intersect armor; combat contact still needs simulation-driven tuning.
- Desktop and one portrait viewport verified; production-preview browser acceptance and reduced-motion checks pass. Physical touch-device performance, broader browser compatibility, hardware frame-time/memory profiling and visual expert sign-off are not established. Cloud replay sharing and multi-round scoring remain deferred; local replay download/import/retention, result history and settings hydration are implemented.
- Existing deleted GLBs, loader deletion from the prior task, and `.mcp.json` working-tree changes were preserved; no commit was made.

Design contract: `docs/ROBOT_SHOWCASE.md`. Gameplay truth remains `docs/GAMEPLAY.md`.
