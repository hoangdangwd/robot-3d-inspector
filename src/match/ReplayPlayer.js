// ─── Replay Player ───────────────────────────────────────────────────
// Drives 3D presentation playback from a validated MatchReplay instance.
// No network, no model, no combat decisions — pure playback & transport.

import { MatchReplay } from './MatchReplay.js';
import { getRobotDefinition } from '../robots/robotCatalog.js';
import { RobotFactory } from '../robots/RobotFactory.js';
import { Fighter } from '../combat/Fighter.js';
import { SeededRNG } from '../combat/SeededRNG.js';
import { getActionIds } from '../combat/ActionRegistry.js';
import * as R from '../combat/CombatRules.js';

function buildAnimMap() {
  const map = {};
  for (const id of getActionIds()) {
    map[id] = { startup: id, active: id, recovery: id };
  }
  return map;
}

const HIT_ANIMS = ['hit_head_left', 'hit_head_right'];
const BODY_HIT_ANIM = 'hit_body';

export class ReplayPlayer {
  /**
   * @param {THREE.Scene} scene
   * @param {object} replayLog - Validated log from MatchReplay.exportLog
   * @param {object} [opts]
   * @param {Function} [opts.onStateChange]
   */
  constructor(scene, replayLog, opts = {}) {
    this.scene = scene;
    this.replayLog = replayLog;
    this.onStateChange = opts.onStateChange || (() => {});

    this.ACTION_ANIM_MAP = buildAnimMap();
    this.speed = 1;
    this.isPlaying = true;
    this.isFinished = false;
    this._accumulatedTime = 0;
    this._eventCursor = 0;
    this._lastAnimA = '';
    this._lastAnimB = '';

    const defIdA = (replayLog.defIdA || 'forge_titan').replace(/_/g, '-');
    const defIdB = (replayLog.defIdB || 'aegis_prime').replace(/_/g, '-');
    this.defA = getRobotDefinition(defIdA);
    this.defB = getRobotDefinition(defIdB);

    this.totalTicks = Math.max(1, replayLog.totalTicks ?? replayLog.roundDurationTicks ?? R.ROUND_DURATION_TICKS);

    // Presentation fighters
    this.fighterA = Fighter.fromFactory(this.defA, RobotFactory.create(this.defA), {
      platformY: 0, facingAngle: 0,
    });
    this.fighterB = Fighter.fromFactory(this.defB, RobotFactory.create(this.defB), {
      platformY: 0, facingAngle: Math.PI,
    });

    this.fighterA.setLoop(true);
    this.fighterB.setLoop(true);

    this.scene.add(this.fighterA.group);
    this.scene.add(this.fighterB.group);

    this.rng = new SeededRNG(replayLog.seed || 2026);
    this.replay = new MatchReplay(replayLog);

    this._syncPresentation(0);
    this._emitState();
  }

  play() {
    if (this.isFinished) {
      this.seekToTick(0);
    }
    this.isPlaying = true;
    this._emitState();
  }

  pause() {
    this.isPlaying = false;
    this._emitState();
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
    return this.isPlaying;
  }

  setSpeed(speed) {
    this.speed = Math.max(0.25, Math.min(4, Number(speed) || 1));
    this._emitState();
  }

  step(ticks = 1) {
    this.pause();
    this.seekToTick(this.replay._replayedTick + ticks);
  }

  seekToTick(targetTick) {
    const target = Math.max(0, Math.min(this.totalTicks, Math.floor(targetTick)));
    if (target < this.replay._replayedTick) {
      // Re-instantiate replay to seek backward cleanly & deterministically
      this.replay = new MatchReplay(this.replayLog);
      this.rng = new SeededRNG(this.replayLog.seed || 2026);
      this._eventCursor = 0;
      this._lastAnimA = '';
      this._lastAnimB = '';
    }
    this.replay.stepToTick(target);
    this.isFinished = this.replay._replayedTick >= this.totalTicks || this.replay._sim.matchStatus !== 'fighting';
    this._syncPresentation(0);
    this._emitState();
  }

  restart() {
    this.seekToTick(0);
    this.play();
  }

  update(delta) {
    if (!this.isPlaying) {
      this.fighterA.update(delta);
      this.fighterB.update(delta);
      return;
    }

    const tickDuration = 1 / R.TICK_RATE;
    this._accumulatedTime += delta * this.speed;

    while (this._accumulatedTime >= tickDuration) {
      this._accumulatedTime -= tickDuration;
      if (this.replay._replayedTick >= this.totalTicks || this.replay._sim.matchStatus !== 'fighting') {
        this.isFinished = true;
        this.isPlaying = false;
        break;
      }
      this.replay.stepToTick(this.replay._replayedTick + 1);
    }

    this._syncPresentation(delta);
    this._emitState();
  }

  _syncPresentation(delta) {
    const stateA = this.replay._sim.getState('fighter_a');
    const stateB = this.replay._sim.getState('fighter_b');

    if (stateA) {
      this.fighterA.group.position.set(stateA.x, 0, stateA.z);
      this.fighterA.group.rotation.y = stateA.facing;
      this._syncFighterAnim(this.fighterA, stateA, '_lastAnimA');
    }
    if (stateB) {
      this.fighterB.group.position.set(stateB.x, 0, stateB.z);
      this.fighterB.group.rotation.y = stateB.facing;
      this._syncFighterAnim(this.fighterB, stateB, '_lastAnimB');
    }

    // Reaction and event handling
    const events = this.replay._sim.log.after(this._eventCursor);
    for (const e of events.events) {
      if (e.type === 'contact_resolved' && e.data.result === 'hit') {
        const target = e.data.targetId === 'fighter_a' ? this.fighterA : this.fighterB;
        const anim = e.data.actionId?.startsWith('body_') ? BODY_HIT_ANIM : this.rng.pick(HIT_ANIMS);
        target.playAnimation(anim, { crossFade: 0.05 });
      }
      if (e.type === 'fighter_ko') {
        const victim = e.fighterId === 'fighter_a' ? this.fighterA : this.fighterB;
        victim.playAnimation('knockdown', { crossFade: 0.05 });
      }
    }
    this._eventCursor = events.toTotal;

    this.fighterA.update(delta);
    this.fighterB.update(delta);
  }

  _syncFighterAnim(fighter, state, cacheKey) {
    const mapping = this.ACTION_ANIM_MAP[state.actionId];
    if (!mapping) {
      if (this[cacheKey] !== 'idle') {
        fighter.playAnimation('idle', { crossFade: 0.12 });
        this[cacheKey] = 'idle';
      }
      return;
    }
    const clipName = mapping[state.actionPhase] || mapping.startup;
    const tag = `${state.actionId}_${state.actionPhase}`;
    if (this[cacheKey] !== tag) {
      fighter.playAnimation(clipName, { crossFade: 0.05 });
      this[cacheKey] = tag;
    }
  }

  _emitState() {
    this.onStateChange({
      tick: this.replay._replayedTick,
      totalTicks: this.totalTicks,
      isPlaying: this.isPlaying,
      isFinished: this.isFinished,
      speed: this.speed,
      state: this.replay.getState(),
      result: this.replay.result(),
      defA: this.defA,
      defB: this.defB,
    });
  }

  dispose() {
    this.scene.remove(this.fighterA.group);
    this.scene.remove(this.fighterB.group);
    this.fighterA.dispose();
    this.fighterB.dispose();
  }
}
