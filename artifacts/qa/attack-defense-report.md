# Attack–Defense v2 verification

Scope: semantic contact matrix + animation-team contract. This is not animation/contact visual sign-off.

## Implementation

- `src/combat/AttackDefenseMatrix.js`: frozen 10 × 8 table plus attack hand/zone/trajectory metadata.
- Simulation resolves coverage only after range/facing and active defense gates; wrong-zone guard is a clean hit, no universal dodge/parry.
- AI base scores down incompatible defenses; explicit coaching/tactic requests are not rewritten.
- Replay log v2 rejects v1, which cannot reproduce old rules faithfully.
- `docs/ATTACK_DEFENSE_MATRIX.md`: Vietnamese table, animation briefs, timing and authoring checklist; tests verify table/timing against code.

## New evidence

- RED: `node scripts/validate-attack-defense.mjs` initially failed because body_jab vs duck returned `missed` rather than `hit`.
- GREEN: `npm run validate:attack-defense` passes 80 pairs across six profiles (five robots + neutral), plus 252 real-intent phase-boundary fixtures. Checks damage/posture/stun, facing, range, invalid status, contact dedup and documentation consistency.
- `npm run validate`: PASS, including robot/animation validation and all included domain suites.
- AI matrix: 45/45 deterministic KO bouts, 3,486 actions, 1,752 contacts, 16 action kinds. Not proof of competitive balance.
- `npm run validate:phase9`: PASS.
- `npm run build`: PASS.
- `npm run security:smoke`: PASS.
- Browser acceptance Fight Mode stage: PASS, 0 errors (includes new replay export version assertion).
- Browser acceptance showcase stage: PASS, 5 fighters / 200 clips, desktop + mobile, 0 errors.
- Full `npm run test:acceptance`: NOT PASS. Two attempts fail at mobile touch navigation (`showcase` instead of `fight`) in `scripts/touch-smoke.mjs:72`, after Fight Mode/showcase stages pass.
- Isolated `SHOWCASE_URL=http://127.0.0.1:5173 npm run test:browser:touch`: PASS.
- Isolated production preview `SHOWCASE_URL=http://127.0.0.1:5236 npm run test:browser:touch`: PASS. Root cause of suite-only touch failure remains unconfirmed; not silently skipped or claimed fixed.
- Isolated production preview performance smoke: PASS, 332 calls, 61,918 triangles, 146 geometries, 4 textures. Software-rendered observed FPS is not a hardware benchmark.

Existing screenshot/performance baseline artifacts were restored after test generation to avoid mixing historical visual baselines with unreviewed matrix-v2 animation evidence. This report retains current-run findings.

## Remaining work

1. Phase-sync presentation playback to authoritative simulation timing; current FightMode selects clips by phase without phase warping.
2. Re-author/review paired animation coverage, especially roll vs straight and overhand vs directional slip. Existing procedural clips were not changed here.
3. Diagnose suite-only touch navigation failure before calling full browser acceptance/release green.
4. Rebalance matchup outcomes after player playtests; matrix correctness alone is not balance.
