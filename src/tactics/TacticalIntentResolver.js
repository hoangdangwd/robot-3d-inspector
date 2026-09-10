// ─── Strategy intent resolver ──────────────────────────────────────
// Converts bounded strategy-level intent into a concrete legal-domain request.
// It never mutates simulation state, scene objects, or animation.

import { getAction } from '../combat/ActionRegistry.js';

const ATTACKS = ['jab', 'cross', 'hook_left', 'hook_right', 'uppercut_left', 'uppercut_right', 'body_jab', 'body_cross', 'overhand', 'feint_jab'];
const PARRIES = ['parry_left', 'parry_right'];
const EVADES = ['slip_left', 'slip_right', 'duck', 'roll'];

export function resolveTacticalIntent(intent, { view, profile } = {}) {
  if (!intent || typeof intent !== 'object') return null;
  const safeProfile = profile || {};
  switch (intent.type) {
    case 'action':
      return getAction(intent.actionId) ? { actionId: intent.actionId, reason: `strategy:action:${intent.actionId}` } : null;
    case 'counter':
      return resolveCounter(intent, view, safeProfile);
    case 'move':
      return { movement: movementFor(intent.direction), reason: `strategy:move:${intent.direction}` };
    case 'set_priority':
      return { strategySignal: { channel: intent.channel, value: intent.value }, reason: `strategy:set_priority:${intent.channel}` };
    case 'wait_for':
      return { waiting: true, reason: `strategy:wait_for:${intent.signal}` };
    default:
      return null;
  }
}

function resolveCounter(intent, view, profile) {
  const response = intent.response || (profile.counterBias > .7 ? 'parry' : profile.evadeBias > .65 ? 'evade' : 'strike');
  if (response === 'parry') {
    const actionId = chooseWeighted(PARRIES, profile.defenseWeights, view?.facingDiff);
    return { actionId, reason: `strategy:counter:parry:${intent.targetZone || 'any'}` };
  }
  if (response === 'evade') {
    const actionId = chooseWeighted(EVADES, profile.defenseWeights, view?.facingDiff);
    return { actionId, reason: `strategy:counter:evade:${intent.targetZone || 'any'}` };
  }
  const candidates = ATTACKS.filter(actionId => {
    const action = getAction(actionId);
    if (intent.targetZone === 'body') return action?.isBodyAttack;
    if (intent.targetZone === 'head') return !action?.isBodyAttack;
    return true;
  });
  const actionId = chooseWeighted(candidates.length ? candidates : ATTACKS, profile.attackWeights, view?.distance);
  return { actionId, reason: `strategy:counter:strike:${intent.targetZone || 'any'}` };
}

function chooseWeighted(ids, weights = {}, hint = 0) {
  let best = ids[0];
  let bestScore = -Infinity;
  for (const id of ids) {
    const weight = Number.isFinite(weights[id]) ? weights[id] : 1;
    const sideBias = typeof hint === 'number' && hint < 0 && id.endsWith('_left') ? .08 : 0;
    const score = weight + sideBias;
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

function movementFor(direction) {
  switch (direction) {
    case 'in': return { forward: 1, strafe: 0 };
    case 'out': return { forward: -1, strafe: 0 };
    case 'strafe_left': return { forward: 0, strafe: -1 };
    case 'strafe_right': return { forward: 0, strafe: 1 };
    case 'hold': return { forward: 0, strafe: 0 };
    default: return { forward: 0, strafe: 0 };
  }
}
