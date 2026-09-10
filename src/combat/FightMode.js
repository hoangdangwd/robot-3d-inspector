// ─── Fight Mode Controller ──────────────────────────────────────────
// Bridges CombatSimulation (pure domain) to Three.js presentation.
// Reads simulation state each frame; never writes combat truth.

import * as THREE from 'three';
import { CombatSimulation } from './CombatSimulation.js';
import { createActionIntent } from './CombatTypes.js';
import { CombatBrain } from '../ai/CombatBrain.js';
import { CombatBlackboard } from '../ai/CombatBlackboard.js';
import { DirectCommandQueue } from '../coaching/DirectCommandQueue.js';
import { PlaybookStore } from '../tactics/PlaybookStore.js';
import { TimeOutManager } from '../match/TimeOutManager.js';
import { SeededRNG } from './SeededRNG.js';
import { Fighter } from './Fighter.js';
import { RobotFactory } from '../robots/RobotFactory.js';
import { getRobotDefinition } from '../robots/robotCatalog.js';
import { getAction, getActionIds } from './ActionRegistry.js';
import * as R from './CombatRules.js';
import { MatchReplay } from '../match/MatchReplay.js';

// Build animation map dynamically from all registered actions.
// Each action maps to its own semantic clip ID for all phases.
function buildAnimMap() {
  const map = {};
  for (const id of getActionIds()) {
    map[id] = { startup: id, active: id, recovery: id };
  }
  return map;
}

const HIT_ANIMS = ['hit_head_left', 'hit_head_right'];
const BODY_HIT_ANIM = 'hit_body';

function getOptionalStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export class FightMode {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts
   * @param {string} opts.defIdA - catalog id for fighter A
   * @param {string} opts.defIdB - catalog id for fighter B
   * @param {Function} [opts.onStateChange] - called each tick with snapshot
   */
  constructor(scene, { defIdA, defIdB, seed = 2026, onStateChange, playbookA = [], playbookB = [], playbookRevisionA = 0, playbookRevisionB = 0 }) {
    this.scene = scene;
    this.onStateChange = onStateChange || (() => {});
    this.ACTION_ANIM_MAP = buildAnimMap();

    const defA = getRobotDefinition(defIdA);
    const defB = getRobotDefinition(defIdB);

    // Simulation
    this.sim = new CombatSimulation({
      defIdA: defA.id.replace(/-/g, '_'),
      defIdB: defB.id.replace(/-/g, '_'),
      seed,
    });
    this.rng = new SeededRNG(seed);

    // Presentation fighters
    this.fighterA = Fighter.fromFactory(defA, RobotFactory.create(defA), {
      platformY: 0, facingAngle: 0,
    });
    this.fighterB = Fighter.fromFactory(defB, RobotFactory.create(defB), {
      platformY: 0, facingAngle: Math.PI,
    });

    this.fighterA.setLoop(true);
    this.fighterB.setLoop(true);

    scene.add(this.fighterA.group);
    scene.add(this.fighterB.group);

    this.commandQueue = new DirectCommandQueue({ maxSize: 4 });
    this.timeouts = new TimeOutManager();
    this.brains = [
      new CombatBrain({ fighterId: 'fighter_a', definitionId: defA.id.replace(/-/g, '_'), seed: seed + 2075,
        blackboard: new CombatBlackboard({ fighterId: 'fighter_a' }) }),
      new CombatBrain({ fighterId: 'fighter_b', definitionId: defB.id.replace(/-/g, '_'), seed: seed + 2076,
        blackboard: new CombatBlackboard({ fighterId: 'fighter_b' }) }),
    ];
    const storage = getOptionalStorage();
    this.playbookStores = new Map([
      ['fighter_a', new PlaybookStore({ storage, key: 'robot-foundry.playbook.fighter-a.v1', capacity: this.brains[0].profile.tacticalCapacity })],
      ['fighter_b', new PlaybookStore({ storage, key: 'robot-foundry.playbook.fighter-b.v1', capacity: this.brains[1].profile.tacticalCapacity })],
    ]);
    const storedA = this.playbookStores.get('fighter_a').load();
    const storedB = this.playbookStores.get('fighter_b').load();
    this.setPlaybook('fighter_a', playbookA.length ? playbookA : storedA.tactics, playbookA.length ? playbookRevisionA : storedA.revision);
    this.setPlaybook('fighter_b', playbookB.length ? playbookB : storedB.tactics, playbookB.length ? playbookRevisionB : storedB.revision);

    // Track last-applied animation to avoid re-triggering
    this._lastAnimA = '';
    this._lastAnimB = '';
    // Cursor is EventLog.total, not a simulation tick: multiple events may share a tick.
    this._eventCursor = 0;
    this._activeCommands = new Map();
  }

  /**
   * Update simulation + presentation.
   * @param {number} delta - wall-clock seconds from render loop
   */
  update(delta) {
    if (this.sim.matchStatus !== 'fighting') {
      // Consume the final match event before continuing presentation playback.
      this._syncPresentation(delta);
      this.onStateChange({
        a: { ...this.sim.getState('fighter_a') },
        b: { ...this.sim.getState('fighter_b') },
        matchStatus: this.sim.matchStatus,
        winnerId: this.sim.winnerId,
        matchResult: this.sim.matchResult,
        roundTicksRemaining: this.sim.getRoundTicksRemaining(),
        roundSecondsRemaining: this.sim.getRoundSecondsRemaining(),
        tick: this.sim.clock.tick,
        timeout: this.timeouts.snapshot(),
        coaching: this.getCoachingSnapshot(),
      });
      return;
    }

    // Local autonomous brains run immediately before each fixed simulation tick.
    // They only submit intents/movement; CombatSimulation remains authoritative.
    this.sim.update(delta, () => this._runBrains());

    // Sync presentation from simulation state
    this._syncPresentation(delta);

    // Notify UI
    const stateA = this.sim.getState('fighter_a');
    const stateB = this.sim.getState('fighter_b');
    this.onStateChange({
      a: { ...stateA },
      b: { ...stateB },
      matchStatus: this.sim.matchStatus,
      winnerId: this.sim.winnerId,
      matchResult: this.sim.matchResult,
      roundTicksRemaining: this.sim.getRoundTicksRemaining(),
      roundSecondsRemaining: this.sim.getRoundSecondsRemaining(),
      tick: this.sim.clock.tick,
      timeout: this.timeouts.snapshot(),
      coaching: this.getCoachingSnapshot(),
    });
  }

  _runBrains() {
    // Expiry is advanced independently of whether a fighter currently has a
    // free action slot.
    this.commandQueue.expire(this.sim.currentTick);
    // Live commands get first refusal while the fighter is idle. They are
    // still ordinary intents; simulation validation remains authoritative.
    const commandIntentSubmitted = new Set();
    for (const brain of this.brains) {
      const state = this.sim.getState(brain.fighterId);
      if (!state) continue;
      if (state.status === 'down' || state.status === 'ko') {
        const unavailable = this.commandQueue.lease(brain.fighterId, this.sim.currentTick);
        if (unavailable.command) this.commandQueue.complete(unavailable.command.commandId, 'rejected', this.sim.currentTick, 'fighter_unable_to_act');
        continue;
      }
      if (state.actionPhase !== 'idle') continue;
      const queued = this.commandQueue.peek(brain.fighterId, this.sim.currentTick);
      if (queued?.actionId) {
        const queuedDef = getAction(queued.actionId);
        const distance = this.sim.getDistance();
        if (queuedDef?.family === 'attack' && distance > queuedDef.reach * 1.05) {
          // Keep the request queued while the base brain closes distance. It
          // will expire rather than teleporting a hit across the arena.
          continue;
        }
      }
      const leased = this.commandQueue.lease(brain.fighterId, this.sim.currentTick);
      if (!leased.command) continue;
      const command = leased.command;
      const intent = createActionIntent({
        actionId: command.actionId,
        source: 'direct_command',
        priority: command.priority,
        createdAt: command.createdAt,
        expiresAt: command.expiresAt,
        targetId: state.targetId,
        reason: `live:${command.transcript}`,
      });
      this.sim.recordReplayMeta('direct_command_leased', { fighterId: brain.fighterId, commandId: command.commandId, actionId: command.actionId });
      this.sim.submitIntentFor(brain.fighterId, intent);
      this._activeCommands.set(brain.fighterId, command);
      commandIntentSubmitted.add(brain.fighterId);
    }

    for (const brain of this.brains) {
      if (commandIntentSubmitted.has(brain.fighterId)) continue;
      const decision = brain.decide(this.sim);
      if (!decision) continue;
      this.sim.applyMovement(brain.fighterId, decision.movement);
      if (decision.intent) this.sim.submitIntentFor(brain.fighterId, decision.intent);
      if (brain.lastAdherenceMiss) this.sim.recordReplayMeta('tactic_adherence_miss', brain.lastAdherenceMiss);
    }
  }

  openTimeout() {
    if (this.sim.matchStatus !== 'fighting') return { ok: false, error: 'match_finished' };
    const result = this.timeouts.open(this.sim.clock.tick);
    if (result.ok) {
      this.sim.clock.pause();
      this.sim.recordReplayMeta('timeout_opened', { timeout: result.timeout });
    }
    return { ...result, timeout: this.timeouts.snapshot(), playbook: this.getPlaybook('fighter_a') };
  }

  cancelTimeout() {
    const result = this.timeouts.cancel();
    if (result.ok) {
      this.sim.clock.resume();
      this.sim.recordReplayMeta('timeout_cancelled', { timeout: result.timeout });
    }
    return { ...result, timeout: this.timeouts.snapshot() };
  }

  commitTimeout(tactics, expectedRevision = 0) {
    if (!this.timeouts.active) return { ok: false, error: 'not_open' };
    const result = this.commitPlaybook('fighter_a', tactics, expectedRevision);
    if (!result.ok) return result;
    const closed = this.timeouts.commit();
    this.sim.clock.resume();
    this.sim.recordReplayMeta('timeout_committed', {
      timeout: closed.timeout, revision: result.revision,
    });
    return { ...result, ...closed, timeout: this.timeouts.snapshot() };
  }

  getPlaybook(fighterId) {
    return this.playbookStores?.get(fighterId)?.snapshot().tactics || [];
  }

  exportReplay() {
    return MatchReplay.exportLog(this.sim, {
      defIdA: this.sim.fighterA.definitionId,
      defIdB: this.sim.fighterB.definitionId,
    });
  }

  setPlaybook(fighterId, tactics, revision = 0) {
    const brain = this.brains.find(item => item.fighterId === fighterId);
    if (!brain) return { ok: false, error: 'unknown_fighter' };
    const result = brain.setPlaybook(tactics, revision);
    if (result.ok) this.sim.recordReplayMeta('playbook_loaded', { fighterId, revision, tacticCount: tactics.length });
    return result;
  }

  commitPlaybook(fighterId, tactics, expectedRevision = 0) {
    const store = this.playbookStores?.get(fighterId);
    if (!store) return { ok: false, error: 'unknown_fighter' };
    const result = store.commit(tactics, expectedRevision);
    if (!result.ok) return result;
    const applied = this.setPlaybook(fighterId, result.tactics, result.revision);
    if (!applied.ok) return applied;
    this.sim.recordReplayMeta('playbook_committed', { fighterId, revision: result.revision, tacticCount: result.tactics.length });
    return result;
  }

  enqueueDirectCommand(command) {
    // A newer live request replaces an older pending request for the same
    // fighter; an already leased action remains simulation-authoritative.
    this.commandQueue.supersedePending(command?.fighterId, 'newer_direct_command');
    const result = this.commandQueue.enqueue(command);
    if (result.status === 'queued') this.sim.recordReplayMeta('direct_command_queued', { fighterId: command.fighterId, commandId: command.commandId, actionId: command.actionId });
    return result;
  }

  applyBlackboardOverride(override) {
    const brain = this.brains.find(item => item.fighterId === override?.fighterId);
    if (!brain) return { status: 'rejected', reason: 'unknown_fighter' };
    const result = brain.blackboard.apply(override);
    if (result.status === 'active') this.sim.recordReplayMeta('blackboard_override_applied', { fighterId: override.fighterId, commandId: override.commandId, changes: override.changes });
    return result;
  }

  cancelBlackboardOverride(fighterId, commandId) {
    const brain = this.brains.find(item => item.fighterId === fighterId);
    return brain?.blackboard.cancel(commandId) || false;
  }

  getCoachingSnapshot() {
    return {
      commands: this.commandQueue.events().slice(-12),
      pending: this.commandQueue.pending(),
      brains: this.brains.map(brain => brain.getDebugSnapshot()),
      playbooks: this.brains.map(brain => {
        const store = this.playbookStores?.get(brain.fighterId);
        const snap = store?.snapshot();
        const totalCost = snap?.totalCost ?? 0;
        const capacity = brain.profile.tacticalCapacity ?? 5;
        const activeCount = brain.tacticRuntimes.filter(rt => rt.active).length;
        return {
          fighterId: brain.fighterId,
          revision: brain.playbookRevision,
          tacticCount: brain.tacticRuntimes.length,
          activeCount,
          totalCost,
          capacity,
          remainingCapacity: Math.max(0, capacity - totalCost),
          isOverCapacity: totalCost > capacity,
        };
      }),
    };
  }

  _syncPresentation(delta) {
    const stateA = this.sim.getState('fighter_a');
    const stateB = this.sim.getState('fighter_b');

    // Position from simulation
    this.fighterA.group.position.set(stateA.x, 0, stateA.z);
    this.fighterA.group.rotation.y = stateA.facing;
    this.fighterB.group.position.set(stateB.x, 0, stateB.z);
    this.fighterB.group.rotation.y = stateB.facing;

    // Animation from action state
    this._syncFighterAnim(this.fighterA, stateA, '_lastAnimA');
    this._syncFighterAnim(this.fighterB, stateB, '_lastAnimB');

    // Process each combat event once. Tick is not a sufficient cursor because
    // several events can be emitted during the same simulation tick.
    const eventBatch = this.sim.log.after(this._eventCursor);
    for (const ev of eventBatch.events) {
      if (ev.type === 'action_started' && ev.data.source === 'direct_command') {
        const command = this._activeCommands.get(ev.fighterId);
        if (command) {
          this.commandQueue.complete(command.commandId, 'executed', ev.tick);
          this._activeCommands.delete(ev.fighterId);
        }
      }
      if (ev.type === 'action_rejected' && ev.data.source === 'direct_command') {
        const command = this._activeCommands.get(ev.fighterId);
        if (command) {
          this.commandQueue.complete(command.commandId, 'rejected', ev.tick, ev.data.reason);
          this._activeCommands.delete(ev.fighterId);
        }
      }
      if (ev.type === 'contact_resolved' && ev.data.result === 'hit') {
        const targetFighter = ev.data.targetId === 'fighter_a' ? this.fighterA : this.fighterB;
        const isBody = ev.data.actionId?.startsWith('body_');
        const hitAnim = isBody ? BODY_HIT_ANIM : this.rng.pick(HIT_ANIMS);
        targetFighter.playAnimation(hitAnim, { crossFade: 0.05 });
      }
      if (ev.type === 'fighter_ko') {
        const koFighter = ev.fighterId === 'fighter_a' ? this.fighterA : this.fighterB;
        koFighter.playAnimation('knockdown', { crossFade: 0.05 });
      }
    }
    this._eventCursor = eventBatch.toTotal;

    this.fighterA.update(delta);
    this.fighterB.update(delta);
  }

  _syncFighterAnim(fighter, state, lastAnimKey) {
    const map = this.ACTION_ANIM_MAP[state.actionId];
    if (!map) {
      // Idle
      if (this[lastAnimKey] !== 'idle') {
        fighter.playAnimation('idle', { crossFade: 0.12 });
        this[lastAnimKey] = 'idle';
      }
      return;
    }

    const anim = map[state.actionPhase] || map.startup;
    if (this[lastAnimKey] !== `${state.actionId}_${state.actionPhase}`) {
      fighter.playAnimation(anim, { crossFade: 0.05 });
      this[lastAnimKey] = `${state.actionId}_${state.actionPhase}`;
    }
  }

  /** Reset the fight. */
  reset() {
    this.sim.reset();
    this.sim.clock.resume();
    this.timeouts.reset();
    this._lastAnimA = '';
    this._lastAnimB = '';
    this._eventCursor = 0;
    this.commandQueue.clear();
    this._activeCommands.clear();
    this.rng = new SeededRNG(2026);
    for (const brain of this.brains) brain.reset();
    this.fighterA.playAnimation('idle', { crossFade: 0 });
    this.fighterB.playAnimation('idle', { crossFade: 0 });
    // Reset positions
    this.fighterA.group.position.set(0, 0, -R.STARTING_DISTANCE / 2);
    this.fighterA.group.rotation.y = 0;
    this.fighterB.group.position.set(0, 0, R.STARTING_DISTANCE / 2);
    this.fighterB.group.rotation.y = Math.PI;
  }

  dispose() {
    this.scene.remove(this.fighterA.group);
    this.scene.remove(this.fighterB.group);
    this.fighterA.dispose();
    this.fighterB.dispose();
  }
}
