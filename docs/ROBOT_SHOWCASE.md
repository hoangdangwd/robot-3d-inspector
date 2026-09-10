# Robot Foundry — five-fighter design

This is a presentation/content slice, not a replacement for `GAMEPLAY.md`. No combat rules changed. The numeric attributes are authored 0–100 comparison ratings, not damage coefficients, hit authority, or implemented AI. Each robot has tradeoffs rather than all high scores.

## Identity matrix

| Fighter | Shape / hardware | Movement personality | Signature choreography | Strength / cost |
|---|---|---|---|---|
| Forge Titan | Broad short chassis, orange foundry plates, cyclops optic, twin heat stacks, oversized flywheel gauntlets | Slow loaded shoulders, low guard, wide planted stance | Furnace Breaker: load both fists low → double rising hammer → heavy recovery | Power 96 / armor 91; speed 42 / mobility 34 |
| Aegis Prime | Tall white-blue armor, raised tower pauldrons, masked helmet, shield forearms | Symmetric high guard, minimal wasted motion | Bastion Counter: close shell → recoil → precise right straight → close shell | Guard 98 / range 87; mobility 48 |
| Vanta Razor | Thin charcoal frame, magenta slit eyes, swept fins, narrow waist, forearm vanes | Asymmetric low lead hand, torso sway, slip and feint | Razor Feint: half jab → withdraw shoulder → outside slip → fast cross | Mobility 99 / hand speed 97; armor 29 |
| Volt Kestrel | Athletic teal chassis, yellow accents, exposed capacitors, diagnostic chest ring | Quick alternating rhythm and compact combinations | Arc Combination: left jab → right cross → reload → right uppercut | Hand speed 89 / mobility 82; armor 49 |
| Solstice Mantis | Long limbs, purple/orange, raised shoulder fins, long masked face | Extended lead guard, lean-back range defense, controlled tempo | Solar Scissor: torso angle → left knee chamber → plant → long right cross | Range 99 / mobility 92; armor 36 / guard 47 |

Each fighter now owns 40 clips: six character clips (idle, defense, light strike, heavy strike, signature, celebration) and 34 shared combat verbs with per-style variants. Semantic IDs preserve the action when changing fighters. UI duration comes directly from the AnimationClip. See [animation library contract](ANIMATION_LIBRARY.md) for coverage, state transitions, verification and production limitations.

## Geometry contract

- Three.js, metres, +Y up, +Z forward. Anatomical left is +X when viewed from the front.
- Exactly 15 semantic animated Group pivots: Head, UpperTorso, LowerTorso, paired UpperArm/LowerArm/Hand and UpperLeg/LowerLeg/Foot.
- Armor/optics/bolts/trim belong to one rigid part. Fixed meshes are merged by material inside each pivot.
- No Bone, Skeleton, SkinnedMesh or scale animation.
- Geometry is original procedural chamfered/tapered armor with fixed mechanical detail. It is stylized, not a photoreal asset pack.
- Authored meter height is normalized once at the factory boundary; a dedicated studio avoids ring-rope occlusion.

## Animation contract

Each clip owns all 15 quaternion channels plus hips position. Unspecified joints inherit that fighter's base stance while authoring, not whatever a previous action left behind. Distinct pose sequences, anticipation/strike/recovery beats and durations express personality. Animation selection remains a preview, never applies damage.

Seek cancels fades and pauses for deterministic inspection. Frame-step pauses. Resume, looping, repeated clip selection, speed persistence, and resource disposal have explicit ownership in `Fighter`/app. Sole sampling grounds standing clips; precise body bounds ground knockdown/down/get-up. The latter never loop automatically. This is not full foot-lock IK or physics.

## Showcase

An isolated responsive viewport reserves space for the entire fighter. Studio environment reflections, neutral key/fill/rim lights and a low plinth replace the obstructed ring presentation. The dossier compares six stats and links the actual signature clip. Desktop has roster, viewport and dossier; mobile stacks them. The light-themed Motion Library filters by family and shows descriptions and presentation phases. Canvas lives inside the viewport DOM so scrolling does not reposition it in JavaScript.

## Limits

- Animation is authored display motion, not collision-tested combat; inter-part intersection can occur at extreme poses. No full-body IK, locomotion simulation, opponent contact or hit resolution.
- Stats/personality metadata are ready to inform future local combat systems but do not yet drive autonomous fighting.
- Hardware performance must be measured on target devices. SwiftShader browser captures are correctness/visual evidence, not FPS promises.
