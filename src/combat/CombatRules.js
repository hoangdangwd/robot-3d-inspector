// ─── Combat Rules v1 ────────────────────────────────────────────────
// Centralised tuning constants. Expanded for full moveset.
// No imports. No side effects.

export const TICK_RATE = 60;
export const ROUND_DURATION_TICKS = 10800; // 3 minutes @ 60 Hz

// ── Arena ───────────────────────────────────────────────────────────
export const ARENA_RADIUS      = 5;
export const STARTING_DISTANCE = 3;

// ── Movement ────────────────────────────────────────────────────────
export const MOVE_SPEED_FORWARD  = 2.5;
export const MOVE_SPEED_BACKWARD = 2.0;
export const MOVE_SPEED_STRAFE   = 2.0;
export const TURN_RATE           = Math.PI; // 180°/s

// ── Resources ───────────────────────────────────────────────────────
export const MAX_HEALTH  = 100;
export const MAX_STAMINA = 100;
export const STAMINA_REGEN_PER_SEC = 10;
export const MAX_POSTURE = 100;
export const POSTURE_REGEN_PER_SEC = 8;
export const POSTURE_DAMAGE_RATIO = .85;
export const DOWN_TICKS = 48;
export const GET_UP_TICKS = 24;
export const GUARD_BREAK_STAGGER_TICKS = 24;

// ── Shared facing ───────────────────────────────────────────────────
export const FACING_HALF = Math.PI / 3; // ±60°

// ── Base action data (before capability modifiers) ──────────────────
// Format: [startup, active, recovery, staminaCost, damage, chip, guardStaDrain, reach]
//                  ticks                                            meters
export const ACTIONS = Object.freeze({
  //                        strt  act  rec  sta  dmg chip gStam reach
  jab:              [ 8,  4, 10,  8,   5,  1,   5,  1.8],
  cross:            [10,  4, 14, 12,   8,  1,   7,  1.8],
  hook_left:        [12,  5, 16, 14,  10,  2,   9,  1.4],
  hook_right:       [12,  5, 16, 14,  10,  2,   9,  1.4],
  uppercut_left:    [14,  4, 18, 16,  12,  2,  10,  1.2],
  uppercut_right:   [14,  4, 18, 16,  12,  2,  10,  1.2],
  body_jab:         [ 9,  4, 11, 10,   4,  1,   6,  1.6],
  body_cross:       [12,  4, 15, 14,   7,  1,   8,  1.6],
  overhand:         [16,  5, 22, 20,  15,  3,  12,  1.5],
  feint_jab:        [ 6,  0,  8,  4,   0,  0,   0,  1.8],
});

// ── Defense data ────────────────────────────────────────────────────
// [startup, active, recovery, staminaCost, isHold, drainPerSec]
export const DEFENSES = Object.freeze({
  //                       strt act rec sta  hold  drain
  guard_high:       [ 3,  0,  6,  0, true,   12],
  guard_low:        [ 4,  0,  7,  0, true,   14],
  parry_left:       [ 3,  6,  8,  6, false,   0],
  parry_right:      [ 3,  6,  8,  6, false,   0],
  slip_left:        [ 4,  8, 10,  5, false,   0],
  slip_right:       [ 4,  8, 10,  5, false,   0],
  duck:             [ 5, 10, 12,  6, false,   0],
  roll:             [ 6, 12, 16,  8, false,   0],
});

// Parry: if active during hit, attacker gets extra recovery (stun frames)
export const PARRY_STUN_TICKS = 12;

// ── Exhaustion ──────────────────────────────────────────────────────
export const EXHAUSTION_STARTUP_MULT = 1.5;

// ── Match end ───────────────────────────────────────────────────────
export const KO_HEALTH = 0;

// ── Robot capability profiles ───────────────────────────────────────
// Multipliers applied to base action data per robot.
// All default to 1.0 — the base values above are "average robot".
//
// startupMult:  <1 = faster wind-up, >1 = slower
// recoveryMult: <1 = recovers faster
// damageMult:   >1 = hits harder
// reachMult:    >1 = longer arms
// staminaMult:  <1 = more efficient, >1 = burns faster
// speedMult:    >1 = moves faster
// turnMult:     >1 = turns faster
// guardMult:    >1 = takes less chip/stamina through guard

export const CAPABILITIES = Object.freeze({
  forge_titan: {
    startupMult:  1.15,   // slower but...
    recoveryMult: 1.10,
    damageMult:   1.25,   // ...hits hardest
    reachMult:    0.90,   // short arms
    staminaMult:  1.10,   // burns a bit fast
    speedMult:    0.85,   // slow mover
    turnMult:     0.80,
    guardMult:    1.20,   // tanky guard
    // Preferred: hooks, overhand, body attacks. Heavy commitment.
    allowedActions: null,  // null = all allowed
  },
  aegis_prime: {
    startupMult:  1.05,
    recoveryMult: 0.90,   // recovers fast — the counter-puncher
    damageMult:   0.95,
    reachMult:    1.15,   // tall = long reach
    staminaMult:  0.90,   // efficient
    speedMult:    0.90,
    turnMult:     0.95,
    guardMult:    1.35,   // best guard in the game
    allowedActions: null,
  },
  vanta_razor: {
    startupMult:  0.85,   // fastest startup
    recoveryMult: 0.85,
    damageMult:   0.85,   // light hitter
    reachMult:    1.05,
    staminaMult:  0.85,   // very efficient
    speedMult:    1.20,   // fastest mover
    turnMult:     1.25,
    guardMult:    0.75,   // fragile guard
    allowedActions: null,
  },
  volt_kestrel: {
    startupMult:  0.90,   // quick
    recoveryMult: 0.85,   // quick recovery for combos
    damageMult:   0.90,
    reachMult:    1.00,
    staminaMult:  0.95,
    speedMult:    1.10,
    turnMult:     1.10,
    guardMult:    0.90,
    allowedActions: null,
  },
  solstice_mantis: {
    startupMult:  1.00,
    recoveryMult: 1.00,
    damageMult:   0.85,   // lighter hits
    reachMult:    1.25,   // longest reach
    staminaMult:  1.00,
    speedMult:    1.15,
    turnMult:     1.15,
    guardMult:    0.80,   // light guard
    allowedActions: null,
  },
});

/**
 * Get capability profile, falling back to neutral 1.0 multipliers.
 * @param {string} definitionId - underscore-separated catalog id
 * @returns {Readonly<object>}
 */
export function getCapability(definitionId) {
  return CAPABILITIES[definitionId] || {
    startupMult: 1, recoveryMult: 1, damageMult: 1, reachMult: 1,
    staminaMult: 1, speedMult: 1, turnMult: 1, guardMult: 1,
    allowedActions: null,
  };
}
