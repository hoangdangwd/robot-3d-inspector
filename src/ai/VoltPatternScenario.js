// Deterministic review fixture, not a live coaching interpreter. Fixed staging
// only at reset; all subsequent actions go through CombatSimulation intents.
import { CombatBrain } from './CombatBrain.js';
import { createActionIntent } from '../combat/CombatTypes.js';
import { getAction, applyCapability } from '../combat/ActionRegistry.js';
import { getCapability } from '../combat/CombatRules.js';

export const VOLT_REVIEW_CASES = Object.freeze(['none', 'parry_left', 'parry_right', 'too_early', 'out_of_range']);
export class VoltPatternScenario {
  constructor(sim, response = 'none') {
    if (!VOLT_REVIEW_CASES.includes(response)) throw new Error('Unknown review response');
    this.sim = sim;
    this.response = response;
    this.brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'volt_kestrel', seed: 1 });
    sim.fighterA.z = -.85; sim.fighterB.z = .85;
    this.responded = false;
    this.history = [];
    this.lastEvent = null;
  }
  beforeTick() {
    const sim = this.sim;
    const tick = sim.currentTick;
    // One attempt only: base utility cannot obscure the storyboard after abort.
    if (tick === 1 || this.brain.pattern.active) {
      const d = this.brain.decide(sim);
      if (d?.intent?.reason.includes('pattern:')) sim.submitIntentFor('fighter_a', d.intent);
    }
    const event = this.brain.pattern.lastEvent;
    if (event && event !== this.lastEvent) {
      this.lastEvent = event;
      this.history.push({ ...event });
      sim.recordReplayMeta(event.type, event);
    }
    const a = sim.fighterA;
    if (this.response === 'out_of_range' && a.actionId === 'jab' && a.actionPhase === 'recovery') {
      sim.applyMovement('fighter_b', { forward: -1, strafe: 0, turnTo: Math.PI });
    } else sim.applyMovement('fighter_b', { forward: 0, strafe: 0, turnTo: Math.PI });
    if (this.responded || this.response === 'none' || this.response === 'out_of_range') return;
    const cross = applyCapability(getAction('cross'), getCapability('volt_kestrel'));
    // React to public cross startup, with enough lead time for parry startup.
    // "too_early" instead reacts to jab recovery and expires before cross contact.
    const due = this.response === 'too_early'
      ? a.actionId === 'jab' && a.actionPhase === 'recovery'
      : a.actionId === 'cross' && a.actionPhase === 'startup' && tick - a.actionTick >= cross.startup - 3;
    if (!due) return;
    const actionId = this.response === 'parry_right' ? 'parry_right' : 'parry_left';
    sim.submitIntentFor('fighter_b', createActionIntent({ actionId, source: 'ai', priority: .9,
      createdAt: tick, expiresAt: tick + 12, targetId: 'fighter_a', reason: `review:${this.response}` }));
    this.responded = true;
  }
}
