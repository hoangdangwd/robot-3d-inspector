# Robot Foundry

A Three.js showcase for original robot fighters assembled from an R15-like contract of exactly 15 rigid body parts. Every animation rotates or translates discrete objects; the project does not use bones, skinning, or character rigs.

## Included fighters

- **Forge Titan** — compact heavy brawler with furnace core, heat sinks, and oversized flywheel fists.
- **Aegis Prime** — tall defensive sentinel with tower shoulders and layered guard plates.
- **Vanta Razor** — narrow evasive counter-fighter with swept sensors and forearm vanes.
- **Volt Kestrel** — athletic technical striker with shoulder capacitors and split-toe stabilizers.
- **Solstice Mantis** — long-limbed range duelist with rising shoulder fins and a knee-to-cross signature.

Each fighter has a bevelled, layered hard-surface body, distinct proportions/palette, six comparison stats, and a 40-clip full-pose rigid animation library: shared movement, attack, defense and recovery verbs plus six authored character clips. See [animation coverage and limitations](docs/ANIMATION_LIBRARY.md). The imported Quaternius motion subset lives in `src/robots/motions/quaternius-clips.json`; [format, mapping and CC0 licenses](public/animations/README.md) are included locally. No separate demo directory is required. Signature moves differ in choreography—not just their names. See [the fighter design notes](docs/ROBOT_SHOWCASE.md).

## Run locally

Use pnpm with a Node.js version supported by Vite 8.

```bash
pnpm install
pnpm dev
```

Open the Vite URL, normally `http://localhost:5173`.

## Controls

- Select a fighter from the left roster.
- Filter the Motion Library by family (character, movement, attacks, defense, reactions, recovery); `1`–`6` select the first six visible clips.
- `Space`: play/pause.
- `Left` / `Right`: step one frame.
- `T`: toggle automatic orbit.
- `O`: reset camera.
- Drag in the studio viewport to orbit; use the wheel to zoom.
- Click the signature name in the dossier to preview it.
- On mobile, select a roster card; scroll down for the dossier and filtered Motion Library.

## Validation and production build

```bash
pnpm validate
pnpm build
pnpm preview
```

## Live coaching and Cloudflare Worker fallback

Fight Mode supports bilingual local coaching in English (`en-US`) and Vietnamese (`vi-VN`). Short commands are parsed locally first; optional browser Web Speech input and text input use the same validated `DirectCommand` / `BlackboardOverride` boundary. Audio and transcripts are not persisted.

Unknown short phrases can optionally use the Cloudflare Worker fallback at `/api/coach/interpret`. The Worker validates model output and never receives combat authority. Workers AI is configured as an optional server-side binding; if it is unavailable, the game reports a non-blocking fallback message and autonomous combat continues.

Local frontend + Worker development uses two terminals:

```bash
pnpm worker:dev                 # http://127.0.0.1:8787
pnpm dev                        # Vite proxies /api to the Worker
```

Deploy only after `pnpm wrangler login` and configuring the production `ALLOWED_ORIGIN` variable:

```bash
pnpm exec wrangler deploy --dry-run
pnpm worker:deploy
```

Do not put model keys in the browser. The current Workers AI binding does not require a browser secret. See `wrangler.jsonc` and `worker/coach-api.js`.

`validate:robots` checks five unique fighters, 15 rigid pivots each, authored heights, 200 complete clips, semantic coverage, distinct pose variants/signatures, single rotation ownership, ground contact, down/get-up endpoints, and pause/seek/frame-step behavior. It fails on bones, skinned meshes, non-finite tracks, or animation scale channels.

For browser smoke tests, start Vite with `pnpm dev --port 5188` and run `pnpm test:browser`. This uses a temporary isolated Edge profile and CDP, with no extra test dependencies. Set `EDGE_PATH` for a different Chromium executable and `SHOWCASE_URL` for another server. Results and screenshots go to `artifacts/animation-library/`.

Stats are design comparisons (0–100), not authoritative damage or simulation results. Combat, autonomous AI, local coaching, bounded tactical playbooks, Time-outs, match lifecycle, local replay persistence and History are implemented for the current vertical slice. Strategy-level tactical schema v2, bounded intent resolution, multi-tactic Time-out editing, selectable Fight Mode matchups (VS Setup Screen with player roster and CPU selection), 3D player ground indicator [YOU], and match outcome loop (Victory/Defeat banners, Rematch, Change Opponent, Return to Lab) are implemented for the current slice. Visual branch-graph authoring and physical-device release sign-off remain future work. See `docs/GAMEPLAY.md`.

## Volt pattern / animator review

- [Robot patterns and animator storyboard](docs/ROBOT_PATTERNS.md).
- `/?qa&pattern=volt`: deterministic jab→cross review; five responses, pause/step/slow playback. Does not save tactics or match history.
- `/?qa&opponent=volt`: ordinary autonomous Forge vs Volt match, with normal coaching/playbooks.
- `pnpm validate:robot-patterns`; with dev server running, `pnpm test:browser:patterns`.
- Only Volt has a new built-in pattern in this slice. Combat clips are phase-synchronized; complete paired visual sign-off is still needed. `pnpm validate:motion` covers local JSON data, phase sync at different render deltas, anatomical slips and planted support.

## Combat and animation team reference

See [Attack–Defense Matrix v2](docs/ATTACK_DEFENSE_MATRIX.md) for the 80-cell combat table, animation briefs, timing sheet and review checklist. Run `pnpm validate:attack-defense` to check coverage and contact gates. Replay logs now use v2; v1 logs are incompatible with the changed contact rules. Animation playback is phase-synchronized; paired visual review against this contract is still needed.

## Main structure

```text
src/robots/        Fighter catalog, procedural assembly, rigid animation clips
src/combat/        Authoritative fixed-step combat simulation, moves, Fight Mode bridge
src/ai/             Local autonomous CombatBrain, behavior profiles, temporary blackboard
src/coaching/       Bilingual parser, DirectCommand queue, Web Speech adapter
src/arena/          PBR showcase studio; retained legacy ring modules
src/camera/         Orbit and showcase camera controls
src/audio/          Procedural Web Audio feedback
src/ui/             Fighter roster, dossier, animation/coaching console, responsive styles
worker/             Optional Cloudflare Worker + Workers AI interpretation fallback
scripts/            Content, domain, Worker and browser smoke-test utilities
```
