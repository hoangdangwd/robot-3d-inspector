// ─── Bounded Sandbox command plans ─────────────────────────────────
// Plans are serialized mission data, never executable code. They let a
// natural-language command such as "move east, then fire north" become a
// deterministic sequence owned by SandboxSimulation.

import { SandboxIntentSource, SandboxIntentType } from './SandboxIntent.js';

export const SANDBOX_PLAN_LIMITS = Object.freeze({
  maxSteps: 6,
  maxStepTicks: 600,
  maxTotalTicks: 1800,
  maxRepeats: 3,
});

const STEP_TYPES = new Set([
  SandboxIntentType.MOVE,
  SandboxIntentType.STOP,
  SandboxIntentType.AIM,
  SandboxIntentType.FIRE,
  SandboxIntentType.ATTACK_TARGET,
]);
const SOURCES = new Set(Object.values(SandboxIntentSource));
const TAU = Math.PI * 2;

/**
 * Validate a bounded Sandbox plan received from local parsing or a model.
 * Unknown properties are discarded at the boundary.
 */
export function validateSandboxPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('invalid_plan');
  const source = raw.source === undefined ? SandboxIntentSource.LOCAL : raw.source;
  if (!SOURCES.has(source)) return fail('invalid_source');
  const priority = raw.priority === undefined ? 1 : raw.priority;
  if (!numberInRange(priority, 0, 1)) return fail('invalid_priority');
  const createdAt = raw.createdAt === undefined ? 0 : raw.createdAt;
  if (!safeTick(createdAt)) return fail('invalid_created_at');
  const repeat = raw.repeat === undefined ? 0 : raw.repeat;
  if (!Number.isSafeInteger(repeat) || repeat < 0 || repeat > SANDBOX_PLAN_LIMITS.maxRepeats) return fail('invalid_repeat');
  if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > SANDBOX_PLAN_LIMITS.maxSteps) return fail('invalid_steps');

  const steps = [];
  let totalTicks = 0;
  for (const rawStep of raw.steps) {
    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) return fail('invalid_step');
    const type = rawStep.type;
    if (!STEP_TYPES.has(type)) return fail('invalid_step_type');
    const durationTicks = rawStep.durationTicks;
    if (!Number.isSafeInteger(durationTicks) || durationTicks < 1 || durationTicks > SANDBOX_PLAN_LIMITS.maxStepTicks) {
      return fail('invalid_step_duration');
    }
    const step = { type, durationTicks };
    if (type === SandboxIntentType.MOVE || type === SandboxIntentType.AIM || type === SandboxIntentType.FIRE) {
      if (typeof rawStep.angle !== 'number' || !Number.isFinite(rawStep.angle)) return fail('missing_step_angle');
      step.angle = normalizeAngle(rawStep.angle);
    }
    if (type === SandboxIntentType.ATTACK_TARGET) {
      if (rawStep.targetId !== 'nearest') return fail('invalid_step_target');
      step.targetId = 'nearest';
    }
    steps.push(step);
    totalTicks += durationTicks;
  }

  const totalWithRepeats = totalTicks * (repeat + 1);
  if (totalWithRepeats > SANDBOX_PLAN_LIMITS.maxTotalTicks) return fail('plan_too_long');
  return {
    ok: true,
    value: Object.freeze({
      version: 1,
      source,
      priority,
      createdAt,
      repeat,
      totalTicks: totalWithRepeats,
      steps: Object.freeze(steps.map(step => Object.freeze(step))),
    }),
  };
}

export function createSandboxPlan(raw) {
  const result = validateSandboxPlan(raw);
  if (!result.ok) throw new TypeError(`SandboxPlan: ${result.error}`);
  return result.value;
}

function safeTick(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function numberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function normalizeAngle(angle) {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function fail(error) {
  return { ok: false, error };
}
