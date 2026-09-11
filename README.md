# Robot Foundry

A Three.js showcase for original robot fighters assembled from an R15-like contract of exactly 15 rigid body parts. Every animation rotates or translates discrete objects; the project does not use bones, skinning, or character rigs.

## Included fighters

- **Forge Titan** — compact heavy brawler with furnace core, heat sinks, and oversized flywheel fists.
- **Aegis Prime** — tall defensive sentinel with tower shoulders and layered guard plates.
- **Vanta Razor** — narrow evasive counter-fighter with swept sensors and forearm vanes.
- **Volt Kestrel** — athletic technical striker with shoulder capacitors and split-toe stabilizers.
- **Solstice Mantis** — long-limbed range duelist with rising shoulder fins and a knee-to-cross signature.

Each fighter has a bevelled, layered hard-surface body, distinct proportions/palette, six comparison stats, and a 40-clip full-pose rigid animation library: shared movement, attack, defense and recovery verbs plus six authored character clips. See [animation coverage and limitations](docs/ANIMATION_LIBRARY.md). Signature moves differ in choreography—not just their names. See [the fighter design notes](docs/ROBOT_SHOWCASE.md).

## Run locally

Use npm with a Node.js version supported by Vite 8. Commit `package-lock.json`; use `npm ci` for subsequent reproducible installs.

```bash
npm install
npm run dev
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
npm run validate
npm run build
npm run preview
```

## Live coaching and Cloudflare Worker fallback

Fight Mode supports bilingual local coaching in English (`en-US`) and Vietnamese (`vi-VN`). Short commands are parsed locally first; optional browser Web Speech input and text input use the same validated `DirectCommand` / `BlackboardOverride` boundary. Audio and transcripts are not persisted.

Unknown short phrases can optionally use the Cloudflare Worker fallback at `/api/coach/interpret`. The Worker validates model output and never receives combat authority. Workers AI is configured as an optional server-side binding; if it is unavailable, the game reports a non-blocking fallback message and autonomous combat continues.

Local frontend + Worker development uses two terminals:

```bash
npm run worker:dev              # http://127.0.0.1:8787
npm run dev                     # Vite proxies /api to the Worker
```

Deploy only after `npm exec -- wrangler login` and configuring the production `ALLOWED_ORIGIN` variable:

```bash
npm exec -- wrangler deploy --dry-run
npm run worker:deploy
```

Do not put model keys in the browser. The current Workers AI binding does not require a browser secret. See `wrangler.jsonc` and `worker/coach-api.js`.

`validate:robots` checks five unique fighters, 15 rigid pivots each, authored heights, 200 complete clips, semantic coverage, distinct pose variants/signatures, single rotation ownership, ground contact, down/get-up endpoints, and pause/seek/frame-step behavior. It fails on bones, skinned meshes, non-finite tracks, or animation scale channels.

For browser smoke tests, start Vite with `npm run dev -- --port 5188` and run `npm run test:browser`. This uses a temporary isolated Edge profile and CDP, with no extra test dependencies. Set `EDGE_PATH` for a different Chromium executable and `SHOWCASE_URL` for another server. Results and screenshots go to `artifacts/animation-library/`.

Stats are design comparisons (0–100), not authoritative damage or simulation results. Combat, autonomous AI, local coaching, bounded tactical playbooks, Time-outs, match lifecycle, local replay persistence and History are implemented for the current vertical slice. Strategy-level tactical schema v2, bounded intent resolution and multi-tactic Time-out editing are implemented for the current slice. Visual branch-graph authoring, selectable Fight Mode matchups and physical-device release sign-off remain future work. See `docs/GAMEPLAY.md`.

## Volt pattern / animator review

- [Robot patterns and animator storyboard](docs/ROBOT_PATTERNS.md).
- `/?qa&pattern=volt`: deterministic jab→cross review; five responses, pause/step/slow playback. Does not save tactics or match history.
- `/?qa&opponent=volt`: ordinary autonomous Forge vs Volt match, with normal coaching/playbooks.
- `npm run validate:robot-patterns`; with dev server running, `npm run test:browser:patterns`.
- Only Volt has a new built-in pattern in this slice. Existing clips still need phase-sync and paired visual sign-off.

## Combat and animation team reference

See [Attack–Defense Matrix v2](docs/ATTACK_DEFENSE_MATRIX.md) for the 80-cell combat table, animation briefs, timing sheet and review checklist. Run `npm run validate:attack-defense` to check coverage and contact gates. Replay logs now use v2; v1 logs are incompatible with the changed contact rules. Existing animation clips still need phase-synchronized playback and paired visual review against this contract.

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
