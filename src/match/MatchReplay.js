// ─── Match Replay ────────────────────────────────────────────────────
// Deterministic playback from seed + validated input/event log.
// No network, no model, no renderer dependency.

import { CombatSimulation } from '../combat/CombatSimulation.js';
import * as R from '../combat/CombatRules.js';
import { REPLAY_LOG_VERSION, validateReplayLog } from './ReplaySchema.js';

export { REPLAY_LOG_VERSION } from './ReplaySchema.js';

export class MatchReplay {
  constructor(exportedLog, opts = {}) {
    this._log = validateReplayLog(exportedLog);
    this._sim = new CombatSimulation({
      defIdA: this._log.defIdA,
      defIdB: this._log.defIdB,
      seed: this._log.seed,
      roundDurationTicks: opts.roundDurationTicks ?? this._log.roundDurationTicks ?? R.ROUND_DURATION_TICKS,
    });
    for (const [id, values] of Object.entries(this._log.initialState)) {
      const fighter = this._sim.getState(id);
      if (!fighter) continue;
      for (const key of ['x', 'z', 'facing', 'health', 'stamina', 'posture', 'status', 'actionId', 'actionPhase', 'actionTick', 'downUntil', 'getUpUntil']) {
        if (values[key] !== undefined) fighter[key] = values[key];
      }
    }
    this._inputsByTick = new Map();
    for (const input of this._log.inputs) {
      const list = this._inputsByTick.get(input.tick) ?? [];
      list.push(input);
      this._inputsByTick.set(input.tick, list);
    }
    this._metaByTick = new Map();
    for (const meta of this._log.replayMeta) {
      const list = this._metaByTick.get(meta.tick) ?? [];
      list.push(meta);
      this._metaByTick.set(meta.tick, list);
    }
    this._replayedTick = 0;
    this._injectInputsAtTick(0);
  }

  _injectInputsAtTick(tick) {
    const inputs = this._inputsByTick.get(tick) ?? [];
    for (const input of inputs) {
      if (input.type === 'intent_submitted') this._sim.submitIntentFor(input.fighterId, input.intent);
      else if (input.type === 'movement_applied') this._sim.applyMovement(input.fighterId, input.move);
    }
  }

  stepToTick(targetTick) {
    const target = Math.max(0, Math.floor(targetTick));
    while (this._replayedTick < target && this._sim.matchStatus === 'fighting') {
      this._replayedTick++;
      this._sim.currentTick = this._replayedTick;
      this._injectInputsAtTick(this._replayedTick);
      this._sim.update(1 / R.TICK_RATE);
    }
    return this._replayedTick;
  }

  stepToEnd() { return this.stepToTick(this._log.roundDurationTicks ?? R.ROUND_DURATION_TICKS); }

  getState() {
    return {
      tick: this._replayedTick,
      matchStatus: this._sim.matchStatus,
      winnerId: this._sim.winnerId,
      matchResult: this._sim.matchResult,
      a: { ...this._sim.getState('fighter_a') },
      b: { ...this._sim.getState('fighter_b') },
      secondsRemaining: this._sim.getRoundSecondsRemaining(),
    };
  }

  result() { return this._sim.matchResult ?? null; }

  static exportLog(sim, { defIdA, defIdB } = {}) {
    return {
      version: REPLAY_LOG_VERSION,
      defIdA: defIdA ?? sim.fighterA?.definitionId ?? 'unknown',
      defIdB: defIdB ?? sim.fighterB?.definitionId ?? 'unknown',
      seed: sim.seed,
      roundDurationTicks: sim.roundDurationTicks,
      totalTicks: sim.currentTick,
      matchStatus: sim.matchStatus,
      winnerId: sim.winnerId,
      matchResult: sim.matchResult ?? null,
      initialState: sim.getInitialReplayState ? sim.getInitialReplayState() : {
        fighter_a: { x: sim.fighterA.x, z: sim.fighterA.z, facing: sim.fighterA.facing },
        fighter_b: { x: sim.fighterB.x, z: sim.fighterB.z, facing: sim.fighterB.facing },
      },
      inputs: sim.getReplayInputs ? sim.getReplayInputs() : [],
      replayMeta: sim.getReplayMeta ? sim.getReplayMeta() : [],
      events: sim.log.toArray(),
    };
  }
}
