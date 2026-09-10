// ─── Validated tactic runtime ──────────────────────────────────────
// Executes bounded tactic data as requests. It never applies combat truth.

export class TacticRuntime {
  constructor(tactic) {
    this.tactic = tactic;
    this.reset();
  }

  reset() {
    this.active = false;
    this.phaseIndex = 0;
    this.stepIndex = 0;
    this.activeSteps = [];
    this.startedAt = 0;
    this.repeatCount = 0;
    this.lastEvent = null;
  }

  nextAction(view, tick) {
    if (!this.active) {
      if (!matchesCondition(this.tactic.trigger, view)) return null;
      this._activate(view, tick);
    }

    if (tick - this.startedAt >= this.tactic.timeoutTicks) return this._abort('timeout', tick);
    if ((this.tactic.abort || []).some(condition => matchesCondition(condition, view))) return this._abort('abort_condition', tick);

    while (this.active) {
      if (this.stepIndex >= this.activeSteps.length) {
        this.phaseIndex++;
        if (this.phaseIndex >= this.tactic.phases.length) {
          this.repeatCount++;
          if (this.repeatCount >= this.tactic.repeatLimit) return this._finish('repeat_limit', tick);
          this.phaseIndex = 0;
        }
        this._selectPhase(view, tick);
        continue;
      }
      const step = this.activeSteps[this.stepIndex];
      if (step.condition && !matchesCondition(step.condition, view)) return null;
      if (this.tactic.schemaVersion === 2 && step.intent?.type === 'wait_for') {
        if (!matchesWaitIntent(step.intent, view)) {
          this.lastEvent = { type: 'tactic_waiting', tacticId: this.tactic.id, signal: step.intent.signal, tick };
          return { waiting: true, tacticId: this.tactic.id, priority: this.tactic.priority ?? .7, reason: `tactic:${this.tactic.id}:wait_for:${step.intent.signal}` };
        }
        this.stepIndex++;
        continue;
      }
      this.stepIndex++;
      this.lastEvent = { type: 'step_requested', tacticId: this.tactic.id, intent: step.intent || { type: 'action', actionId: step.actionId }, tick };
      const request = {
        tacticId: this.tactic.id,
        priority: this.tactic.priority ?? .7,
        reason: `tactic:${this.tactic.id}:phase_${this.phaseIndex + 1}`,
      };
      if (this.tactic.schemaVersion === 2) request.intent = structuredClone(step.intent);
      else request.actionId = step.actionId;
      return request;
    }
    return null;
  }

  _activate(view, tick) {
    this.active = true;
    this.phaseIndex = 0;
    this.stepIndex = 0;
    this.repeatCount = 0;
    this.startedAt = tick;
    this.lastEvent = { type: 'tactic_started', tacticId: this.tactic.id, tick };
    this._selectPhase(view, tick);
  }

  _selectPhase(view, tick) {
    const phase = this.tactic.phases[this.phaseIndex];
    const branch = (phase.branches || []).find(item => matchesCondition(item.when, view));
    this.activeSteps = branch ? branch.sequence : phase.sequence;
    this.stepIndex = 0;
    this.lastEvent = { type: 'phase_started', tacticId: this.tactic.id, phaseId: phase.id, tick };
  }

  _abort(reason, tick) {
    this.lastEvent = { type: 'tactic_aborted', tacticId: this.tactic.id, reason, tick };
    this.active = false;
    this.activeSteps = [];
    return null;
  }

  _finish(reason, tick) {
    this.lastEvent = { type: 'tactic_finished', tacticId: this.tactic.id, reason, tick };
    this.active = false;
    this.activeSteps = [];
    return null;
  }

  snapshot() {
    return {
      tacticId: this.tactic.id,
      active: this.active,
      phaseIndex: this.phaseIndex,
      stepIndex: this.stepIndex,
      repeatCount: this.repeatCount,
      lastEvent: this.lastEvent,
    };
  }
}

export function matchesCondition(condition, view) {
  if (!condition || condition.type === 'always') return true;
  const self = view?.self;
  const target = view?.target;
  switch (condition.type) {
    case 'enemy_attack_start':
      return Boolean(view?.targetThreat) && (!condition.actionId || target?.actionId === condition.actionId);
    case 'enemy_action':
      return target?.actionId === condition.actionId;
    case 'self_health_below':
      return (self?.health / Math.max(self?.maxHealth || 1, 1)) <= condition.ratio;
    case 'self_stamina_below':
      return (self?.stamina / Math.max(self?.maxStamina || 1, 1)) <= condition.ratio;
    case 'near_edge':
      return Boolean(view?.nearEdge);
    case 'target_near_edge':
      return Boolean(view?.targetNearEdge);
    case 'distance_band':
      return distanceBand(view?.distance) === condition.band;
    default:
      return false;
  }
}

function distanceBand(distance = Infinity) {
  if (distance <= 1.5) return 'close';
  if (distance <= 2.8) return 'mid';
  return 'far';
}

function matchesWaitIntent(intent, view) {
  switch (intent.signal) {
    case 'enemy_attack': return Boolean(view?.targetThreat);
    case 'enemy_action': return !intent.actionId || view?.target?.actionId === intent.actionId;
    case 'distance_band': return distanceBand(view?.distance) === intent.band;
    case 'self_stamina_below': return (view?.self?.stamina / Math.max(view?.self?.maxStamina || 1, 1)) <= intent.ratio;
    default: return false;
  }
}
