/**
 * RobotAnimations.js
 *
 * Authored keyframe clips using the same technique as the reference repo:
 *   - Absolute local Euler poses per beat (radians)
 *   - smoothstep interpolation sub-sampled at ~120 fps
 *   - `turn` is composed into the pelvis quaternion on Y
 *   - `shift` offsets the hips in XYZ (relative to neutral hip height)
 *   - Every beat specifies the full body; unspecified parts fall back to
 *     the fighter's own guard/stance so they never freeze at an alien pose.
 */

import * as THREE from 'three';
import { R15_PART_NAMES } from './robotCatalog.js';
import { foundationClips } from './combatMotionVocabulary.js';

// ── helpers ──────────────────────────────────────────────────────────────────
const e = (x = 0, y = 0, z = 0) => [x, y, z];
const lerp = THREE.MathUtils.lerp;
const smooth = f => f * f * (3 - 2 * f);  // smoothstep

// Merge two pose objects; b overrides a, unset parts keep a's value.
const merge = (a, b) => ({ ...a, ...b });

// ── Base guard stances per fighter style ─────────────────────────────────────
function baseStance(style) {
  // Neutral anatomical rest — all joints
  const pose = {
    Head:          e(0.02,  0.15, 0),
    UpperTorso:    e(0.06,  0.10, 0),
    LowerTorso:    e(0,    -0.25, 0),
    LeftUpperArm:  e(-0.68, -0.12,  0.18),
    LeftLowerArm:  e(-1.62,  0,    0),
    LeftHand:      e(0,    0,    -0.08),
    RightUpperArm: e(-0.48,  0.10, -0.25),
    RightLowerArm: e(-1.58,  0,    0),
    RightHand:     e(0,    0,     0.08),
    LeftUpperLeg:  e(-0.26, -0.05,  0.08),
    LeftLowerLeg:  e(0.32,  0,    0),
    LeftFoot:      e(-0.06,  0.15, 0),
    RightUpperLeg: e(0.17,  0.12, -0.12),
    RightLowerLeg: e(0.23,  0,    0),
    RightFoot:     e(-0.40, -0.12, 0),
  };

  if (style === 'forge') return merge(pose, {
    UpperTorso:    e(0.10,  0,    0),
    Head:          e(-0.06, 0,    0),
    LeftUpperArm:  e(-0.22, -0.12, 0.30),
    LeftLowerArm:  e(-0.90, 0,    0),
    RightUpperArm: e(-0.26,  0.12, -0.30),
    RightLowerArm: e(-1.05, 0,    0),
    LeftUpperLeg:  e(-0.19, 0,    0.09),
    LeftLowerLeg:  e(0.38,  0,    0),
    LeftFoot:      e(-0.19, 0,   -0.09),
    RightUpperLeg: e(-0.19, 0,   -0.09),
    RightLowerLeg: e(0.38,  0,    0),
    RightFoot:     e(-0.19, 0,    0.09),
  });

  if (style === 'aegis') return merge(pose, {
    LowerTorso:    e(0,    -0.20, 0),
    LeftUpperArm:  e(-0.52, -0.10,  0.16),
    LeftLowerArm:  e(-1.55, 0,    0),
    RightUpperArm: e(-0.52,  0.10, -0.16),
    RightLowerArm: e(-1.55, 0,    0),
    LeftUpperLeg:  e(-0.18, 0,    0.06),
    RightUpperLeg: e(0.12,  0.08, -0.10),
  });

  if (style === 'vanta') return merge(pose, {
    UpperTorso:    e(0.12, -0.28, -0.06),
    LowerTorso:    e(0,   -0.28,  0),
    Head:          e(-0.12, 0.23, 0),
    LeftUpperArm:  e(-0.40, -0.20,  0.18),
    LeftLowerArm:  e(-0.50, 0,    0),
    RightUpperArm: e(-0.60,  0.20, -0.20),
    RightLowerArm: e(-1.28, 0,    0),
    LeftUpperLeg:  e(-0.20, -0.08, 0.10),
    RightUpperLeg: e(0.14,  0.18, -0.14),
  });

  if (style === 'volt') return merge(pose, {
    LowerTorso:    e(0,   -0.22,  0),
    LeftUpperArm:  e(-0.55, -0.10,  0.22),
    LeftLowerArm:  e(-1.40, 0,    0),
    RightUpperArm: e(-0.42,  0.10, -0.22),
    RightLowerArm: e(-1.48, 0,    0),
    LeftUpperLeg:  e(-0.22, -0.04,  0.06),
    RightUpperLeg: e(0.15,  0.10, -0.10),
  });

  if (style === 'mantis') return merge(pose, {
    UpperTorso:    e(-0.04, -0.24,  0.02),
    LowerTorso:    e(0,    -0.30,  0),
    Head:          e(0.04,  0.24,  0),
    LeftUpperArm:  e(-1.00, -0.18,  0.22),
    LeftLowerArm:  e(-0.28, 0,    0),
    LeftHand:      e(0,    0,    -0.22),
    RightUpperArm: e(-0.30,  0.18, -0.25),
    RightLowerArm: e(-1.32, 0,    0),
    LeftUpperLeg:  e(-0.24, -0.04,  0.08),
    RightUpperLeg: e(0.20,  0.14, -0.10),
  });

  return pose; // fallback
}

// ── Reusable partial poses (mixed into beats) ─────────────────────────────────
const JAB = {
  UpperTorso:    e(0.04, -0.22,  0),
  Head:          e(-0.04, 0.18,  0),
  LeftUpperArm:  e(-1.50, -0.03,  0.06),
  LeftLowerArm:  e(-0.06, 0,    0),
};
const CROSS = {
  UpperTorso:    e(0.04,  0.35,  0),
  Head:          e(-0.04, -0.25, 0),
  RightUpperArm: e(-1.48,  0.03, -0.07),
  RightLowerArm: e(-0.08, 0,    0),
};
const UPPERCUT = {
  UpperTorso:    e(-0.12,  0.35,  0.08),
  Head:          e(0.08,  -0.20, 0),
  RightUpperArm: e(-1.42,  0.10, -0.32),
  RightLowerArm: e(-1.00, 0,    0),
  RightHand:     e(0,     0.45,  0),
};
const SHELL = {
  UpperTorso:    e(0.08,  0,    0),
  Head:          e(0.12,  0,    0),
  LeftUpperArm:  e(-0.92, -0.12, -0.04),
  LeftLowerArm:  e(-1.85, 0,    0),
  RightUpperArm: e(-0.92,  0.12,  0.04),
  RightLowerArm: e(-1.85, 0,    0),
};

// ── Beat builder ──────────────────────────────────────────────────────────────
// pose: partial overrides (merged onto base stance inside compile)
// turn: root Y rotation (radians)
// shift: hip XYZ offset in local units
const beat = (t, pose = {}, turn = 0, shift = e()) => ({ t, pose, turn, shift });

// ── Clip compiler ─────────────────────────────────────────────────────────────
function compile(definition, name, category, duration, description, beats) {
  const base = baseStance(definition.featureStyle);
  const sampleCount = Math.max(12, Math.ceil(duration * 120));
  const times = [];
  const poseSamples = Object.fromEntries(R15_PART_NAMES.map(n => [n, []]));
  const shiftSamples = [];

  // Pre-resolve each beat's full pose by merging partial onto base
  const resolved = beats.map(b => merge(base, b.pose));

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;

    // Find surrounding beats
    let hi = beats.findIndex(b => b.t >= t);
    if (hi < 1) hi = 1;
    const a = beats[hi - 1];
    const b2 = beats[hi];
    const f = smooth(THREE.MathUtils.clamp((t - a.t) / (b2.t - a.t), 0, 1));

    times.push(t * duration);

    for (const partName of R15_PART_NAMES) {
      const ea = resolved[hi - 1][partName] || e();
      const eb = resolved[hi][partName] || e();
      // Compose turn into the pelvis quaternion: Euler and quaternion tracks
      // on the same Object3D overwrite one another in AnimationMixer.
      const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(ea[0], ea[1] + (partName === 'LowerTorso' ? a.turn : 0), ea[2], 'XYZ'));
      const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(eb[0], eb[1] + (partName === 'LowerTorso' ? b2.turn : 0), eb[2], 'XYZ'));
      poseSamples[partName].push(...qa.slerp(qb, f).toArray());
    }

    for (let axis = 0; axis < 3; axis++) {
      shiftSamples.push(lerp(a.shift[axis] ?? 0, b2.shift[axis] ?? 0, f));
    }
  }

  const p = definition.proportions;
  const hipY = (p.foot?.[1] ?? 0) + (p.lowerLegLength ?? 1.02) + (p.upperLegLength ?? 0.96);

  const tracks = R15_PART_NAMES.map(n =>
    new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, poseSamples[n])
  );
  tracks.push(new THREE.VectorKeyframeTrack('LowerTorso.position', times,
    shiftSamples.map((v, i) => i % 3 === 1 ? hipY + v : v)
  ));

  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { label: name, category, description };
  return clip;
}

// Stable semantics allow a future simulation to select moves without clip indices.
export function createRobotAnimations(definition) {
  const ids = ['idle', 'character_defense', 'character_strike', 'character_heavy', 'signature', 'victory'];
  const families = ['CHARACTER', 'CHARACTER', 'CHARACTER', 'CHARACTER', 'CHARACTER', 'CHARACTER'];
  const markers = { forge: [.50], aegis: [.62], vanta: [.60], volt: [.17, .40, .66], mantis: [.38, .78] };
  const bespoke = characterClips(definition);
  bespoke.forEach((clip, i) => Object.assign(clip.userData, {
    id: ids[i], family: families[i], playback: i === 0 ? 'cycle' : 'repeatable',
    entry: 'ready', exit: 'ready', grounding: 'feet',
    impacts: i === 4 ? markers[definition.featureStyle] : [],
  }));
  const foundation = foundationClips(definition, baseStance(definition.featureStyle)).map(spec => {
    const clip = compile(definition, spec.name, spec.family, spec.duration, spec.description, spec.beats);
    const { beats, name, duration, ...meta } = spec;
    Object.assign(clip.userData, meta);
    return clip;
  });
  return [...bespoke, ...foundation];
}

// Bespoke character clips are retained alongside the shared vocabulary.
function characterClips(definition) {
  const s = definition.featureStyle;
  const b = baseStance(s);

  // beat helper that auto-fills unspecified parts from base
  const bk = (t, pose = {}, turn = 0, shift = e()) =>
    beat(t, merge(b, pose), turn, shift);

  function clip(name, cat, dur, desc, beats) {
    return compile(definition, name, cat, dur, desc, beats);
  }

  // ── FORGE TITAN ──────────────────────────────────────────────────────────
  if (s === 'forge') return [
    // 1 — IDLE: piston breath, belly-down lean
    clip('Furnace Idle', 'IDLE', 2.8, 'Thấp trọng tâm, hai tay nặng. Nhịp thở chậm như piston.', [
      bk(0.00),
      bk(0.25, { UpperTorso: e(0.14, 0.06, 0), Head: e(-0.08, 0, 0), LeftLowerArm: e(-0.80), RightLowerArm: e(-0.95) }, 0, e(0, 0.018, 0)),
      bk(0.50, { UpperTorso: e(0.10, 0.02, 0) }),
      bk(0.75, { UpperTorso: e(0.14, 0.06, 0), Head: e(-0.08, 0, 0), LeftLowerArm: e(-0.80), RightLowerArm: e(-0.95) }, 0, e(0, 0.018, 0)),
      bk(1.00),
    ]),
    // 2 — DEFENSE: shell → absorb → shell
    clip('Anvil Guard', 'DEFENSE', 2.0, 'Khép hai găng, chịu lực bằng thân rồi mở guard.', [
      bk(0.00),
      bk(0.22, SHELL),
      bk(0.42, merge(SHELL, { UpperTorso: e(-0.14, 0, 0), Head: e(0.22, 0, 0) }), 0, e(0, -0.04, 0)),
      bk(0.62, SHELL),
      bk(0.82, merge(SHELL, { UpperTorso: e(-0.12, 0, 0) })),
      bk(1.00),
    ]),
    // 3 — STRIKE: low body jab (left, snapping elbow)
    clip('Body Driver', 'STRIKE', 1.4, 'Nạp vai trái, đấm thẳng thấp vào thân đối thủ.', [
      bk(0.00),
      bk(0.22, { UpperTorso: e(0.18, 0.28, 0), LeftUpperArm: e(0.12, 0.12, 0.30) }),
      bk(0.38, merge(JAB, { LeftUpperArm: e(-1.08, 0, 0.08), UpperTorso: e(0.16, -0.30, 0) })),
      bk(0.52, merge(JAB, { LeftUpperArm: e(-1.08, 0, 0.08) })),
      bk(0.75),
      bk(1.00),
    ]),
    // 4 — HEAVY: slow hook with shoulder coil
    clip('Foundry Hook', 'HEAVY', 1.8, 'Xoắn thân chậm, móc ngang bằng găng flywheel lớn.', [
      bk(0.00),
      bk(0.25, { UpperTorso: e(0.14, -0.44, 0), RightUpperArm: e(-0.35, -0.18, -1.05), RightLowerArm: e(-1.10) }, -0.12),
      bk(0.46, { UpperTorso: e(0.08, 0.50, 0), RightUpperArm: e(-1.20, 0.30, -0.80), RightLowerArm: e(-1.15) },  0.18),
      bk(0.60, merge(UPPERCUT, { UpperTorso: e(0.04, 0.40, 0) }), 0.10),
      bk(0.78),
      bk(1.00),
    ]),
    // 5 — SIGNATURE: Furnace Breaker — load both, coil, double uppercut
    clip('Furnace Breaker', 'SIGNATURE', 2.6, 'Hai găng nạp thấp → rút vai → bật double uppercut → hồi phục nặng.', [
      bk(0.00),
      bk(0.16, { UpperTorso: e(0.28, 0, 0), LeftUpperArm: e(0.30, 0, 0.40), RightUpperArm: e(0.30, 0, -0.40), LeftLowerArm: e(-0.75), RightLowerArm: e(-0.75) }, 0, e(0, -0.06, 0)),
      bk(0.34, { UpperTorso: e(0.18, 0, 0), LeftUpperArm: e(0.10, 0, 0.55), RightUpperArm: e(0.10, 0, -0.55) }, 0, e(0, -0.03, 0)),
      bk(0.50, { UpperTorso: e(-0.18, 0, 0), Head: e(-0.14, 0, 0), LeftUpperArm: e(-1.65, 0, 0.28), RightUpperArm: e(-1.65, 0, -0.28), LeftLowerArm: e(-0.85), RightLowerArm: e(-0.85) }, 0, e(0, 0.06, 0)),
      bk(0.62, { UpperTorso: e(-0.10, 0, 0), LeftUpperArm: e(-1.55, 0, 0.22), RightUpperArm: e(-1.55, 0, -0.22) }),
      bk(0.78, SHELL),
      bk(1.00),
    ]),
    // 6 — SHOWCASE: iron salute then fist raise
    clip('Iron Salute', 'SHOWCASE', 2.6, 'Đập hai găng trước ngực rồi nâng găng phải chậm và nặng.', [
      bk(0.00),
      bk(0.28, SHELL),
      bk(0.50, { RightUpperArm: e(-2.62, 0, -0.40), RightLowerArm: e(-0.30), Head: e(-0.10, 0, 0) }),
      bk(0.76, { RightUpperArm: e(-2.62, 0, -0.40), RightLowerArm: e(-0.30), Head: e(-0.12, 0, 0), UpperTorso: e(0.06, 0, 0) }),
      bk(1.00),
    ]),
  ];

  // ── AEGIS PRIME ───────────────────────────────────────────────────────────
  if (s === 'aegis') return [
    // 1 — IDLE: symmetric high guard, slow head scan
    clip('Sentinel Watch', 'IDLE', 3.2, 'Guard cao đối xứng, đầu quét chậm, thân gần như bất động.', [
      bk(0.00),
      bk(0.30, { Head: e(0, -0.18, 0) }),
      bk(0.60, { Head: e(0,  0.18, 0) }),
      bk(0.85, { Head: e(0, -0.10, 0) }),
      bk(1.00),
    ]),
    // 2 — DEFENSE: citadel shell, side lean left/right
    clip('Citadel Shell', 'DEFENSE', 2.2, 'Hai giáp cẳng tay khép cửa; nghiêng guard trái rồi phải.', [
      bk(0.00),
      bk(0.22, SHELL),
      bk(0.44, merge(SHELL, { UpperTorso: e(0.06, -0.18, 0) })),
      bk(0.66, merge(SHELL, { UpperTorso: e(0.06,  0.18, 0) })),
      bk(0.85, SHELL),
      bk(1.00),
    ]),
    // 3 — STRIKE: long jab, rear hand stays at cheek
    clip('Lockline Jab', 'STRIKE', 1.4, 'Đo khoảng cách bằng jab dài, giữ tay sau bảo vệ mặt.', [
      bk(0.00),
      bk(0.22, { LeftUpperArm: e(-0.88, -0.12, 0.12), LeftLowerArm: e(-0.52) }),
      bk(0.38, JAB),
      bk(0.56, JAB),
      bk(0.78),
      bk(1.00),
    ]),
    // 4 — HEAVY: parry-left then straight-right
    clip('Shield Return', 'HEAVY', 1.9, 'Gạt bằng cẳng tay trái rồi đáp straight phải, không vung rộng.', [
      bk(0.00),
      bk(0.28, { LeftUpperArm: e(-0.58, -0.52, 0.68), LeftLowerArm: e(-1.55), UpperTorso: e(0, -0.18, 0) }),
      bk(0.52, CROSS),
      bk(0.66, CROSS),
      bk(0.84),
      bk(1.00),
    ]),
    // 5 — SIGNATURE: Bastion Counter — absorb → micro-window → straight counter → lock
    clip('Bastion Counter', 'SIGNATURE', 2.8, 'Đóng khiên → chịu giật lùi → mở cửa nhỏ → phản đòn thẳng → khóa guard.', [
      bk(0.00),
      bk(0.18, SHELL),
      bk(0.34, merge(SHELL, { UpperTorso: e(-0.20, 0, 0), Head: e(0.24, 0, 0) }), 0, e(0, -0.04, 0)),
      bk(0.48, SHELL),
      bk(0.62, CROSS),
      bk(0.70, CROSS),
      bk(0.82, SHELL),
      bk(1.00),
    ]),
    // 6 — SHOWCASE: guard salute — fist to chest then bow
    clip('Sentinel Oath', 'SHOWCASE', 3.0, 'Chào kiểu lính gác: đặt găng lên ngực, cúi đầu, trở về vị trí.', [
      bk(0.00),
      bk(0.28, { RightUpperArm: e(-0.50,  0.52, -0.10), RightLowerArm: e(-1.92), LeftUpperArm: e(0, 0, 0), LeftLowerArm: e(-0.08) }),
      bk(0.60, { RightUpperArm: e(-0.50,  0.52, -0.10), RightLowerArm: e(-1.92), LeftUpperArm: e(0, 0, 0), LeftLowerArm: e(-0.08), Head: e(0.32, 0, 0), UpperTorso: e(0.12, 0, 0) }),
      bk(0.85),
      bk(1.00),
    ]),
  ];

  // ── VANTA RAZOR ───────────────────────────────────────────────────────────
  if (s === 'vanta') return [
    // 1 — IDLE: shoulder lean, body sway L↔R
    clip('Predator Sway', 'IDLE', 2.0, 'Vai nghiêng, tay dẫn thấp, thân đảo nhẹ hai phía.', [
      bk(0.00),
      bk(0.28, { UpperTorso: e(0.14, -0.22, 0.10), Head: e(-0.12, 0.22, 0) }, -0.08),
      bk(0.70, { UpperTorso: e(0.10, -0.38, -0.14), Head: e(-0.10, 0.32, 0) }, -0.14),
      bk(1.00),
    ]),
    // 2 — DEFENSE: waist slip left then right (no guard raised)
    clip('Ghost Slip', 'DEFENSE', 1.4, 'Né bằng eo và cổ, không dựng guard; lách trái rồi phải.', [
      bk(0.00),
      bk(0.26, { UpperTorso: e(0.30, -0.32, -0.32), Head: e(-0.22, 0.32, 0) }, -0.12, e(-0.06, -0.04, 0)),
      bk(0.56, { UpperTorso: e(0.22,  0.22,  0.30), Head: e(-0.18, -0.12, 0) },  0.10, e( 0.06, -0.04, 0)),
      bk(0.80),
      bk(1.00),
    ]),
    // 3 — STRIKE: needle jab — short touch, instant retract
    clip('Needle Touch', 'STRIKE', 0.9, 'Một chạm trái cực ngắn, thu tay ngay, không giữ duỗi.', [
      bk(0.00),
      bk(0.18, { LeftUpperArm: e(-0.22, 0.12, 0.22) }),
      bk(0.34, JAB),
      bk(0.46),
      bk(0.70),
      bk(1.00),
    ]),
    // 4 — HEAVY: lean away → blindside cross
    clip('Blindside Cross', 'HEAVY', 1.35, 'Ngả khỏi đường đòn rồi tung cross từ vai sau.', [
      bk(0.00),
      bk(0.24, { UpperTorso: e(-0.22, -0.32, -0.25), Head: e(0.12, 0.22, 0) }, -0.10, e(-0.04, -0.02, 0)),
      bk(0.46, merge(CROSS, { UpperTorso: e(0.16, 0.52, 0.14) }),  0.14),
      bk(0.62),
      bk(1.00),
    ]),
    // 5 — SIGNATURE: Razor Feint — half-jab → retract → slip → cross → low stance
    clip('Razor Feint', 'SIGNATURE', 1.9, 'Giả jab nửa đường → rút vai/lách trái → cross nhanh → lùi về tư thế thấp.', [
      bk(0.00),
      bk(0.15, merge(JAB, { LeftLowerArm: e(-0.62), UpperTorso: e(0.10, -0.12, 0) })),
      bk(0.28),
      bk(0.44, { UpperTorso: e(0.28, -0.44, -0.34), Head: e(-0.16, 0.32, 0) }, -0.10, e(-0.06, -0.04, 0)),
      bk(0.60, merge(CROSS, { UpperTorso: e(0.12, 0.52, 0.20) }),  0.14),
      bk(0.76, { UpperTorso: e(-0.10, -0.12, 0) }),
      bk(1.00),
    ]),
    // 6 — SHOWCASE: tilt head challenge → extend lead → wrist flick
    clip('Cold Invitation', 'SHOWCASE', 2.3, 'Nghiêng đầu thách thức, chìa găng dẫn rồi ngoắc cổ tay.', [
      bk(0.00),
      bk(0.26, { Head: e(0, 0.12, -0.24), LeftUpperArm: e(-1.02, 0, 0.12), LeftLowerArm: e(-0.38) }),
      bk(0.48, { Head: e(0, 0.12, -0.24), LeftUpperArm: e(-1.02, 0, 0.12), LeftLowerArm: e(-0.38), LeftHand: e(-0.65, 0, 0) }),
      bk(0.68, { LeftUpperArm: e(-1.02, 0, 0.12), LeftLowerArm: e(-0.38), LeftHand: e( 0.22, 0, 0) }),
      bk(0.88),
      bk(1.00),
    ]),
  ];

  // ── VOLT KESTREL ──────────────────────────────────────────────────────────
  if (s === 'volt') return [
    // 1 — IDLE: quick bounce, shoulder switch
    clip('Capacitor Bounce', 'IDLE', 1.4, 'Nhịp nhanh, đổi vai dẫn, hai găng luôn sẵn combo.', [
      bk(0.00),
      bk(0.24, { UpperTorso: e(0, -0.08, 0), LeftUpperArm: e(-0.50, -0.10, 0.28) }, 0, e(0, 0.016, 0)),
      bk(0.50),
      bk(0.74, { UpperTorso: e(0,  0.08, 0), RightUpperArm: e(-0.56,  0.10, -0.28) }, 0, e(0, 0.016, 0)),
      bk(1.00),
    ]),
    // 2 — DEFENSE: alternating parry tap
    clip('Pulse Parry', 'DEFENSE', 1.2, 'Gạt nhịp trái-phải, không giữ khiên lâu.', [
      bk(0.00),
      bk(0.24, { LeftUpperArm: e(-0.92, -0.50, 0.48), LeftLowerArm: e(-1.00) }),
      bk(0.50),
      bk(0.72, { RightUpperArm: e(-0.92,  0.50, -0.48), RightLowerArm: e(-1.00) }),
      bk(0.88),
      bk(1.00),
    ]),
    // 3 — STRIKE: double jab — touch, half-retract, touch again
    clip('Double Pulse', 'STRIKE', 1.05, 'Hai jab nối nhanh: chạm, thu một nửa, chạm lần hai.', [
      bk(0.00),
      bk(0.20, JAB),
      bk(0.34, { LeftUpperArm: e(-0.72, 0, 0), LeftLowerArm: e(-0.88) }),
      bk(0.48, JAB),
      bk(0.68),
      bk(1.00),
    ]),
    // 4 — HEAVY: shoulder coil then short uppercut
    clip('Coil Uppercut', 'HEAVY', 1.4, 'Cuộn vai phải xuống rồi bung uppercut ngắn.', [
      bk(0.00),
      bk(0.24, { UpperTorso: e(0.24, -0.26, 0), RightUpperArm: e(0.12, 0, -0.30), RightLowerArm: e(-0.75) }),
      bk(0.46, UPPERCUT),
      bk(0.62, UPPERCUT),
      bk(0.80),
      bk(1.00),
    ]),
    // 5 — SIGNATURE: Arc Combination — jab → cross → reload → uppercut
    clip('Arc Combination', 'SIGNATURE', 2.0, 'Ba đòn thực sự: jab trái → cross phải → uppercut phải, mỗi lần đều thu tay.', [
      bk(0.00),
      bk(0.17, JAB),
      bk(0.28),
      bk(0.40, CROSS),
      bk(0.52, { RightUpperArm: e(0.06, 0, -0.32), RightLowerArm: e(-0.88), UpperTorso: e(0.22, -0.22, 0) }),
      bk(0.66, UPPERCUT),
      bk(0.78),
      bk(1.00),
    ]),
    // 6 — SHOWCASE: voltage salute — staggered arm raises
    clip('Voltage Salute', 'SHOWCASE', 2.2, 'Hai cú giơ găng so le, kết thúc bằng đôi tay nâng cao.', [
      bk(0.00),
      bk(0.20, { LeftUpperArm: e(-2.72, 0, 0.48), LeftLowerArm: e(-0.18) }),
      bk(0.40, { LeftUpperArm: e(-2.72, 0, 0.48), LeftLowerArm: e(-0.18), RightUpperArm: e(-2.72, 0, -0.48), RightLowerArm: e(-0.18) }),
      bk(0.66, { LeftUpperArm: e(-2.72, 0, 0.48), RightUpperArm: e(-2.72, 0, -0.48), LeftLowerArm: e(-0.18), RightLowerArm: e(-0.18), Head: e(-0.18, 0, 0) }),
      bk(0.88),
      bk(1.00),
    ]),
  ];

  // ── SOLSTICE MANTIS ───────────────────────────────────────────────────────
  return [
    // 1 — IDLE: long lead, body side-on, head turn
    clip('Long Guard', 'IDLE', 3.0, 'Tay trước đo tầm, tay sau sát cằm, đầu theo đường đòn.', [
      bk(0.00),
      bk(0.38, { LeftUpperArm: e(-0.98, -0.24, 0.32), LeftHand: e(0, 0, 0.20), Head: e(0, 0.34, 0) }),
      bk(0.70, { LeftUpperArm: e(-1.08, -0.14, 0.18) }),
      bk(1.00),
    ]),
    // 2 — DEFENSE: lean back, long lead extended
    clip('Halo Lean', 'DEFENSE', 1.8, 'Ngả thân ra sau để đòn hụt tầm, giữ găng dẫn thẳng.', [
      bk(0.00),
      bk(0.28, { UpperTorso: e(-0.34, -0.24, 0), Head: e(0.24, 0.24, 0) }, 0, e(0, -0.06, -0.04)),
      bk(0.56, { UpperTorso: e(-0.24, -0.42,  0.18), Head: e(0.18, 0.34, 0) }, 0, e(0, -0.04, -0.06)),
      bk(0.80),
      bk(1.00),
    ]),
    // 3 — STRIKE: orbit lance — long straight left, slow retract
    clip('Orbit Lance', 'STRIKE', 1.5, 'Duỗi tay dẫn dài, giữ đường đòn và thu chậm.', [
      bk(0.00),
      bk(0.24, { LeftUpperArm: e(-0.72, -0.30, 0.22) }),
      bk(0.42, merge(JAB, { UpperTorso: e(0.08, -0.44, 0) })),
      bk(0.62, merge(JAB, { UpperTorso: e(0.06, -0.36, 0) })),
      bk(0.82),
      bk(1.00),
    ]),
    // 4 — HEAVY: trap left → rotating cross
    clip('Long Intercept', 'HEAVY', 1.8, 'Bẫy bằng tay trái, xoay vai sau vào một cross dài.', [
      bk(0.00),
      bk(0.24, { LeftUpperArm: e(-1.22, -0.42, 0.48), LeftLowerArm: e(-0.24), UpperTorso: e(-0.10, -0.42, 0) }),
      bk(0.46, CROSS),
      bk(0.64, CROSS),
      bk(0.82),
      bk(1.00),
    ]),
    // 5 — SIGNATURE: Solar Scissor — angle change → knee lift → drop → cross
    clip('Solar Scissor', 'SIGNATURE', 2.8, 'Lách góc bằng thân → nâng gối trái → hạ chân → cross dài. Chân phải làm trụ.', [
      bk(0.00),
      bk(0.20, { UpperTorso: e(-0.06, -0.44, 0.18), Head: e(0, 0.32, 0) }, -0.12),
      bk(0.38, { UpperTorso: e(-0.18, -0.20, 0), LeftUpperLeg: e(-1.18, 0, 0.16), LeftLowerLeg: e(1.52, 0, 0), LeftFoot: e(-0.36, 0, 0) }, -0.06, e(0, -0.04, 0)),
      bk(0.52, { LeftUpperLeg: e(-1.18, 0, 0.16), LeftLowerLeg: e(1.52, 0, 0), LeftFoot: e(-0.36, 0, 0) }),
      bk(0.66),
      bk(0.78, merge(CROSS, { UpperTorso: e(0.10, 0.46, 0) }),  0.10),
      bk(0.90),
      bk(1.00),
    ]),
    // 6 — SHOWCASE: solar bow — spread arms, duelist bow
    clip('Solar Bow', 'SHOWCASE', 3.1, 'Dang cánh tay dài rồi cúi chào kiểu kiếm sĩ.', [
      bk(0.00),
      bk(0.28, { LeftUpperArm: e(0, 0, 1.22), RightUpperArm: e(0, 0, -1.22), LeftLowerArm: e(-0.14), RightLowerArm: e(-0.14) }),
      bk(0.52, { LeftUpperArm: e(0, 0, 1.22), RightUpperArm: e(0, 0, -1.22), LeftLowerArm: e(-0.14), RightLowerArm: e(-0.14), UpperTorso: e(0.32, 0, 0), Head: e(0.24, 0, 0) }),
      bk(0.82),
      bk(1.00),
    ]),
  ];
}
