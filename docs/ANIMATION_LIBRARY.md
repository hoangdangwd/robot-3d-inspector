# Fighting animation library — implementation contract

## Research and scope

Reference inspected: https://github.com/implicit-invocation/robot-animations (`src/motion.ts`). Useful principles: separate anticipation/extension/recoil, distinct movement verbs, whole-body coordination, planted support and short transitions. Its imported clips are separate third-party assets; no imported animation data, robot meshes or branding are copied here.

The previous local implementation already used full-pose Euler keyframes converted to quaternion tracks. Increasing sample rate alone does NOT make attacks decisive. Timing, extension/recoil and leg/hip/shoulder coordination do. Also, writing Euler Y and quaternion tracks on the SAME pivot is conflicting ownership; this must be removed.

This is a boxing-oriented **presentation baseline**, not a complete fighting-game simulation or final production animation pack. Simulation remains responsible for movement, action legality, damage, interrupts and contact. No new kick/grapple rules are introduced. Existing signature choreography is preserved.

## Plan / acceptance

1. Foundation: stable semantic IDs, one rotation track per joint, clip metadata (family, playback, entry/exit pose, presentation impact markers). Test missing coverage and conflicting rotation ownership before implementation.
2. Content: 40 clips per robot = six character clips + 34 shared verbs with style-specific pose/tempo/weight-transfer variants. All 15 pivots remain rigid. Fall, down and get-up share a matching endpoint and never automatically loop.
3. Inspector: category filter, semantic selection across robot switches, description/phase readout; six keyboard shortcuts apply to visible cards. No robot/mesh changes.
4. Verification: all clips sampled, normalized quaternion/finite transform checks, endpoint contracts, seek order independence, ground support, speed/frame-step/one-shot tests; browser coverage of every clip and desktop/mobile filters. Document limitations honestly.

## Shared verbs (34)

- Movement (8): walk forward/backward, strafe left/right, pivot left/right, advance step, retreat step.
- Attacks (10): jab, cross, left/right hook, left/right uppercut, body jab/cross, overhand, jab feint.
- Defense (8): high/low guard, left/right parry, left/right slip, duck, roll under.
- Reactions (8): left/right head hit, body hit, stagger, guard break, knockdown, down hold, get up.

Character clips (6): idle, character defense, character light/heavy attack, signature, victory. Stable IDs decouple these semantics from their displayed robot-specific names.

## Variant direction

| Style | Foundation variation |
|---|---|
| Forge | Wide compact guard, deeper knee load, slower recovery, large shoulder commitment; short heavy steps |
| Aegis | Small torso excursion, high closed rear guard, deliberate stepping, compact counters |
| Vanta | Side-on low lead guard, larger lateral slip, sharp recoil, narrow evasive footwork |
| Volt | Spring-loaded knee rhythm, short rapid attack cycles, alternating arm/leg counterbalance |
| Mantis | Extended lead guard, longer strides, long straight extension, patient recovery and lean-based defense |

Shared verbs are parameterized choreography, not forty hand-authored independent performances per fighter. Bespoke signatures remain separately authored.

## Animation boundary

- Forward +Z; meters after RobotFactory height normalization; local joint Euler authoring converted to quaternions.
- One quaternion track for each of 15 parts. Pelvis turn is composed into its quaternion, never a second Euler track.
- In-place locomotion: simulation must supply arena translation/yaw. No animation-driven teleport or damage.
- `impacts` are normalized presentation markers only, NOT authoritative hit windows.
- `playback`: cycle (idle/locomotion), repeatable (closed action), once/hold (non-closed fall/recovery).
- Down/get-up use whole-body geometry grounding, not standing-foot grounding. No physics/ragdoll claim.
- Left/right naming is anatomical, independent of camera view.

## Remaining production work

Opponent contact alignment, simulation velocity matching, true support-foot IK/plant locks, collision-aware armor poses, interrupted-action transitions, contextual injury/fatigue/entrance/timeout performances, and physical-device animation/performance review remain separate work. This library provides the core combat vocabulary, not proof of complete game readiness.
