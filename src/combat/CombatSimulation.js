// ─── Combat Simulation v2 ───────────────────────────────────────────
// Authoritative fixed-step match state. Expanded moveset + capabilities.
// No Three.js. No rendering. No network. No model calls in tick.

import { createFighterState, createCombatEvent,
         ActionPhase, FighterStatus } from './CombatTypes.js';
import { SimClock } from './SimClock.js';
import { EventLog } from './EventLog.js';
import { getAction, applyCapability } from './ActionRegistry.js';
import * as R from './CombatRules.js';
import { resolveDefenseOutcome } from './AttackDefenseMatrix.js';

export class CombatSimulation {
  /**
   * @param {object} opts
   * @param {string} opts.defIdA - robot definition id (underscore form)
   * @param {string} opts.defIdB
   * @param {number} [opts.seed]
   */
  constructor({ defIdA, defIdB, seed = 1, roundDurationTicks = R.ROUND_DURATION_TICKS }) {
    this.clock = new SimClock({ tickRate: R.TICK_RATE });
    this.currentTick = 0;
    this.log = new EventLog(4096);
    this.seed = seed;
    this._inputLog = [];
    this._replayMeta = [];
    this.roundDurationTicks = roundDurationTicks;
    this.initialState = {
      fighter_a: { x: 0, z: -R.STARTING_DISTANCE / 2, facing: 0 },
      fighter_b: { x: 0, z: R.STARTING_DISTANCE / 2, facing: Math.PI },
    };

    this.capA = R.getCapability(defIdA);
    this.capB = R.getCapability(defIdB);

    this.fighterA = createFighterState({
      id: 'fighter_a', definitionId: defIdA,
      x: 0, z: -R.STARTING_DISTANCE / 2, facing: 0,
      health: R.MAX_HEALTH, maxHealth: R.MAX_HEALTH,
      stamina: R.MAX_STAMINA, maxStamina: R.MAX_STAMINA,
      posture: R.MAX_POSTURE, maxPosture: R.MAX_POSTURE,
      downUntil: 0, getUpUntil: 0,
      status: FighterStatus.READY,
      actionId: 'none', actionPhase: ActionPhase.IDLE, actionTick: 0,
      targetId: 'fighter_b',
    });

    this.fighterB = createFighterState({
      id: 'fighter_b', definitionId: defIdB,
      x: 0, z: R.STARTING_DISTANCE / 2, facing: Math.PI,
      health: R.MAX_HEALTH, maxHealth: R.MAX_HEALTH,
      stamina: R.MAX_STAMINA, maxStamina: R.MAX_STAMINA,
      posture: R.MAX_POSTURE, maxPosture: R.MAX_POSTURE,
      downUntil: 0, getUpUntil: 0,
      status: FighterStatus.READY,
      actionId: 'none', actionPhase: ActionPhase.IDLE, actionTick: 0,
      targetId: 'fighter_a',
    });

    this.fighters = new Map([
      ['fighter_a', this.fighterA],
      ['fighter_b', this.fighterB],
    ]);
    this._initialReplayState = this._snapshotReplayState();

    this._caps = new Map([
      ['fighter_a', this.capA],
      ['fighter_b', this.capB],
    ]);

    this._hitDedup = new Set();
    /** @type {'fighting'|'ko'|'time'|'draw'} */
    this.matchStatus = 'fighting';
    this.winnerId = null;
    /** @type {object|null} populated when match ends */
    this.matchResult = null;
    /** @type {Map<string, import('./CombatTypes.js').ActionIntent|null>} */
    this._pendingIntents = new Map([
      ['fighter_a', null],
      ['fighter_b', null],
    ]);
    // Extra recovery ticks from parry stun (added to attacker's recovery)
    this._stunTicksRemaining = new Map([
      ['fighter_a', 0],
      ['fighter_b', 0],
    ]);
  }

  // ── Public API ──────────────────────────────────────────────────

  submitIntentFor(fighterId, intent) {
    if (!this.fighters.has(fighterId)) return false;
    this._pendingIntents.set(fighterId, intent);
    this._inputLog.push({ type: 'intent_submitted', tick: this.currentTick, fighterId, intent: { ...intent } });
    return true;
  }

  recordReplayMeta(type, data = {}, tick = this.currentTick) {
    this._replayMeta.push({ type, tick, data: structuredClone(data) });
  }

  getReplayInputs() { return this._inputLog.map(item => structuredClone(item)); }
  getReplayMeta() { return this._replayMeta.map(item => structuredClone(item)); }

  hasPendingIntent(fighterId) {
    return Boolean(this._pendingIntents.get(fighterId));
  }

  /**
   * Advance by wall-clock time. The optional callback runs immediately before
   * each fixed simulation tick, allowing local AI to perceive the same state
   * that the tick will consume. It must remain synchronous and local.
   * @param {number} wallDelta
   * @param {(simulation: CombatSimulation, tick: number) => void} [beforeTick]
   */
  update(wallDelta, beforeTick = null) {
    if (this.matchStatus !== 'fighting') return 0;
    const steps = this.clock.advance(wallDelta);
    const firstTick = this.clock.tick - steps + 1;
    for (let i = 0; i < steps; i++) {
      this.currentTick = firstTick + i;
      beforeTick?.(this, this.currentTick);
      this._tick(this.currentTick);
      if (this.matchStatus !== 'fighting') break;
    }
    this.currentTick = this.clock.tick;
    return steps;
  }

  getState(fighterId) { return this.fighters.get(fighterId); }

  /** Capture an explicit replay start state after fixture/setup mutations. */
  captureInitialState() {
    this._initialReplayState = this._snapshotReplayState();
    return structuredClone(this._initialReplayState);
  }

  getInitialReplayState() {
    return structuredClone(this._initialReplayState);
  }

  _snapshotReplayState() {
    return Object.fromEntries([...this.fighters].map(([id, fighter]) => [id, {
      x: fighter.x, z: fighter.z, facing: fighter.facing,
      health: fighter.health, stamina: fighter.stamina, posture: fighter.posture,
      status: fighter.status, actionId: fighter.actionId,
      actionPhase: fighter.actionPhase, actionTick: fighter.actionTick,
    }]));
  }

  getRecentEvents(since = 0) {
    const result = [];
    for (const ev of this.log) { if (ev.tick >= since) result.push(ev); }
    return result;
  }

  reset() {
    this.clock.reset();
    this.log.clear();
    this._inputLog = [];
    this._replayMeta = [];
    this._hitDedup.clear();
    this.matchStatus = 'fighting';
    this.winnerId = null;
    this.matchResult = null;
    this._pendingIntents.set('fighter_a', null);
    this._pendingIntents.set('fighter_b', null);
    this._stunTicksRemaining.set('fighter_a', 0);
    this._stunTicksRemaining.set('fighter_b', 0);
    this.currentTick = 0;
    this._resetFighter(this.fighterA, 0, -R.STARTING_DISTANCE / 2, 0);
    this._resetFighter(this.fighterB, 0, R.STARTING_DISTANCE / 2, Math.PI);
  }

  // ── Internal tick ───────────────────────────────────────────────

  _tick(tick = this.currentTick) {
    for (const [id, f] of this.fighters) this._tickFighter(f, id, tick);
    this.enforceFighterSeparation();
    this._resolveContacts(tick);
    this._checkMatchEnd(tick);
  }

  _tickFighter(f, id, tick) {
    if (f.status === FighterStatus.KO) return;

    // DOWN: wait for downUntil, then start get-up sequence.
    if (f.status === FighterStatus.DOWN) {
      if (tick >= f.downUntil) {
        f.status = FighterStatus.GETTING_UP;
        f.getUpUntil = tick + R.GET_UP_TICKS;
        // Restore partial posture after knockdown.
        f.posture = Math.max(1, Math.round(f.maxPosture * .35));
        this._emit(tick, id, 'fighter_get_up_started', {});
      }
      return;
    }
    // GETTING_UP: cannot act until complete.
    if (f.status === FighterStatus.GETTING_UP) {
      if (tick >= f.getUpUntil) {
        f.status = FighterStatus.READY;
        f.getUpUntil = 0;
        this._emit(tick, id, 'fighter_get_up_complete', {});
      }
      return;
    }

    // Stun countdown (from parry or guard break).
    const stun = this._stunTicksRemaining.get(id);
    if (stun > 0) {
      this._stunTicksRemaining.set(id, stun - 1);
      return; // frozen — no phase progress, no intent, no regen
    }
    // Clear stagger once stun expires.
    if (f.status === FighterStatus.STAGGERED) {
      f.status = FighterStatus.READY;
      this._emit(tick, id, 'stagger_ended', {});
    }

    if (f.actionId !== 'none') this._progressAction(f, id, tick);

    const exhaustedAtTickStart = f.stamina <= 0;

    // Stamina and posture regen when idle.
    if (f.actionPhase === ActionPhase.IDLE && f.stamina < f.maxStamina) {
      f.stamina = Math.min(f.maxStamina,
        f.stamina + R.STAMINA_REGEN_PER_SEC / R.TICK_RATE);
    }
    if (f.actionPhase === ActionPhase.IDLE && f.posture < f.maxPosture) {
      f.posture = Math.min(f.maxPosture,
        f.posture + R.POSTURE_REGEN_PER_SEC / R.TICK_RATE);
    }

    // Guard hold stamina drain
    const guardDef = getAction(f.actionId);
    if (guardDef && guardDef.isHold && f.actionPhase === ActionPhase.ACTIVE) {
      const drain = (guardDef.drainPerSec || 0) / R.TICK_RATE;
      if (drain > 0) {
        f.stamina = Math.max(0, f.stamina - drain);
        if (f.stamina <= 0) {
          // Guard break: stagger the defender.
          this._clearAction(f, tick);
          f.status = FighterStatus.STAGGERED;
          this._stunTicksRemaining.set(id, R.GUARD_BREAK_STAGGER_TICKS);
          this._emit(tick, id, 'guard_break', { actionId: guardDef.id });
        }
      }
    }

    // Process pending intent
    const intent = this._pendingIntents.get(id);
    if (intent) {
      if (tick > intent.expiresAt) {
        this._pendingIntents.set(id, null);
        return;
      }
      this._tryExecuteIntent(f, id, intent, tick, exhaustedAtTickStart);
    }
  }

  _progressAction(f, id, tick) {
    const baseDef = getAction(f.actionId);
    if (!baseDef) { this._clearAction(f, tick); return; }
    const cap = this._caps.get(id);
    const def = applyCapability(baseDef, cap);
    const elapsed = tick - f.actionTick;

    switch (f.actionPhase) {
      case ActionPhase.STARTUP: {
        const startupTicks = this._getStartupTicks(f, def);
        if (elapsed >= startupTicks) {
          if (def.active > 0 || def.isHold) {
            this._transitionPhase(f, id, ActionPhase.ACTIVE, tick);
          } else {
            this._transitionPhase(f, id, ActionPhase.RECOVERY, tick);
          }
        }
        break;
      }
      case ActionPhase.ACTIVE: {
        if (def.isHold) break;
        if (elapsed >= def.active) {
          this._transitionPhase(f, id, ActionPhase.RECOVERY, tick);
        }
        break;
      }
      case ActionPhase.RECOVERY: {
        if (elapsed >= def.recovery) {
          this._clearAction(f, tick);
          this._emit(tick, id, 'action_ended', { actionId: baseDef.id });
        }
        break;
      }
    }
  }

  _tryExecuteIntent(f, id, intent, tick, exhaustedAtTickStart = false) {
    if (f.status === FighterStatus.KO || f.status === FighterStatus.DOWN ||
        f.status === FighterStatus.GETTING_UP || f.status === FighterStatus.STAGGERED) return;

    const canAct = f.actionPhase === ActionPhase.IDLE;

    // Guard hold can be cancelled into any attack (goes through recovery first)
    if (!canAct) {
      const currentDef = getAction(f.actionId);
      if (currentDef && currentDef.isHold && f.actionPhase === ActionPhase.ACTIVE) {
        const targetDef = getAction(intent.actionId);
        if (targetDef && targetDef.family === 'attack') {
          this._transitionPhase(f, id, ActionPhase.RECOVERY, tick);
          return; // intent stays pending
        }
      }
      return;
    }

    const baseDef = getAction(intent.actionId);
    if (!baseDef) {
      this._pendingIntents.set(id, null);
      this._emit(tick, id, 'action_rejected', { actionId: intent.actionId, source: intent.source, reason: 'unknown_action' });
      return;
    }

    // Check allowed actions
    const cap = this._caps.get(id);
    if (cap.allowedActions && !cap.allowedActions.includes(intent.actionId)) {
      this._pendingIntents.set(id, null);
      this._emit(tick, id, 'action_rejected', { actionId: intent.actionId, source: intent.source, reason: 'capability_not_allowed' });
      return;
    }

    const modDef = applyCapability(baseDef, cap);
    if ((exhaustedAtTickStart || f.stamina <= 0) && modDef.staminaCost > 0) {
      this._pendingIntents.set(id, null);
      this._emit(tick, id, 'action_rejected', {
        actionId: intent.actionId, source: intent.source, reason: 'insufficient_stamina',
        requiredStamina: modDef.staminaCost, availableStamina: f.stamina,
      });
      return;
    }
    f.stamina = Math.max(0, f.stamina - modDef.staminaCost);

    f.actionId = baseDef.id;
    f.actionPhase = ActionPhase.STARTUP;
    f.actionTick = tick;
    f.status = FighterStatus.ACTING;
    this._pendingIntents.set(id, null);
    this._emit(tick, id, 'action_started', {
      actionId: baseDef.id, source: intent.source,
      priority: intent.priority, reason: intent.reason,
    });
  }

  _resolveContacts(tick) {
    for (const [attackerId, attacker] of this.fighters) {
      const baseDef = getAction(attacker.actionId);
      if (!baseDef || baseDef.family !== 'attack' || baseDef.active === 0) continue;
      if (attacker.actionPhase !== ActionPhase.ACTIVE) continue;

      const target = this.fighters.get(attacker.targetId);
      if (!target) continue;

      const dedupKey = `${attackerId}:${attacker.targetId}:${attacker.actionTick}`;
      if (this._hitDedup.has(dedupKey)) continue;

      const aCap = this._caps.get(attackerId);
      const def = applyCapability(baseDef, aCap);

      // Range check
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > def.reach) {
        this._hitDedup.add(dedupKey);
        this._emit(tick, attackerId, 'contact_resolved', {
          result: 'missed', targetId: attacker.targetId,
          actionId: baseDef.id, reason: 'out_of_range',
        });
        continue;
      }

      // Facing check
      const angleToTarget = Math.atan2(dx, dz);
      let facingDiff = angleToTarget - attacker.facing;
      while (facingDiff > Math.PI) facingDiff -= 2 * Math.PI;
      while (facingDiff < -Math.PI) facingDiff += 2 * Math.PI;
      if (Math.abs(facingDiff) > def.facingHalf) {
        this._hitDedup.add(dedupKey);
        this._emit(tick, attackerId, 'contact_resolved', {
          result: 'missed', targetId: attacker.targetId,
          actionId: baseDef.id, reason: 'bad_facing',
        });
        continue;
      }

      this._hitDedup.add(dedupKey);

      // Coverage is semantic, but a defense must also face the incoming opponent.
      let defenseFacing = Math.atan2(-dx, -dz) - target.facing;
      defenseFacing = Math.atan2(Math.sin(defenseFacing), Math.cos(defenseFacing));
      const defenseEligible = target.status === FighterStatus.ACTING &&
        target.actionPhase === ActionPhase.ACTIVE && Math.abs(defenseFacing) <= R.FACING_HALF;
      const defenseOutcome = resolveDefenseOutcome(baseDef.id, target.actionId, defenseEligible);
      const defenseData = { defenseId: target.actionId, defenseOutcome };

      if (defenseOutcome === 'evade') {
        this._emit(tick, attackerId, 'contact_resolved', {
          result: 'missed', targetId: attacker.targetId,
          actionId: baseDef.id, reason: 'dodged', ...defenseData,
        });
        continue;
      }

      // Parry — active phase: negates hit AND stuns attacker
      if (defenseOutcome === 'parry') {
        this._stunTicksRemaining.set(attackerId, R.PARRY_STUN_TICKS);
        this._emit(tick, attackerId, 'contact_resolved', {
          result: 'parried', targetId: attacker.targetId,
          actionId: baseDef.id, stunTicks: R.PARRY_STUN_TICKS, ...defenseData,
        });
        continue;
      }

      // Wrong-zone guard is a clean hit, not a weaker universal block.
      if (defenseOutcome === 'block') {
        const tCap = this._caps.get(attacker.targetId);
        const guardChip = Math.max(1, Math.round(def.chipDamage / (tCap.guardMult || 1)));
        const guardStaDrain = Math.round(def.guardStaminaDrain / (tCap.guardMult || 1));

        target.health = Math.max(0, target.health - guardChip);
        target.stamina = Math.max(0, target.stamina - guardStaDrain);

        this._emit(tick, attackerId, 'contact_resolved', {
          result: 'blocked', targetId: attacker.targetId,
          actionId: baseDef.id, damage: guardChip,
          matched: true, ...defenseData,
        });

        // Guard break: stamina exhausted by a hit while guarding.
        if (target.stamina <= 0 && target.status !== FighterStatus.KO) {
          this._clearAction(target, tick);
          target.status = FighterStatus.STAGGERED;
          this._stunTicksRemaining.set(target.id, R.GUARD_BREAK_STAGGER_TICKS);
          this._emit(tick, target.id, 'guard_break', { sourceActionId: baseDef.id });
        }
        continue;
      }

      // Clean hit — health and posture are authoritative simulation results.
      const postureDmg = Math.max(1, Math.round(def.damage * R.POSTURE_DAMAGE_RATIO));
      target.health  = Math.max(0, target.health  - def.damage);
      target.posture = Math.max(0, target.posture - postureDmg);
      this._emit(tick, attackerId, 'contact_resolved', {
        result: 'hit', targetId: attacker.targetId,
        actionId: baseDef.id, damage: def.damage, postureDamage: postureDmg, ...defenseData,
      });
      // Posture broken: goes DOWN (only if still alive).
      if (target.posture <= 0 && target.health > R.KO_HEALTH) {
        this._clearAction(target, tick);
        target.status   = FighterStatus.DOWN;
        target.downUntil  = tick + R.DOWN_TICKS;
        target.getUpUntil = 0;
        this._emit(tick, target.id, 'fighter_down', { sourceActionId: baseDef.id, downUntil: target.downUntil });
      }
    }
  }

  _checkMatchEnd(tick) {
    // KO: health reaches zero
    for (const [id, f] of this.fighters) {
      if (f.health <= R.KO_HEALTH && f.status !== FighterStatus.KO) {
        f.status = FighterStatus.KO;
        this._clearAction(f, tick);
        this._emit(tick, id, 'fighter_ko', {});
        const otherId = id === 'fighter_a' ? 'fighter_b' : 'fighter_a';
        this.matchStatus = 'ko';
        this.winnerId = otherId;
        this.matchResult = {
          reason: 'ko', winnerId: otherId,
          finalHealth: { fighter_a: this.fighterA.health, fighter_b: this.fighterB.health },
          tick,
        };
        this._emit(tick, otherId, 'match_end', { reason: 'ko', winnerId: otherId });
        return;
      }
    }
    // Round timer expired: decide by health
    if (tick >= this.roundDurationTicks && this.matchStatus === 'fighting') {
      const hA = this.fighterA.health;
      const hB = this.fighterB.health;
      let reason, winnerId;
      if (hA > hB)      { reason = 'time'; winnerId = 'fighter_a'; this.matchStatus = 'time'; }
      else if (hB > hA) { reason = 'time'; winnerId = 'fighter_b'; this.matchStatus = 'time'; }
      else              { reason = 'draw'; winnerId = null;         this.matchStatus = 'draw'; }
      this.winnerId = winnerId;
      this.matchResult = {
        reason, winnerId,
        finalHealth: { fighter_a: hA, fighter_b: hB },
        tick,
      };
      this._emit(tick, winnerId ?? 'fighter_a', 'match_end', { reason, winnerId });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  _getStartupTicks(f, modDef) {
    if (f.stamina <= 0) return Math.ceil(modDef.startup * R.EXHAUSTION_STARTUP_MULT);
    return modDef.startup;
  }

  _transitionPhase(f, id, phase, tick) {
    const from = f.actionPhase;
    if (from === phase) return;
    f.actionPhase = phase;
    f.actionTick = tick;
    this._emit(tick, id, 'action_phase_changed', {
      actionId: f.actionId, from, to: phase,
    });
  }

  _clearAction(f, tick) {
    const previousAction = f.actionId;
    const previousPhase = f.actionPhase;
    f.actionId = 'none';
    f.actionPhase = ActionPhase.IDLE;
    f.actionTick = tick;
    if (f.status === FighterStatus.ACTING) f.status = FighterStatus.READY;
    if (previousAction !== 'none' && previousPhase !== ActionPhase.IDLE) {
      this._emit(tick, f.id, 'action_phase_changed', {
        actionId: previousAction, from: previousPhase, to: ActionPhase.IDLE,
      });
    }
  }

  _emit(tick, fighterId, type, data) {
    this.log.push({ type, tick, fighterId, data });
  }

  _resetFighter(f, x, z, facing) {
    f.x = x; f.z = z; f.facing = facing;
    f.health = R.MAX_HEALTH; f.stamina = R.MAX_STAMINA;
    f.posture = R.MAX_POSTURE; f.downUntil = 0; f.getUpUntil = 0;
    f.status = FighterStatus.READY;
    f.actionId = 'none'; f.actionPhase = ActionPhase.IDLE; f.actionTick = 0;
  }

  applyMovement(fighterId, move) {
    const f = this.fighters.get(fighterId);
    if (!f) return;
    if (f.actionPhase !== ActionPhase.IDLE) return;
    if (f.status === FighterStatus.KO || f.status === FighterStatus.DOWN ||
        f.status === FighterStatus.GETTING_UP || f.status === FighterStatus.STAGGERED) return;
    if (this._stunTicksRemaining.get(fighterId) > 0) return;

    const cap = this._caps.get(fighterId);
    const dt = 1 / R.TICK_RATE;

    if (move.turnTo !== undefined) {
      let diff = move.turnTo - f.facing;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const maxTurn = R.TURN_RATE * (cap.turnMult || 1) * dt;
      f.facing += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }

    const fwd = Math.max(-1, Math.min(1, move.forward || 0));
    const str = Math.max(-1, Math.min(1, move.strafe || 0));
    const baseSpeed = fwd >= 0 ? R.MOVE_SPEED_FORWARD : R.MOVE_SPEED_BACKWARD;
    const speed = baseSpeed * (cap.speedMult || 1);
    const sin = Math.sin(f.facing);
    const cos = Math.cos(f.facing);

    let nx = f.x + (sin * fwd + cos * str) * speed * dt;
    let nz = f.z + (cos * fwd - sin * str) * speed * dt;

    const distSq = nx * nx + nz * nz;
    if (distSq > R.ARENA_RADIUS * R.ARENA_RADIUS) {
      const dist = Math.sqrt(distSq);
      nx = nx / dist * R.ARENA_RADIUS;
      nz = nz / dist * R.ARENA_RADIUS;
    }
    f.x = nx; f.z = nz;
    this._inputLog.push({ type: 'movement_applied', tick: this.currentTick, fighterId, move: { forward: fwd, strafe: str, turnTo: move.turnTo ?? null } });
  }

  getDistance() {
    const a = this.fighterA, b = this.fighterB;
    return Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
  }

  /** Remaining round ticks (0 when time is up or match ended). */
  getRoundTicksRemaining() {
    return Math.max(0, this.roundDurationTicks - this.currentTick);
  }

  /** Remaining round seconds (rounded up). */
  getRoundSecondsRemaining() {
    return Math.ceil(this.getRoundTicksRemaining() / R.TICK_RATE);
  }

  getAngleToTarget(fighterId) {
    const f = this.fighters.get(fighterId);
    const t = f && this.fighters.get(f.targetId);
    if (!f || !t) return 0;
    return Math.atan2(t.x - f.x, t.z - f.z);
  }

  /**
   * Keep fighters from occupying the same physical space.
   * This is a simulation constraint, independent of rendered armor geometry.
   * @param {number} [minimumDistance=.72]
   */
  enforceFighterSeparation(minimumDistance = .72) {
    const a = this.fighterA;
    const b = this.fighterB;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    let distance = Math.hypot(dx, dz);
    if (distance >= minimumDistance) return;
    if (distance < 1e-6) { dx = 0; dz = 1; distance = 1; }
    const nx = dx / distance;
    const nz = dz / distance;
    const push = (minimumDistance - distance) * .5;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
    this._clampToArena(a);
    this._clampToArena(b);
  }

  _clampToArena(f) {
    const distance = Math.hypot(f.x, f.z);
    if (distance > R.ARENA_RADIUS) {
      f.x = f.x / distance * R.ARENA_RADIUS;
      f.z = f.z / distance * R.ARENA_RADIUS;
    }
  }
}
