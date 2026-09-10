# Fighter redesign — current task

User: improve visual quality and give FIVE robots genuinely different animations, moves, and attributes; preserve rigid 15-part assembly.

Confirmed defects: old signature is the same hook renamed; old head details are below the face; straight narrow legs, box torso and fists; metallic surfaces have no environment reflections; ring ropes obscure the hero; frame-step does not pause; scrubbing during crossfade blends unrelated poses; mobile UI overlays model.

Plan:
1. Define five differentiated profiles, bounded preview stats, strengths/weaknesses and six authored motion entries each.
2. Replace crude shells with bevelled tapered layered armor, mechanical joints, inset optics and robot-specific hardware. Keep 15 animated pivots, merge fixed detail meshes per material/part.
3. Author complete poses per clip (all 15 rotations + root offset), distinct choreography, readable anticipation/recovery. Correct playback/scrub/pause and disposal; test deterministic motion below renderer.
4. Dedicated unobstructed studio viewport with PBR environment, neutral lighting and selectable accent. Add readable stats and move descriptions/timing in UI, no pretend combat results.
5. Build, Node assertions, browser input/screenshot verification across five robots and mobile. Report limits honestly.

No provider calls/paid assets. Reuse Three.js geometry, official addons, pnpm. Existing deleted GLBs and .mcp.json are user working-tree changes, preserve.
