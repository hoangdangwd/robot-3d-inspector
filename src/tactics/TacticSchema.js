// ─── Constrained tactical-script schema v1 ──────────────────────────
// Tactics are validated data. They are never executable code.

import { getAction } from '../combat/ActionRegistry.js';

export const TACTIC_SCHEMA_VERSION = 1;
export const TACTIC_SCHEMA_V2 = 2;
export const TACTIC_LIMITS = Object.freeze({
  maxTactics: 8,
  maxNameLength: 64,
  maxGoalLength: 160,
  maxPhases: 3,
  maxStepsPerPhase: 6,
  maxBranchesPerPhase: 3,
  maxAbortConditions: 4,
  maxRepeatLimit: 3,
  maxTimeoutTicks: 900,
  maxPriority: 1,
  maxDepth: 2,
});

const CONDITION_TYPES = new Set([
  'always', 'enemy_attack_start', 'enemy_action', 'self_health_below',
  'self_stamina_below', 'near_edge', 'target_near_edge', 'distance_band',
]);
const DISTANCE_BANDS = new Set(['close', 'mid', 'far']);

export function validateTactic(raw, { knownIds = [] } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(['tactic must be an object']);
  if (raw.schemaVersion !== TACTIC_SCHEMA_VERSION) errors.push('unsupported schemaVersion');
  if (!id(raw.id)) errors.push('id must be a lowercase bounded id');
  if (knownIds.includes(raw.id)) errors.push('id already exists');
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0 || raw.name.length > TACTIC_LIMITS.maxNameLength) errors.push('name is invalid');
  if (raw.goal !== undefined && (typeof raw.goal !== 'string' || raw.goal.length > TACTIC_LIMITS.maxGoalLength)) errors.push('goal is invalid');
  if (raw.priority !== undefined && (!Number.isFinite(raw.priority) || raw.priority < 0 || raw.priority > TACTIC_LIMITS.maxPriority)) errors.push('priority is invalid');
  if (!condition(raw.trigger, errors, 'trigger')) errors.push('trigger is invalid');
  if (!Array.isArray(raw.phases) || raw.phases.length < 1 || raw.phases.length > TACTIC_LIMITS.maxPhases) errors.push('phases count is invalid');
  else raw.phases.forEach((phase, index) => validatePhase(phase, index, errors));
  if (!Array.isArray(raw.abort) || raw.abort.length > TACTIC_LIMITS.maxAbortConditions) errors.push('abort conditions are invalid');
  else raw.abort.forEach((item, index) => condition(item, errors, `abort[${index}]`));
  if (!Number.isInteger(raw.repeatLimit) || raw.repeatLimit < 1 || raw.repeatLimit > TACTIC_LIMITS.maxRepeatLimit) errors.push('repeatLimit is invalid');
  if (!Number.isInteger(raw.timeoutTicks) || raw.timeoutTicks < 1 || raw.timeoutTicks > TACTIC_LIMITS.maxTimeoutTicks) errors.push('timeoutTicks is invalid');

  if (errors.length) return fail(errors);
  const normalized = structuredCloneSafe({
    schemaVersion: TACTIC_SCHEMA_VERSION,
    id: raw.id,
    name: raw.name.trim(),
    goal: raw.goal?.trim() || '',
    priority: raw.priority ?? .7,
    trigger: normalizeCondition(raw.trigger),
    phases: raw.phases.map(normalizePhase),
    abort: raw.abort.map(normalizeCondition),
    repeatLimit: raw.repeatLimit,
    timeoutTicks: raw.timeoutTicks,
  });
  const cost = calculateTacticCost(normalized);
  return { ok: true, value: deepFreeze(normalized), cost };
}

export function calculateTacticCost(tactic) {
  let cost = 1;
  for (const phase of tactic.phases || []) {
    cost += phase.sequence.length;
    cost += (phase.branches || []).length * 2;
    for (const branch of phase.branches || []) {
      cost += branch.sequence.length;
    }
  }
  cost += (tactic.abort || []).length;
  if (tactic.repeatLimit > 1) cost += 1;
  return cost;
}

export function validatePlaybook(raw, { capacity = Infinity } = {}) {
  if (!Array.isArray(raw) || raw.length > TACTIC_LIMITS.maxTactics) return fail(['playbook must be an array with bounded size']);
  const ids = [];
  const tactics = [];
  for (const item of raw) {
    const result = item?.schemaVersion === TACTIC_SCHEMA_V2
      ? validateTacticV2(item, { knownIds: ids })
      : validateTactic(item, { knownIds: ids });
    if (!result.ok) return result;
    ids.push(item.id);
    tactics.push(result.value);
  }
  const totalCost = tactics.reduce((sum, tactic) => sum + tacticCost(tactic), 0);
  if (totalCost > capacity) return fail([`playbook cost ${totalCost} exceeds capacity ${capacity}`]);
  return { ok: true, value: deepFreeze(tactics), totalCost };
}

export function tacticCost(tactic) { return calculateTacticCost(tactic); }

function validatePhase(phase, index, errors) {
  if (!phase || typeof phase !== 'object' || !id(phase.id)) errors.push(`phases[${index}] is invalid`);
  if (!Array.isArray(phase.sequence) || phase.sequence.length > TACTIC_LIMITS.maxStepsPerPhase) errors.push(`phases[${index}].sequence is invalid`);
  else phase.sequence.forEach((step, stepIndex) => validateStep(step, errors, `phases[${index}].sequence[${stepIndex}]`));
  if (phase.branches !== undefined) {
    if (!Array.isArray(phase.branches) || phase.branches.length > TACTIC_LIMITS.maxBranchesPerPhase) errors.push(`phases[${index}].branches is invalid`);
    else phase.branches.forEach((branch, branchIndex) => {
      if (!condition(branch.when, errors, `phases[${index}].branches[${branchIndex}].when`)) return;
      if (!Array.isArray(branch.sequence) || branch.sequence.length > TACTIC_LIMITS.maxStepsPerPhase) errors.push(`branch ${branchIndex} sequence is invalid`);
      else branch.sequence.forEach((step, stepIndex) => validateStep(step, errors, `branch[${branchIndex}].sequence[${stepIndex}]`));
    });
  }
}

function validateStep(step, errors, label) {
  if (!step || typeof step !== 'object' || !getAction(step.actionId)) errors.push(`${label}.actionId is not a registered action`);
  if (step?.condition !== undefined) condition(step.condition, errors, `${label}.condition`);
}

function condition(value, errors, label) {
  if (!value || typeof value !== 'object' || !CONDITION_TYPES.has(value.type)) { errors.push(`${label}.type is invalid`); return false; }
  if (value.type === 'enemy_attack_start' || value.type === 'enemy_action') {
    if (value.actionId !== undefined && !getAction(value.actionId)) errors.push(`${label}.actionId is invalid`);
  }
  if (value.type === 'distance_band' && !DISTANCE_BANDS.has(value.band)) errors.push(`${label}.band is invalid`);
  if (['self_health_below', 'self_stamina_below'].includes(value.type) && (!Number.isFinite(value.ratio) || value.ratio < 0 || value.ratio > 1)) errors.push(`${label}.ratio is invalid`);
  return true;
}

function normalizeCondition(value) {
  const result = { type: value.type };
  if (value.actionId !== undefined) result.actionId = value.actionId;
  if (value.band !== undefined) result.band = value.band;
  if (value.ratio !== undefined) result.ratio = value.ratio;
  return result;
}
function normalizePhase(phase) {
  return {
    id: phase.id,
    sequence: phase.sequence.map(step => ({ actionId: step.actionId, ...(step.condition ? { condition: normalizeCondition(step.condition) } : {}) })),
    branches: (phase.branches || []).map(branch => ({ when: normalizeCondition(branch.when), sequence: branch.sequence.map(step => ({ actionId: step.actionId, ...(step.condition ? { condition: normalizeCondition(step.condition) } : {}) })) })),
  };
}
function id(value) { return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value); }
function fail(errors) { return { ok: false, errors: [...errors] }; }
function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value)); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

// ─── Strategy-level schema v2 ──────────────────────────────────────
// v1 remains readable and writable. v2 adds bounded strategy methods while
// keeping concrete action execution inside TacticalIntentResolver + combat.
const STRATEGY_INTENTS = new Set(['action', 'counter', 'move', 'wait_for', 'set_priority']);
const MOVE_DIRECTIONS = new Set(['in', 'out', 'strafe_left', 'strafe_right', 'hold']);
const WAIT_SIGNALS = new Set(['enemy_attack', 'enemy_action', 'distance_band', 'self_stamina_below']);
const PRIORITY_CHANNELS = new Set(['aggression', 'defense', 'risk', 'tempo']);
const PRIORITY_TEMPOS = new Set(['patient', 'normal', 'high']);

export function validateTacticV2(raw, { knownIds = [] } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(['tactic must be an object']);
  if (raw.schemaVersion !== TACTIC_SCHEMA_V2) errors.push('unsupported schemaVersion');
  if (!id(raw.id)) errors.push('id must be a lowercase bounded id');
  if (knownIds.includes(raw.id)) errors.push('id already exists');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > TACTIC_LIMITS.maxNameLength) errors.push('name is invalid');
  if (raw.goal !== undefined && (typeof raw.goal !== 'string' || raw.goal.length > TACTIC_LIMITS.maxGoalLength)) errors.push('goal is invalid');
  if (raw.priority !== undefined && (!Number.isFinite(raw.priority) || raw.priority < 0 || raw.priority > 1)) errors.push('priority is invalid');
  if (!condition(raw.trigger, errors, 'trigger')) errors.push('trigger is invalid');
  if (!Array.isArray(raw.phases) || raw.phases.length < 1 || raw.phases.length > TACTIC_LIMITS.maxPhases) errors.push('phases count is invalid');
  else raw.phases.forEach((phase, index) => validateStrategyPhase(phase, index, errors));
  if (!Array.isArray(raw.abort) || raw.abort.length > TACTIC_LIMITS.maxAbortConditions) errors.push('abort conditions are invalid');
  else raw.abort.forEach((item, index) => condition(item, errors, `abort[${index}]`));
  if (!Number.isInteger(raw.repeatLimit) || raw.repeatLimit < 1 || raw.repeatLimit > TACTIC_LIMITS.maxRepeatLimit) errors.push('repeatLimit is invalid');
  if (!Number.isInteger(raw.timeoutTicks) || raw.timeoutTicks < 1 || raw.timeoutTicks > TACTIC_LIMITS.maxTimeoutTicks) errors.push('timeoutTicks is invalid');
  if (errors.length) return fail(errors);
  const normalized = structuredCloneSafe({
    schemaVersion: TACTIC_SCHEMA_V2, id: raw.id, name: raw.name.trim(), goal: raw.goal?.trim() || '',
    priority: raw.priority ?? .7, trigger: normalizeCondition(raw.trigger),
    phases: raw.phases.map(normalizeStrategyPhase), abort: raw.abort.map(normalizeCondition),
    repeatLimit: raw.repeatLimit, timeoutTicks: raw.timeoutTicks,
  });
  return { ok: true, value: deepFreeze(normalized), cost: calculateTacticCost(normalized) };
}

export function migrateTacticToV2(raw) {
  const legacy = validateTactic(raw);
  if (!legacy.ok) return legacy;
  const tactic = legacy.value;
  return validateTacticV2({
    ...tactic,
    schemaVersion: TACTIC_SCHEMA_V2,
    phases: tactic.phases.map(phase => ({
      ...phase,
      sequence: phase.sequence.map(step => ({ intent: { type: 'action', actionId: step.actionId } })),
      branches: (phase.branches || []).map(branch => ({
        ...branch,
        sequence: branch.sequence.map(step => ({ intent: { type: 'action', actionId: step.actionId } })),
      })),
    })),
  });
}

export function migratePlaybookToV2(raw, { capacity = Infinity } = {}) {
  if (!Array.isArray(raw)) return fail(['playbook must be an array with bounded size']);
  const migrated = [];
  for (const tactic of raw) {
    const result = tactic?.schemaVersion === TACTIC_SCHEMA_V2 ? validateTacticV2(tactic) : migrateTacticToV2(tactic);
    if (!result.ok) return result;
    migrated.push(result.value);
  }
  return validatePlaybook(migrated, { capacity });
}

export function strategyIntentTypes() { return [...STRATEGY_INTENTS]; }

function validateStrategyPhase(phase, index, errors) {
  if (!phase || typeof phase !== 'object' || !id(phase.id)) errors.push(`phases[${index}] is invalid`);
  if (!Array.isArray(phase.sequence) || phase.sequence.length > TACTIC_LIMITS.maxStepsPerPhase) errors.push(`phases[${index}].sequence is invalid`);
  else phase.sequence.forEach((step, stepIndex) => validateStrategyStep(step, errors, `phases[${index}].sequence[${stepIndex}]`));
  if (phase.branches !== undefined) {
    if (!Array.isArray(phase.branches) || phase.branches.length > TACTIC_LIMITS.maxBranchesPerPhase) errors.push(`phases[${index}].branches is invalid`);
    else phase.branches.forEach((branch, branchIndex) => {
      if (!condition(branch.when, errors, `phases[${index}].branches[${branchIndex}].when`)) return;
      if (!Array.isArray(branch.sequence) || branch.sequence.length > TACTIC_LIMITS.maxStepsPerPhase) errors.push(`branch ${branchIndex} sequence is invalid`);
      else branch.sequence.forEach((step, stepIndex) => validateStrategyStep(step, errors, `branch[${branchIndex}].sequence[${stepIndex}]`));
    });
  }
}

function validateStrategyStep(step, errors, label) {
  if (!step || typeof step !== 'object' || !step.intent || typeof step.intent !== 'object' || !STRATEGY_INTENTS.has(step.intent.type)) {
    errors.push(`${label}.intent is invalid`); return;
  }
  const intent = step.intent;
  if (intent.type === 'action' && !getAction(intent.actionId)) errors.push(`${label}.intent.actionId is invalid`);
  if (intent.type === 'counter') {
    if (intent.targetZone !== undefined && !['any', 'head', 'body'].includes(intent.targetZone)) errors.push(`${label}.counter.targetZone is invalid`);
    if (intent.response !== undefined && !['parry', 'evade', 'strike'].includes(intent.response)) errors.push(`${label}.counter.response is invalid`);
  }
  if (intent.type === 'move' && !MOVE_DIRECTIONS.has(intent.direction)) errors.push(`${label}.move.direction is invalid`);
  if (intent.type === 'wait_for') {
    if (!WAIT_SIGNALS.has(intent.signal)) errors.push(`${label}.wait_for.signal is invalid`);
    if (intent.actionId !== undefined && !getAction(intent.actionId)) errors.push(`${label}.wait_for.actionId is invalid`);
    if (intent.band !== undefined && !DISTANCE_BANDS.has(intent.band)) errors.push(`${label}.wait_for.band is invalid`);
    if (intent.ratio !== undefined && (!Number.isFinite(intent.ratio) || intent.ratio < 0 || intent.ratio > 1)) errors.push(`${label}.wait_for.ratio is invalid`);
  }
  if (intent.type === 'set_priority') {
    if (!PRIORITY_CHANNELS.has(intent.channel)) errors.push(`${label}.set_priority.channel is invalid`);
    if (intent.channel === 'tempo' ? !PRIORITY_TEMPOS.has(intent.value) : (!Number.isFinite(intent.value) || intent.value < -1 || intent.value > 1)) errors.push(`${label}.set_priority.value is invalid`);
  }
}

function normalizeStrategyPhase(phase) {
  return {
    id: phase.id,
    sequence: phase.sequence.map(step => ({ intent: normalizeStrategyIntent(step.intent) })),
    branches: (phase.branches || []).map(branch => ({ when: normalizeCondition(branch.when), sequence: branch.sequence.map(step => ({ intent: normalizeStrategyIntent(step.intent) })) })),
  };
}
function normalizeStrategyIntent(intent) {
  const result = { type: intent.type };
  for (const key of ['actionId', 'targetZone', 'response', 'direction', 'signal', 'band', 'channel', 'value', 'ratio']) {
    if (intent[key] !== undefined) result[key] = intent[key];
  }
  return result;
}
