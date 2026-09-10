# Robot Foundry — Phase 9 QA evidence

Run date: current working revision

## Result

The current release candidate passes the automated functional, browser, touch, visual-canvas, security and production-preview checks. The build is suitable for continued preview/deployment use as an advanced playable vertical slice.

This is not a physical-device sign-off. Edge CDP and Playwright captures provide browser evidence; the performance script intentionally uses SwiftShader and must not be read as a hardware FPS claim.

## Commands passed

- `pnpm build`
- `pnpm test:acceptance`
- `pnpm test:phase9`
- `pnpm test:browser:touch`
- `pnpm test:browser:performance`
- `pnpm security:smoke`
- `pnpm test:worker:production`
- `RUN_AI_CANARY=1 node scripts/worker-ai-canary.mjs`
- `git diff --check`

`pnpm test:acceptance` now runs:

1. Fight Mode functional journey.
2. Showcase/animation library desktop + mobile journey.
3. Mobile touch navigation, Time-out open/cancel, reset and overflow.
4. Active Fight Mode renderer/performance evidence.

## Visual evidence

The canvas inspector was run against the production preview with deterministic QA hooks and seed `9001`:

- `artifacts/qa/active-desktop/desktop-active-play.png`
- `artifacts/qa/active-desktop/desktop-active-play.json`
- `artifacts/qa/active-mobile/mobile-active-play.png`
- `artifacts/qa/active-mobile/mobile-active-play.json`

The same deterministic capture was repeated against the deployed frontend:

- `artifacts/qa/production-desktop/`
- `artifacts/qa/production-mobile/`

Both captures acknowledged `active-play`, paused the simulation before capture, reported non-blank varied canvas pixels, and reported zero console/page errors. Playwright used the local Intel UHD GPU for the canvas captures.

## Active-scene metrics

Source: `artifacts/qa/performance.json`.

- viewport: 1440×1000
- renderer calls: 332
- triangles: 61,918
- geometries: 146
- textures: 4
- simulation ticks during two-second sample: 72–84 across repeated runs
- observed FPS: approximately 5.5–6.5 under Edge headless SwiftShader

The low software-rendered FPS is expected for this harness and is not a hardware benchmark. Renderer calls are above the provisional 220-call local target and should remain a performance follow-up; triangle/geometry/texture counts are appropriate for the current slice but should be re-measured on representative Android/iOS hardware.

## Open release risks

- Physical Android/iOS touch, memory and frame-time matrix is still unavailable in this environment.
- Safari and Firefox compatibility are not signed off; only the available Edge/Chromium browser paths were exercised.
- Expert visual review of telegraph readability, hit/block/parry timing, feet and contact alignment remains a human review item.
- Worker model canary may safely return `MODEL_UNRECOGNIZED`; local coaching and combat continue without the provider.
- Production frontend was redeployed to `https://robot-foundry-7m7.pages.dev`; direct Fight Mode/showcase smoke and desktop/mobile canvas inspection passed after deployment.

## QA implementation additions

- QA-only hooks are available only on URLs containing `?qa=1`; they support deterministic seed, active-play state, pause-for-capture, reduced motion and state acknowledgement.
- Added the Playwright/pngjs canvas inspector dependencies for measured current-run visual evidence.
- Added `scripts/touch-smoke.mjs` and `scripts/performance-smoke.mjs`.
- Added a favicon to remove the production-preview 404 observed by the canvas inspector.
