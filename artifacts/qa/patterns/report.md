# Volt one-two — verification, slice 1

## Scope

One built-in Volt pattern integrated into CombatBrain, using validated tactic sequence data and the existing TacticRuntime. Execution acknowledgment, seeded selection, cooldown, aborts and coaching precedence are handled outside the sequence definition. Other robots retain their previous behavior.

Animator documentation: `docs/ROBOT_PATTERNS.md`.
Review URL: `/?qa&pattern=volt`.
Autonomous matchup URL: `/?qa&opponent=volt`.

## Evidence

- RED before implementation: `validate-robot-patterns.mjs` failed `Volt must have a built-in jab–cross pattern`.
- `npm run validate:robot-patterns`: PASS. Real simulation assertions cover recovery before cross, deterministic runs, five review responses, facing/stamina/down/range/override/competing-command aborts, cooldown, probabilistic skip, utility fallback, playbook priority and reset.
- `npm run validate`: PASS (includes new pattern test and existing matrix/domain/AI tests).
- `npm run validate:phase9`: PASS.
- `npm run build`: PASS.
- `npm run security:smoke`: PASS.
- `npm run test:browser:patterns`: PASS against dev and production preview with headless Edge/Playwright. Five outcomes, pause/step/play/reset, storage unchanged, no page errors. Also verifies actual pattern activation in the ordinary autonomous Forge vs Volt matchup using simulation ticks, not forced pattern selection.
- Existing Fight Mode browser smoke: PASS, 0 errors.
- Full `test:acceptance` was not rerun in this slice. Previously recorded suite-only touch navigation failure is not claimed resolved.

## Review fixture outcomes

Baseline timing: jab starts 1/contact 8/ends 21; cross starts 22/contact 31/ends 47; pattern finished observed 48.

| Case | Cross result |
|---|---|
| none | hit |
| parry_left | parried; pattern aborted |
| parry_right | hit |
| too_early | hit |
| out_of_range | no cross request; pattern aborted before follow-up |

Screenshots `none.png`, `parry_left.png`, `parry_right.png`, `too_early.png`, `out_of_range.png` were captured at tick 31. These are generated review evidence, **not approved visual baselines**. The assistant's image reader could not display images in this session; visual inspection/sign-off was not performed.

## Limitations / next gate

- Existing clip playback still restarts by simulation phase rather than phase-synchronized sampling. Paired fist/head/parry alignment and readable recoil are not verified by passing contact tests.
- Current scene is specifically intended to let animators detect those mismatches against authoritative ticks; it does not hide them behind fake contact animation.
- No real Time-out correct-vs-wrong coaching playtest yet. Scripted responses demonstrate matrix outcomes, not player learning or competitive balance.
- No new pattern for the other four robots yet.
- No physical mobile/device or human combat-feel sign-off.
