// ─── Action Registry v2 ─────────────────────────────────────────────
// Defines all legal combat moves. Data-driven from CombatRules tables.
// Capability modifiers are applied at query time, not stored.

import { ActionFamily } from './CombatTypes.js';
import * as R from './CombatRules.js';
import { ATTACK_PROFILES } from './AttackDefenseMatrix.js';

/**
 * @typedef {object} ActionDef
 * @property {string}  id
 * @property {string}  family
 * @property {number}  startup     - base ticks
 * @property {number}  active      - base ticks (0 for non-attack)
 * @property {number}  recovery    - base ticks
 * @property {number}  staminaCost - base
 * @property {number}  damage      - base clean-hit
 * @property {number}  chipDamage  - base through guard
 * @property {number}  guardStaminaDrain - base
 * @property {number}  reach       - base meters
 * @property {number}  facingHalf  - radians
 * @property {string}  animationId - semantic clip ID
 * @property {boolean} isHold
 * @property {boolean} isDodge     - slip/duck/roll family; coverage is defined by AttackDefenseMatrix
 * @property {boolean} isParry     - true for parry (stuns attacker)
 * @property {boolean} isBodyAttack
 * @property {number}  drainPerSec - guard hold stamina drain
 */

/** @type {Map<string, Readonly<ActionDef>>} */
const registry = new Map();

function reg(def) {
  const d = Object.freeze(def);
  registry.set(d.id, d);
}

// ── Attacks from table ──────────────────────────────────────────────
for (const [id, vals] of Object.entries(R.ACTIONS)) {
  const [startup, active, recovery, staminaCost, damage, chip, gsd, reach] = vals;
  reg({
    id,
    family: ActionFamily.ATTACK,
    startup, active, recovery, staminaCost,
    damage, chipDamage: chip, guardStaminaDrain: gsd,
    reach, facingHalf: R.FACING_HALF,
    animationId: id,
    isHold: false, isDodge: false, isParry: false,
    isBodyAttack: ATTACK_PROFILES[id].targetZone === 'body',
    contactProfile: ATTACK_PROFILES[id],
    drainPerSec: 0,
  });
}

// ── Defenses from table ─────────────────────────────────────────────
for (const [id, vals] of Object.entries(R.DEFENSES)) {
  const [startup, active, recovery, staminaCost, isHold, drainPerSec] = vals;
  const isParry = id.startsWith('parry_');
  const isDodge = id.startsWith('slip_') || id === 'duck' || id === 'roll';
  reg({
    id,
    family: ActionFamily.DEFENSE,
    startup, active, recovery, staminaCost,
    damage: 0, chipDamage: 0, guardStaminaDrain: 0,
    reach: 0, facingHalf: 0,
    animationId: id,
    isHold, isDodge, isParry,
    isBodyAttack: false,
    drainPerSec,
  });
}

/**
 * Get base action definition (no capability modifiers applied).
 * @param {string} id
 * @returns {Readonly<ActionDef>|undefined}
 */
export function getAction(id) {
  return registry.get(id);
}

/** All registered action IDs. */
export function getActionIds() {
  return [...registry.keys()];
}

/** All attack IDs. */
export function getAttackIds() {
  return getActionIds().filter(id => registry.get(id).family === ActionFamily.ATTACK);
}

/** All defense IDs. */
export function getDefenseIds() {
  return getActionIds().filter(id => registry.get(id).family === ActionFamily.DEFENSE);
}

/**
 * Apply capability modifiers to a base action definition.
 * Returns a new object with modified values (does not mutate registry).
 *
 * @param {Readonly<ActionDef>} baseDef
 * @param {object} cap - capability profile from CombatRules.getCapability()
 * @returns {object} modified action data
 */
export function applyCapability(baseDef, cap) {
  return {
    ...baseDef,
    startup:          Math.round(baseDef.startup * (cap.startupMult || 1)),
    recovery:         Math.round(baseDef.recovery * (cap.recoveryMult || 1)),
    damage:           Math.round(baseDef.damage * (cap.damageMult || 1)),
    chipDamage:       Math.max(1, Math.round(baseDef.chipDamage * (cap.damageMult || 1))),
    guardStaminaDrain: Math.round(baseDef.guardStaminaDrain * (1 / (cap.guardMult || 1))),
    reach:            +(baseDef.reach * (cap.reachMult || 1)).toFixed(3),
    staminaCost:      Math.round(baseDef.staminaCost * (cap.staminaMult || 1)),
  };
}
