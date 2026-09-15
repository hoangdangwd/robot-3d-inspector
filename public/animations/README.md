# Animation sources

The project owns a local copy of four baked Quaternius Universal Animation
Library clips. No demo project, GLB download, remote animation service, or
`example/` directory is needed to build or run the game.

- Motion data: `src/robots/motions/quaternius-clips.json`
- Runtime adaptation: `src/robots/ReferenceMotion.js`
- Original publisher: https://quaternius.com/
- Pack: https://quaternius.com/packs/universalanimationlibrary.html
- License: CC0 1.0 Universal (see `UAL1-LICENSE.txt` and `UAL2-LICENSE.txt`)
- Imported content: animation transforms only, not meshes, skinning, or branding.

## JSON format

Each named source clip contains:

- `source`: provenance string;
- `duration`: seconds;
- `times`: increasing sample times in seconds;
- `rotations`: the 15 rigid R15 parts, each with flattened local XYZW quaternions;
- `positions`: flattened XYZ pelvis offsets normalized by the source hip height.

The baked coordinate contract is forward +Z, up +Y, anatomical left +X.
Destination segment lengths remain those of each robot. The adapter preserves
character stance at the ends of strikes and aligns source extension to the
presentation marker. These markers never apply damage.

## Usage

| Source | Game clips |
| --- | --- |
| UAL1 / Punch_Jab | jab, body_jab |
| UAL1 / Punch_Cross | cross, body_cross |
| UAL1 / Walk_Loop | walk_forward, walk_backward (guard retained) |
| UAL2 / Melee_Hook | hook_left/right torso motion, combined with authored boxing arms |

The other actions and character signatures remain locally authored in
`RobotAnimations.js` and `combatMotionVocabulary.js`. The JSON is the source
motion subset, not a claim that all 200 generated robot clips are imported.

Validation: `pnpm validate:motion` (also included in `pnpm validate`).
