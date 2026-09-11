import { TacticRuntime } from '../tactics/TacticRuntime.js';
import { applyCapability, getAction } from '../combat/ActionRegistry.js';
import { getCapability } from '../combat/CombatRules.js';

// No simulated hits or private opponent plans. Consume public action/contact
// events to avoid advancing a sequence merely because an intent was requested.
export class RobotPatternRuntime {
  constructor(definition, fighterId, definitionId) {
    this.definition = definition;
    this.fighterId = fighterId;
    this.runtime = new TacticRuntime(definition.tactic);
    const cap = getCapability(definitionId.replace(/-/g, '_'));
    this.actions = definition.tactic.phases[0].sequence.map(s => applyCapability(getAction(s.actionId), cap));
    this.reset();
  }
  reset() {
    this.runtime.reset();
    this.active = false;
    this.pending = null;
    this.cursor = 0;
    this.nextStart = 0;
    this.settleUntil = 0;
    this.startedAt = 0;
    this.lastEvent = null;
  }
  event(type, tick, reason) {
    this.lastEvent = { type, patternId: this.definition.tactic.id, fighterId: this.fighterId, tick, reason };
  }
  abort(tick, reason) {
    if (!this.active) return;
    this.active = false;
    this.pending = null;
    this.runtime.reset();
    this.nextStart = tick + this.definition.cooldownTicks;
    this.event('pattern_aborted', tick, reason);
  }
  observe(sim, view, tick) {
    if (sim.log.total === this.cursor) return;
    if (!this.active) { this.cursor = sim.log.total; return; }
    const firstRetained = sim.log.total - sim.log.length;
    const startIndex = Math.max(0, this.cursor - firstRetained);
    if (this.cursor < firstRetained) this.abort(tick, 'event_history_lost');
    this.cursor = sim.log.total;
    for (let i = startIndex; i < sim.log.length; i++) {
      const e = sim.log.at(i);
      if (!this.active) break;
      if (e.type === 'contact_resolved' && e.fighterId === this.fighterId && e.data.result === 'parried') this.abort(tick, 'parried');
      if (e.fighterId !== this.fighterId) continue;
      if (e.type === 'action_rejected') this.abort(tick, 'action_rejected');
      if (e.type === 'action_started') {
        if (e.data.reason?.includes(`pattern:${this.definition.tactic.id}`) && e.data.actionId === this.pending?.id) this.pending.started = true;
        else this.abort(tick, 'other_action');
      }
      if (e.type === 'action_ended' && this.pending?.started && e.data.actionId === this.pending.id) {
        this.pending = null;
        if (this.runtime.stepIndex === this.actions.length) {
          this.active = false;
          this.runtime.reset();
          this.nextStart = tick + this.definition.cooldownTicks;
          this.settleUntil = tick + this.definition.settleTicks;
          this.event('pattern_finished', tick, 'sequence_completed');
        }
      }
    }
  }
  update(sim, view, tick) {
    this.observe(sim, view, tick);
    if (!this.active) return;
    const board = view.blackboard;
    if (!['ready', 'acting'].includes(view.self.status) || ['ko', 'down', 'getting_up'].includes(view.target.status)) this.abort(tick, 'unavailable');
    else if (tick - this.startedAt >= this.definition.tactic.timeoutTicks) this.abort(tick, 'timeout');
    else if (this.actions.some(a => board.avoidActions?.includes(a.id)) || board.preferredDistance === 'far' || board.aggression < 0) this.abort(tick, 'blackboard_override');
    else if (this.pending && !this.pending.started && tick - this.pending.tick > 12) this.abort(tick, 'request_not_started');
  }
  choose(view, tick, rng) {
    if (tick < this.settleUntil) return { blocked: true, reason: 'pattern_settle' };
    if (this.pending) return { blocked: true, reason: 'pattern_waiting' };
    if (!this.active) {
      if (['ko', 'down', 'getting_up'].includes(view.target.status)) return null;
      if (tick < this.nextStart || view.selfBusy || view.self.status !== 'ready' || view.targetThreat || view.nearEdge || !view.inFacing ||
          view.staminaRatio < this.definition.minStaminaRatio || view.blackboard.preferredDistance === 'far' || view.blackboard.aggression < 0 ||
          this.actions.some(a => view.distance > a.reach || view.blackboard.avoidActions?.includes(a.id)) ||
          view.self.stamina < this.actions.reduce((sum, a) => sum + a.staminaCost, 0)) return null;
      this.nextStart = tick + this.definition.retryTicks;
      if (rng.next() >= this.definition.chance) return null;
      this.active = true;
      this.startedAt = tick;
      this.event('pattern_started', tick, 'opening');
    }
    const next = this.actions[this.runtime.stepIndex];
    if (!next || view.distance > next.reach || !view.inFacing || view.self.stamina < next.staminaCost || view.nearEdge) {
      this.abort(tick, 'followup_unavailable');
      return null;
    }
    const request = this.runtime.nextAction(view, tick);
    if (!request) { this.abort(tick, 'runtime_ended'); return null; }
    this.pending = { id: request.actionId, started: false, tick };
    return { actionId: request.actionId, score: request.priority, reason: `pattern:${this.definition.tactic.id}:${request.actionId}` };
  }
  snapshot() {
    return { id: this.definition.tactic.id, active: this.active, step: this.runtime.stepIndex, pending: this.pending?.id ?? null, nextStart: this.nextStart, lastEvent: this.lastEvent };
  }
}
