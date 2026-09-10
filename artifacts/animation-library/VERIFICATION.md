# Combat animation vocabulary verification

## Delivered scope

40 clips per robot / five robots / 200 runtime clips. Six bespoke character clips are retained; 34 shared semantic actions are generated with per-style stance, range of motion, guard, recoil, lower-body load and timing. This is an in-place boxing presentation baseline, NOT a completed combat simulation or 200 independent mocap performances.

Research/contract: `docs/ANIMATION_LIBRARY.md`.

## Verification performed

- RED: `node scripts/validate-animation-library.mjs` failed on initial six-clip baseline (`6 !== 40`).
- GREEN: `pnpm validate:robots` passes both validation scripts.
  - Exactly 15 rigid pivots, no bones/skinning, unchanged scale.
  - 200 full-pose clips, 40 unique semantic IDs per fighter.
  - Finite normalized quaternions, one rotation binding per pivot (removed conflicting Euler Y binding).
  - Shared action coverage and five distinct sampled poses for each tested semantic action (not timing-only variants).
  - Seek/frame-step pause, deterministic repeated seeks, one-shot restart.
  - Closed clips return to stance; knockdown/down/get-up endpoints match.
  - Knockdown stays down even with global repeat enabled.
  - Whole-body geometry stays above floor at sampled times, body-grounding for down states.
  - Hook elbow stays close to shoulder plane. Visual review caught an overly raised elbow and it was corrected.
  - Completion of a fading-out action does not pause its replacement.
- `pnpm build`: PASS. Main JS ~682.14 kB / 178.25 kB gzip; existing >500 kB advisory remains.
- `git diff --check`: PASS.
- Production Vite preview at localhost:5196 + Edge/CDP browser smoke: PASS.
  - All 200 clip buttons selected via DOM and checked against runtime; real pointer input used for roster, categories, representative action/recovery and transport controls.
  - Desktop 1440×1000; mobile 390×844; category counts, no horizontal overflow, frame-step/speed/scrub.
  - Canvas tracks its DOM viewport on scroll with no camera reset.
  - Five signature pose trajectories and five unpaused Kestrel motion samples.
  - Captured runtime errors: 0; warnings: 0.
  - Test-owned browser and production preview closed after run.

## Evidence

`report.json`, per-robot idle/signature captures, `hook-impact.png`, `knockdown.png`, `down.png`, `get_up.png`, `mobile-library.png`, `motion-1.png` through `motion-5.png`.

Visual review covered representative poses, not every frame of all 200 clips. Browser uses SwiftShader; its FPS is NOT a hardware performance measurement.

## Limitations

Locomotion is in place. No simulation velocity matching, true horizontal foot lock/IK, opponent contact, procedural hit alignment, physics/ragdoll, or combat authority. Authored anticipation/impact markers do not resolve hits. Armor may intersect in extreme poses. Body-bounds grounding provides a stable preview floor, not physically simulated falling/get-up. Contextual injury, fatigue, clinch, entrances and timeout performances are not included. Existing signatures still require later contact/timing tuning against opponents.

The visual robot definitions and geometry were not modified for this task. Existing unrelated dirty files/deleted GLBs were preserved; no commit was created.
