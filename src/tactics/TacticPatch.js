// ─── Reviewed tactic patch contract ─────────────────────────────────
// A proposal is data to review; applying it never commits persistence.

import { getAction } from '../combat/ActionRegistry.js';
import { TACTIC_LIMITS, validateTactic, validateTacticV2 } from './TacticSchema.js';

const PATCH_TYPES = new Set(['set_name', 'set_trigger', 'replace_sequence', 'replace_intents', 'set_abort_near_edge', 'set_repeat_limit', 'set_timeout_ticks']);
const STRATEGY_INTENTS = new Set(['action', 'counter', 'move', 'wait_for', 'set_priority']);

export function validateTacticPatch(raw, { baseRevision = 0 } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.operations) || raw.operations.length > 8) return fail('invalid_operations');
  if (!Number.isInteger(raw.baseRevision) || raw.baseRevision !== baseRevision) return fail('stale_base_revision');
  const operations = [];
  for (const operation of raw.operations) {
    if (!operation || !PATCH_TYPES.has(operation.type)) return fail('unknown_operation');
    if (operation.type === 'set_name' && (typeof operation.value !== 'string' || !operation.value.trim() || operation.value.length > TACTIC_LIMITS.maxNameLength)) return fail('invalid_name');
    if (operation.type === 'set_trigger' && !getAction(operation.actionId)) return fail('invalid_trigger_action');
    if (operation.type === 'replace_sequence' && (!Array.isArray(operation.actionIds) || operation.actionIds.length > TACTIC_LIMITS.maxStepsPerPhase || operation.actionIds.some(actionId => !getAction(actionId)))) return fail('invalid_sequence');
    if (operation.type === 'replace_intents' && (!Array.isArray(operation.intents) || operation.intents.length > TACTIC_LIMITS.maxStepsPerPhase || operation.intents.some(intent => !validStrategyIntent(intent)))) return fail('invalid_intents');
    if (operation.type === 'set_abort_near_edge' && typeof operation.value !== 'boolean') return fail('invalid_abort');
    if (operation.type === 'set_repeat_limit' && (!Number.isInteger(operation.value) || operation.value < 1 || operation.value > TACTIC_LIMITS.maxRepeatLimit)) return fail('invalid_repeat');
    if (operation.type === 'set_timeout_ticks' && (!Number.isInteger(operation.value) || operation.value < 1 || operation.value > TACTIC_LIMITS.maxTimeoutTicks)) return fail('invalid_timeout');
    operations.push({ ...operation });
  }
  return { ok: true, value: Object.freeze({ baseRevision, operations: Object.freeze(operations) }) };
}

export function applyTacticPatch(tactic, patch) {
  const next = JSON.parse(JSON.stringify(tactic));
  for (const operation of patch.operations) {
    switch (operation.type) {
      case 'set_name': next.name = operation.value.trim(); break;
      case 'set_trigger': next.trigger = { type: 'enemy_attack_start', actionId: operation.actionId }; break;
      case 'replace_sequence': next.phases[0].sequence = next.schemaVersion === 2
        ? operation.actionIds.map(actionId => ({ intent: { type: 'action', actionId } }))
        : operation.actionIds.map(actionId => ({ actionId })); break;
      case 'replace_intents': next.schemaVersion = 2; next.phases[0].sequence = operation.intents.map(intent => ({ intent })); break;
      case 'set_abort_near_edge': next.abort = operation.value ? [{ type: 'near_edge' }] : []; break;
      case 'set_repeat_limit': next.repeatLimit = operation.value; break;
      case 'set_timeout_ticks': next.timeoutTicks = operation.value; break;
      default: break;
    }
  }
  return next.schemaVersion === 2 ? validateTacticV2(next) : validateTactic(next);
}

function validStrategyIntent(intent) {
  if (!intent || typeof intent !== 'object' || !STRATEGY_INTENTS.has(intent.type)) return false;
  if (intent.type === 'action') return Boolean(getAction(intent.actionId));
  if (intent.type === 'counter') return ['parry', 'evade', 'strike'].includes(intent.response || 'strike') && ['any', 'head', 'body'].includes(intent.targetZone || 'any');
  if (intent.type === 'move') return ['in', 'out', 'strafe_left', 'strafe_right', 'hold'].includes(intent.direction);
  if (intent.type === 'wait_for') return ['enemy_attack', 'enemy_action', 'distance_band', 'self_stamina_below'].includes(intent.signal);
  if (intent.type === 'set_priority') return ['aggression', 'defense', 'risk', 'tempo'].includes(intent.channel);
  return false;
}

function fail(error) { return { ok: false, error }; }
