// ─── Local autonomous combat brain ──────────────────────────────────
// Perception → bounded state → utility intent. No renderer/network/model.
// The brain requests actions; CombatSimulation validates and executes them.

import { createActionIntent } from '../combat/CombatTypes.js';
import { getAction, getAttackIds, getDefenseIds } from '../combat/ActionRegistry.js';
import { SeededRNG } from '../combat/SeededRNG.js';
import * as R from '../combat/CombatRules.js';
import { resolveDefenseOutcome } from '../combat/AttackDefenseMatrix.js';
import { getBehaviorProfile } from './robotBehaviorProfiles.js';
import { CombatBlackboard } from './CombatBlackboard.js';
import { getRobotPattern } from './RobotPatterns.js';
import { RobotPatternRuntime } from './RobotPatternRuntime.js';
import { TacticRuntime } from '../tactics/TacticRuntime.js';
import { validatePlaybook } from '../tactics/TacticSchema.js';
import { computeAdherence, rollAdherence, adherenceMissReason } from './AdherenceModel.js';
import { calculateTacticCost } from '../tactics/TacticSchema.js';
import { resolveTacticalIntent } from '../tactics/TacticalIntentResolver.js';

const ATTACKS = Object.freeze(getAttackIds());
const DEFENSES = Object.freeze(getDefenseIds());
const HEAVY_ATTACKS = new Set(['hook_left', 'hook_right', 'uppercut_left', 'uppercut_right', 'overhand', 'body_cross']);
const DODGES = new Set(['slip_left', 'slip_right', 'duck', 'roll']);
const PARRIES = new Set(['parry_left', 'parry_right']);
const HEAD_GUARDS = new Set(['guard_high']);
const BODY_GUARDS = new Set(['guard_low']);

const BRAIN_STATES = Object.freeze({
  OBSERVE: 'observe',
  APPROACH: 'approach',
  PREFERRED_RANGE: 'preferred_range',
  PRESSURE: 'pressure',
  DEFEND: 'defend',
  EVADE: 'evade',
  RECOVER: 'recover',
  STAGGERED: 'staggered',
  DOWN: 'down',
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distanceScore = (distance, preferred, tolerance) => {
  const delta = Math.abs(distance - preferred);
  return clamp(1 - delta / Math.max(preferred + tolerance, .1), 0, 1);
};

export class CombatBrain {
  /**
   * @param {object} opts
   * @param {string} opts.fighterId
   * @param {string} opts.definitionId
   * @param {number} [opts.seed=1]
   * @param {number} [opts.decisionInterval=6] - minimum ticks between choices
   * @param {CombatBlackboard} [opts.blackboard]
   */
  constructor({ fighterId, definitionId, seed = 1, decisionInterval = 6, blackboard = null }) {
    this.fighterId = fighterId;
    this.definitionId = definitionId;
    this.profile = getBehaviorProfile(definitionId);
    this.seed = seed;
    this.blackboard = blackboard || new CombatBlackboard({ fighterId });
    this.tacticRuntimes = [];
    this.playbookRevision = 0;
    this.rng = new SeededRNG(seed);
    this.decisionInterval = decisionInterval;
    this.nextDecisionTick = 0;
    this.commitUntil = 0;
    this.state = BRAIN_STATES.OBSERVE;
    this.lastDecision = null;
    this.decisionCount = 0;
    /** Last adherence miss event, cleared each decide() call. */
    this.lastAdherenceMiss = null;
    this.strategySignals = Object.create(null);
    const pattern = getRobotPattern(definitionId);
    this.pattern = pattern ? new RobotPatternRuntime(pattern, fighterId, definitionId) : null;
    this.patternRng = new SeededRNG(seed ^ 0x7017);
  }

  /**
   * Perceive only public simulation state. No scene access.
   * @param {import('../combat/CombatSimulation.js').CombatSimulation} simulation
   * @returns {object}
   */
  perceive(simulation) {
    const self = simulation.getState(this.fighterId);
    const target = self && simulation.getState(self.targetId);
    if (!self || !target) return null;
    const dx = target.x - self.x;
    const dz = target.z - self.z;
    const distance = Math.hypot(dx, dz);
    const targetAngle = Math.atan2(dx, dz);
    let facingDiff = targetAngle - self.facing;
    while (facingDiff > Math.PI) facingDiff -= Math.PI * 2;
    while (facingDiff < -Math.PI) facingDiff += Math.PI * 2;
    const targetAction = getAction(target.actionId);
    const targetThreat = targetAction?.family === 'attack' &&
      ['startup', 'active'].includes(target.actionPhase);
    const selfBusy = self.actionId !== 'none';
    return {
      self, target, distance, targetAngle,
      facingDiff, inFacing: Math.abs(facingDiff) <= R.FACING_HALF,
      targetThreat,
      targetAttacking: targetAction?.family === 'attack',
      targetBodyThreat: Boolean(targetAction?.isBodyAttack),
      selfBusy,
      nearEdge: Math.hypot(self.x, self.z) > R.ARENA_RADIUS * .78,
      targetNearEdge: Math.hypot(target.x, target.z) > R.ARENA_RADIUS * .78,
      staminaRatio: self.stamina / Math.max(self.maxStamina, 1),
      healthRatio: self.health / Math.max(self.maxHealth, 1),
    };
  }

  /**
   * Choose a legal-domain intent. The simulation still owns legality.
   * @param {import('../combat/CombatSimulation.js').CombatSimulation} simulation
   * @returns {{ intent: object|null, movement: object, state: string, reason: string }|null}
   */
  decide(simulation) {
    const tick = simulation.currentTick ?? simulation.clock.tick;
    const view = this.perceive(simulation);
    if (!view) return null;
    const { self, target } = view;
    view.blackboard = { ...this.blackboard.snapshot(tick), ...this.strategySignals };
    this.lastAdherenceMiss = null;  // reset each decide cycle
    this.pattern?.update(simulation, view, tick);

    this._updateState(view);
    const movement = this._movement(view);

    // Never replace an action mid-commitment. This prevents decision spam.
    if (view.selfBusy || tick < this.nextDecisionTick || tick < this.commitUntil) {
      return { intent: null, movement, state: this.state, reason: 'committed_or_cooldown' };
    }

    if (self.status === 'ko' || self.status === 'down') {
      this.state = self.status === 'down' ? BRAIN_STATES.DOWN : BRAIN_STATES.STAGGERED;
      return { intent: null, movement: { forward: 0, strafe: 0, turnTo: view.targetAngle }, state: this.state, reason: 'invalid_state' };
    }

    const tacticChoice = this._chooseTacticAction(view, tick);
    if (tacticChoice) this.pattern?.abort(tick, 'playbook_priority');
    if (tacticChoice?.movement) {
      this.nextDecisionTick = tick + this.decisionInterval;
      return { intent: null, movement: { ...movement, ...tacticChoice.movement }, state: this.state, reason: tacticChoice.reason || 'tactic_movement' };
    }
    if (tacticChoice?.strategySignal) {
      this.strategySignals[tacticChoice.strategySignal.channel] = tacticChoice.strategySignal.value;
      this.nextDecisionTick = tick + this.decisionInterval;
      return { intent: null, movement, state: this.state, reason: tacticChoice.reason || 'tactic_priority' };
    }
    if (tacticChoice?.blocked) {
      this.nextDecisionTick = tick + this.decisionInterval;
      return { intent: null, movement, state: this.state, reason: 'tactic_waiting' };
    }
    const patternChoice = tacticChoice ? null : this.pattern?.choose(view, tick, this.patternRng);
    if (patternChoice?.blocked) {
      this.nextDecisionTick = tick + this.decisionInterval;
      return { intent: null, movement, state: this.state, reason: patternChoice.reason };
    }
    const choice = tacticChoice || patternChoice || this._chooseAction(view);
    if (!choice) {
      this.nextDecisionTick = tick + this.decisionInterval;
      return { intent: null, movement, state: this.state, reason: 'no_scored_action' };
    }

    const def = getAction(choice.actionId);
    const intent = createActionIntent({
      actionId: choice.actionId,
      source: choice.source || 'ai',
      priority: clamp(choice.score, 0, 1),
      createdAt: tick,
      expiresAt: tick + Math.max(this.decisionInterval * 2, 12),
      targetId: target.id,
      reason: `${this.state}:${choice.reason}`, 
    });

    this.nextDecisionTick = tick + this.decisionInterval;
    this.commitUntil = tick + Math.max(def?.startup || 1, 1);
    this.lastDecision = {
      tick, actionId: choice.actionId, score: choice.score,
      state: this.state, reason: choice.reason,
      distance: view.distance, stamina: self.stamina,
    };
    this.decisionCount++;
    return { intent, movement, state: this.state, reason: choice.reason };
  }

  _updateState(view) {
    const { self, target, distance, targetThreat, nearEdge } = view;
    const board = view.blackboard || {};
    const preferredDistance = board.preferredDistance === 'far' ? this.profile.preferredDistance + 1.1
      : board.preferredDistance === 'close' ? Math.max(.9, this.profile.preferredDistance - .55)
      : this.profile.preferredDistance;
    if (self.status === 'down') { this.state = BRAIN_STATES.DOWN; return; }
    if (self.status === 'staggered') { this.state = BRAIN_STATES.STAGGERED; return; }
    if (self.actionPhase === 'recovery') { this.state = BRAIN_STATES.RECOVER; return; }
    if (targetThreat && this.profile.defenseBias > this.profile.pressureBias) {
      this.state = this.profile.evadeBias > .6 ? BRAIN_STATES.EVADE : BRAIN_STATES.DEFEND;
      return;
    }
    if (nearEdge && distance < this.profile.preferredDistance) {
      this.state = BRAIN_STATES.EVADE;
      return;
    }
    if (distance > preferredDistance + this.profile.distanceTolerance) {
      this.state = BRAIN_STATES.APPROACH;
      return;
    }
    if (distance < preferredDistance - this.profile.distanceTolerance) {
      this.state = BRAIN_STATES.EVADE;
      return;
    }
    this.state = this.profile.pressureBias > .62 ? BRAIN_STATES.PRESSURE : BRAIN_STATES.PREFERRED_RANGE;
  }

  _movement(view) {
    const { distance, targetAngle, nearEdge, targetNearEdge } = view;
    const p = this.profile;
    const board = view.blackboard || {};
    const preferredDistance = board.preferredDistance === 'far' ? p.preferredDistance + 1.1
      : board.preferredDistance === 'close' ? Math.max(.9, p.preferredDistance - .55)
      : p.preferredDistance;
    let forward = 0;
    if (distance > preferredDistance + p.distanceTolerance) forward = 1;
    else if (distance < preferredDistance - p.distanceTolerance) forward = nearEdge ? -1 : -.45;
    if (nearEdge && forward > 0) forward = -1;
    const strafe = nearEdge ? (p.strafeBias >= 0 ? 1 : -1) : p.strafeBias * .5;
    // If target is near edge, do not blindly retreat and give up ring position.
    if (targetNearEdge && distance > preferredDistance) forward = .35;
    return { forward, strafe, turnTo: targetAngle };
  }

  _chooseTacticAction(view, tick) {
    const { self } = view;
    const activeTactics = this.tacticRuntimes.filter(rt => rt.active).length;

    for (const runtime of this.tacticRuntimes) {
      const request = runtime.nextAction(view, tick);
      if (request) {
        const resolved = request.intent
          ? resolveTacticalIntent(request.intent, { view, profile: this.profile })
          : request.actionId ? { actionId: request.actionId, reason: request.reason } : request;
        if (resolved?.waiting) return { blocked: true };
        if (resolved?.strategySignal) return { strategySignal: resolved.strategySignal, blocked: true };
        if (resolved?.movement) return { movement: resolved.movement, score: request.priority ?? .7, source: 'tactic', reason: resolved.reason };
        const actionId = resolved?.actionId;
        const def = getAction(actionId);
        if (!def) continue;

        // --- Adherence roll ---
        const tacticCost = calculateTacticCost(runtime.tactic);
        const effective = computeAdherence({
          baseAdherence: this.profile.adherence,
          staminaRatio:  self ? (self.stamina / Math.max(self.maxStamina, 1)) : 1,
          isStaggered:   self?.status === 'staggered',
          tacticCost,
          activeTactics,
          nearEdge: view.nearEdge ?? false,
        });
        const { follows, roll, adherence } = rollAdherence(effective, this.rng);

        if (!follows) {
          // Record the miss for coach-feedback (P7.4). Reset tactic sequence
          // so it can re-trigger from scratch next time conditions match.
          runtime.reset();
          this.lastAdherenceMiss = {
            tick,
            tacticId:  runtime.tactic.id,
            actionId,
            intentType: request.intent?.type || 'action',
            roll:      +roll.toFixed(3),
            adherence: +adherence.toFixed(3),
            reason: adherenceMissReason({
              staminaRatio:   self ? (self.stamina / Math.max(self.maxStamina, 1)) : 1,
              isStaggered:    self?.status === 'staggered',
              tacticCost,
              activeTactics,
              nearEdge: view.nearEdge ?? false,
            }),
          };
          // Fall through to base utility for this tick.
          return null;
        }

        return { actionId, score: request.priority ?? runtime.tactic.priority ?? .7, source: 'tactic', reason: resolved.reason || request.reason };
      }
      // An activated tactic owns the next decision slot.
      if (runtime.active) return { blocked: true };
    }
    return null;
  }

  setPlaybook(tactics, revision = 0) {
    const result = validatePlaybook(tactics, { capacity: this.profile.tacticalCapacity });
    if (!result.ok) return result;
    this.tacticRuntimes = result.value
      .map(tactic => new TacticRuntime(tactic))
      .sort((a, b) => (b.tactic.priority ?? .7) - (a.tactic.priority ?? .7));
    this.playbookRevision = revision;
    return { ok: true, totalCost: result.totalCost, count: result.value.length };
  }

  resetTactics() {
    for (const runtime of this.tacticRuntimes) runtime.reset();
  }

  reset() {
    this.rng = new SeededRNG(this.seed);
    this.patternRng = new SeededRNG(this.seed ^ 0x7017);
    this.pattern?.reset();
    this.nextDecisionTick = 0;
    this.commitUntil = 0;
    this.state = BRAIN_STATES.OBSERVE;
    this.lastDecision = null;
    this.lastAdherenceMiss = null;
    this.decisionCount = 0;
    this.strategySignals = Object.create(null);
    this.blackboard.reset();
    this.resetTactics();
  }

  _chooseAction(view) {
    const candidates = [];
    const p = this.profile;
    const board = view.blackboard || {};
    const { self, distance, targetThreat, targetBodyThreat, inFacing, staminaRatio, nearEdge } = view;
    const preferredDistance = board.preferredDistance === 'far' ? p.preferredDistance + 1.1
      : board.preferredDistance === 'close' ? Math.max(.9, p.preferredDistance - .55)
      : p.preferredDistance;
    const rangeFit = distanceScore(distance, preferredDistance, p.distanceTolerance);

    for (const actionId of ATTACKS) {
      const def = getAction(actionId);
      const baseWeight = p.attackWeights[actionId] ?? 1;
      if (board.avoidActions?.includes(actionId)) continue;
      const affordable = staminaRatio <= 0 && def.staminaCost > 0 ? .25 : 1;
      const inReach = distance <= def.reach * 1.05 ? 1 : .15;
      const facing = inFacing ? 1 : .1;
      const heavyPenalty = HEAVY_ATTACKS.has(actionId) && staminaRatio < .35 ? .25 : 1;
      const risk = HEAVY_ATTACKS.has(actionId) ? p.riskTolerance : .9;
      let score = baseWeight * inReach * facing * affordable * heavyPenalty;
      score *= .55 + rangeFit * .45;
      score *= .75 + risk * .25;
      if (board.aggression) score *= 1 + board.aggression * .35;
      if (board.targetZone === 'body' && !def.isBodyAttack) score *= .72;
      if (board.targetZone === 'head' && def.isBodyAttack) score *= .72;
      if (board.tempo === 'high') score *= 1.12;
      if (board.tempo === 'patient') score *= .9;
      if (targetThreat) score *= p.counterBias > .65 ? 1.18 : .65;
      if (actionId === 'feint_jab' && targetThreat) score *= 1 + p.counterBias * .4;
      candidates.push({ actionId, score, reason: `attack_score:${score.toFixed(2)}` });
    }

    for (const actionId of DEFENSES) {
      const def = getAction(actionId);
      const baseWeight = p.defenseWeights[actionId] ?? 1;
      if (board.avoidActions?.includes(actionId)) continue;
      const affordable = staminaRatio <= 0 && def.staminaCost > 0 ? .2 : 1;
      // Defensive actions are responses, not idle filler. Without a threat they
      // should not outrank movement toward preferred range, especially for a
      // long-range robot whose opponent is still far away.
      let score = baseWeight * affordable * (targetThreat ? 1.4 : .08);
      // Prefer compatible responses without overriding explicit coach/tactic requests.
      if (targetThreat && resolveDefenseOutcome(view.target.actionId, actionId) === 'hit') score *= .1;
      if (DODGES.has(actionId)) score *= .7 + p.evadeBias * .7;
      if (PARRIES.has(actionId)) score *= .55 + p.counterBias * .65;
      if (HEAD_GUARDS.has(actionId) && targetBodyThreat) score *= .55;
      if (BODY_GUARDS.has(actionId) && !targetBodyThreat) score *= .65;
      if (nearEdge && DODGES.has(actionId)) score *= 1.15;
      if (board.aggression < 0 && DODGES.has(actionId)) score *= 1.1;
      if (board.guardBias > 0 && (HEAD_GUARDS.has(actionId) || BODY_GUARDS.has(actionId))) score *= 1 + board.guardBias;
      if (board.tempo === 'patient') score *= 1.08;
      candidates.push({ actionId, score, reason: `defense_score:${score.toFixed(2)}` });
    }

    const legalCandidates = candidates.filter(c => {
      const def = getAction(c.actionId);
      const minimumScore = targetThreat ? 0 : .18;
      return def && c.score > minimumScore && (staminaRatio > 0 || def.staminaCost === 0);
    });
    if (!legalCandidates.length) return null;

    // Seeded weighted-ish selection: choose among top three, preserving variety
    // while making the score still dominate the decision.
    legalCandidates.sort((a, b) => b.score - a.score);
    const top = legalCandidates.slice(0, Math.min(3, legalCandidates.length));
    const selected = top[this.rng.nextInt(0, top.length - 1)];
    return selected;
  }

  getDebugSnapshot() {
    return {
      fighterId: this.fighterId,
      definitionId: this.definitionId,
      state: this.state,
      nextDecisionTick: this.nextDecisionTick,
      commitUntil: this.commitUntil,
      decisionCount: this.decisionCount,
      lastDecision: this.lastDecision,
      lastAdherenceMiss: this.lastAdherenceMiss,
      pattern: this.pattern?.snapshot() ?? null,
      baseAdherence: this.profile.adherence,
      tacticalCapacity: this.profile.tacticalCapacity,
      blackboard: { ...this.blackboard.snapshot(this.nextDecisionTick), ...this.strategySignals },
      strategySignals: { ...this.strategySignals },
      tactics: this.tacticRuntimes.map(runtime => runtime.snapshot()),
      playbookRevision: this.playbookRevision,
    };
  }
}

export { BRAIN_STATES };
