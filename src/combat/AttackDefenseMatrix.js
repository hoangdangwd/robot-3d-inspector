// Boxing contact contract v2. Anatomical left/right; all fighters use left-lead stance.
// Semantic coverage only: simulation still owns phase, facing, range and resources.
const profile = (hand, targetZone, trajectory) => Object.freeze({ hand, targetZone, trajectory });
export const ATTACK_PROFILES = Object.freeze({
  jab: profile('left', 'head', 'straight'),
  cross: profile('right', 'head', 'straight'),
  hook_left: profile('left', 'head', 'horizontal_arc'),
  hook_right: profile('right', 'head', 'horizontal_arc'),
  uppercut_left: profile('left', 'head', 'rising'),
  uppercut_right: profile('right', 'head', 'rising'),
  body_jab: profile('left', 'body', 'straight'),
  body_cross: profile('right', 'body', 'straight'),
  overhand: profile('right', 'head', 'descending'),
  feint_jab: profile('left', 'none', 'feint'),
});
const row = (guard_high, guard_low, parry_left, parry_right, slip_left, slip_right, duck, roll) =>
  Object.freeze({ guard_high, guard_low, parry_left, parry_right, slip_left, slip_right, duck, roll });
const H = 'hit', B = 'block', P = 'parry', E = 'evade', N = 'no_contact';
export const ATTACK_DEFENSE_MATRIX = Object.freeze({
  //                       high low  PL PR SL SR duck roll
  jab:             row(     B,   H,  H, P, E, E, E,   H),
  cross:           row(     B,   H,  P, H, E, E, E,   H),
  hook_left:       row(     B,   H,  H, H, H, H, E,   E),
  hook_right:      row(     B,   H,  H, H, H, H, E,   E),
  uppercut_left:   row(     B,   H,  H, H, E, E, H,   H),
  uppercut_right:  row(     B,   H,  H, H, E, E, H,   H),
  body_jab:        row(     H,   B,  H, H, H, H, H,   H),
  body_cross:      row(     H,   B,  H, H, H, H, H,   H),
  overhand:        row(     B,   H,  H, H, E, H, H,   H),
  feint_jab:       row(     N,   N,  N, N, N, N, N,   N),
});

/** Unknown IDs never grant defense; caller must validate registered attacks. */
export function resolveDefenseOutcome(attackId, defenseId, defenseEligible = true) {
  if (!Object.hasOwn(ATTACK_PROFILES, attackId)) return 'hit';
  if (ATTACK_PROFILES[attackId].trajectory === 'feint') return 'no_contact';
  if (!defenseEligible) return 'hit';
  const outcomes = ATTACK_DEFENSE_MATRIX[attackId];
  return Object.hasOwn(outcomes, defenseId) ? outcomes[defenseId] : 'hit';
}
