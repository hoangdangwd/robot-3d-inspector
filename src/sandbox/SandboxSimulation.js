// ─── Fixed-step Sandbox movement simulation ────────────────────────
// Owns authoritative player movement state for the Sandbox mode.
// No Three.js, DOM, network, wall-clock or rendering dependencies.

import { SimClock } from '../combat/SimClock.js';
import {
  SandboxIntentType,
  validateSandboxIntent,
} from './SandboxIntent.js';
import * as R from './SandboxRules.js';

const MOVEMENT_TYPES = new Set([SandboxIntentType.MOVE, SandboxIntentType.STOP]);
const TAU = Math.PI * 2;

export class SandboxSimulation {
  /**
   * @param {object} [options]
   * @param {number} [options.seed=1] Retained for deterministic fixtures/future systems.
   * @param {number} [options.arenaRadius=SANDBOX_ARENA_RADIUS]
   * @param {number} [options.startX=0]
   * @param {number} [options.startZ=0]
   * @param {number} [options.startHeading=0]
   */
  constructor(options = {}) {
    const settings = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    this.seed = Number.isSafeInteger(settings.seed) ? settings.seed : 1;
    this.arenaRadius = positiveFinite(settings.arenaRadius, R.SANDBOX_ARENA_RADIUS);
    this.clock = new SimClock({
      tickRate: R.SANDBOX_TICK_RATE,
      maxCatchUp: R.SANDBOX_MAX_CATCH_UP,
    });

    const start = clampToArena(
      finiteOr(settings.startX, 0),
      finiteOr(settings.startZ, 0),
      this.arenaRadius,
    );
    this.initialPlayer = {
      x: start.x,
      z: start.z,
      heading: normalizeAngle(finiteOr(settings.startHeading, 0)),
    };
    this.player = {
      ...this.initialPlayer,
      health: R.SANDBOX_MAX_PLAYER_HEALTH,
      maxHealth: R.SANDBOX_MAX_PLAYER_HEALTH,
      energy: R.SANDBOX_MAX_PLAYER_ENERGY,
      maxEnergy: R.SANDBOX_MAX_PLAYER_ENERGY,
      velocity: { x: 0, z: 0 },
      desiredMoveAngle: null,
      isMoving: false,
    };
    this.pendingIntent = null;
    this.activeIntent = null;
    this.pendingFireIntent = null;
    this.activeFireIntent = null;
    this.nextBeamTick = 0;
    this.score = 0;
    this.events = [];
    this.nextEventSequence = 1;
    this.zombies = new Map();
    this.nextZombieId = 1;
  }

  /**
   * Queue a movement or fire intent for consumption by a fixed simulation tick.
   * Aim and target-selection intents belong to later Sandbox tasks and are
   * rejected instead of being silently ignored.
   *
   * @param {unknown} raw
   * @returns {{ ok: true, status: 'queued', intent: Readonly<object> } | { ok: false, error: string }}
   */
  submitIntent(raw) {
    const result = validateSandboxIntent(raw);
    if (!result.ok) return result;
    if (result.value.expiresAt < this.clock.tick) return { ok: false, error: 'expired_intent' };

    if (MOVEMENT_TYPES.has(result.value.type)) this.pendingIntent = result.value;
    else if (result.value.type === SandboxIntentType.FIRE) this.pendingFireIntent = result.value;
    else return { ok: false, error: 'unsupported_intent_type' };
    return { ok: true, status: 'queued', intent: result.value };
  }

  /**
   * Spawn a data-only zombie entity. The optional object form is preferred;
   * positional arguments are supported for simple deterministic fixtures.
   *
   * @param {object|number} configOrX
   * @param {number} [z]
   * @param {number|object} [speedOrOptions]
   * @param {number} [health]
   * @returns {Readonly<object>}
   */
  spawnZombie(configOrX, z, speedOrOptions, health) {
    if (this.zombies.size >= R.SANDBOX_MAX_ZOMBIES) throw new RangeError('SandboxSimulation: zombie capacity reached');

    const config = typeof configOrX === 'object' && configOrX !== null
      ? configOrX
      : {
          x: configOrX,
          z,
          speed: typeof speedOrOptions === 'number' ? speedOrOptions : undefined,
          health,
        };
    const x = finiteOr(config.x, NaN);
    const positionZ = finiteOr(config.z, NaN);
    const zombieSpeed = positiveOrZero(config.speed, R.SANDBOX_ZOMBIE_DEFAULT_SPEED);
    const zombieHealth = positiveFinite(config.health, R.SANDBOX_ZOMBIE_DEFAULT_HEALTH);
    const radius = positiveFinite(config.radius, R.SANDBOX_ZOMBIE_DEFAULT_RADIUS);
    if (!Number.isFinite(x) || !Number.isFinite(positionZ)) throw new TypeError('SandboxSimulation: zombie position must be finite');
    if (!Number.isFinite(config.speed ?? zombieSpeed) || zombieSpeed < 0) throw new RangeError('SandboxSimulation: zombie speed must be >= 0');
    if (!Number.isFinite(config.health ?? zombieHealth) || zombieHealth <= 0) throw new RangeError('SandboxSimulation: zombie health must be > 0');
    if (!Number.isFinite(config.radius ?? radius) || radius <= 0) throw new RangeError('SandboxSimulation: zombie radius must be > 0');

    const zombie = {
      id: `zombie_${this.nextZombieId++}`,
      x,
      z: positionZ,
      speed: zombieSpeed,
      health: zombieHealth,
      maxHealth: zombieHealth,
      radius,
      contactCooldownUntil: 0,
    };
    this.zombies.set(zombie.id, zombie);
    return this._snapshotZombie(zombie);
  }

  /**
   * Apply generic damage for headless fixtures and future weapon systems.
   * Death removes the entity from the authoritative collection.
   */
  damageZombie(zombieId, damage) {
    const zombie = this.zombies.get(zombieId);
    if (!zombie) return { ok: false, error: 'unknown_zombie' };
    if (typeof damage !== 'number' || !Number.isFinite(damage) || damage <= 0) {
      return { ok: false, error: 'invalid_damage' };
    }
    const result = this._applyZombieDamage(zombie, damage, 'external');
    return { ok: true, killed: result.killed, zombie: result.zombie };
  }

  findNearestBeamTarget(angle) {
    if (typeof angle !== 'number' || !Number.isFinite(angle)) return null;
    const direction = { x: Math.sin(angle), z: -Math.cos(angle) };
    let nearest = null;
    let nearestForward = Infinity;
    for (const zombie of this.zombies.values()) {
      const dx = zombie.x - this.player.x;
      const dz = zombie.z - this.player.z;
      const forward = dx * direction.x + dz * direction.z;
      if (forward < 0 || forward > R.SANDBOX_BEAM_RANGE) continue;
      const lateral = Math.abs(dx * direction.z - dz * direction.x);
      if (lateral > R.SANDBOX_BEAM_HALF_WIDTH) continue;
      if (forward < nearestForward || (forward === nearestForward && zombie.id < nearest.id)) {
        nearest = zombie;
        nearestForward = forward;
      }
    }
    return nearest ? this._snapshotZombie(nearest) : null;
  }

  getEvents() {
    return structuredClone(this.events);
  }

  getScore() {
    return this.score;
  }

  getZombie(zombieId) {
    const zombie = this.zombies.get(zombieId);
    return zombie ? this._snapshotZombie(zombie) : null;
  }

  getZombies() {
    return [...this.zombies.values()].map(zombie => this._snapshotZombie(zombie));
  }

  /**
   * Advance the simulation by wall delta; movement itself advances only in
   * fixed ticks from SimClock. The wall clock is never read by this class.
   *
   * @param {number} wallDelta seconds since the previous update
   * @returns {number} number of fixed ticks consumed
   */
  update(wallDelta) {
    const safeDelta = Number.isFinite(wallDelta) ? wallDelta : 0;
    const steps = this.clock.advance(safeDelta);
    const firstTick = this.clock.tick - steps + 1;
    for (let index = 0; index < steps; index++) this._tick(firstTick + index);
    return steps;
  }

  /**
   * Convenience method for deterministic tests and headless fixtures.
   *
   * @param {number} ticks
   * @returns {number} number of fixed ticks consumed
   */
  step(ticks = 1) {
    if (!Number.isSafeInteger(ticks) || ticks < 0) return 0;
    let consumed = 0;
    for (let index = 0; index < ticks; index++) consumed += this.update(R.SANDBOX_TICK_DT);
    return consumed;
  }

  reset() {
    this.clock.reset();
    this.player.x = this.initialPlayer.x;
    this.player.z = this.initialPlayer.z;
    this.player.heading = this.initialPlayer.heading;
    this.player.health = this.player.maxHealth;
    this.player.energy = this.player.maxEnergy;
    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
    this.player.desiredMoveAngle = null;
    this.player.isMoving = false;
    this.pendingIntent = null;
    this.activeIntent = null;
    this.pendingFireIntent = null;
    this.activeFireIntent = null;
    this.nextBeamTick = 0;
    this.score = 0;
    this.events = [];
    this.nextEventSequence = 1;
    this.zombies.clear();
    this.nextZombieId = 1;
  }

  /**
   * Return a detached state snapshot. Callers cannot mutate simulation truth
   * through the returned object.
   */
  get currentTick() {
    return this.clock.tick;
  }

  getState() {
    return structuredClone({
      tick: this.clock.tick,
      time: this.clock.time,
      arenaRadius: this.arenaRadius,
      player: {
        x: this.player.x,
        z: this.player.z,
        heading: this.player.heading,
        health: this.player.health,
        maxHealth: this.player.maxHealth,
        energy: this.player.energy,
        maxEnergy: this.player.maxEnergy,
        velocity: { ...this.player.velocity },
        desiredMoveAngle: this.player.desiredMoveAngle,
        isMoving: this.player.isMoving,
        activeIntent: this.activeIntent,
      },
      zombies: this.getZombies(),
      score: this.score,
      events: this.getEvents(),
      beam: {
        activeIntent: this.activeFireIntent,
        nextAllowedTick: this.nextBeamTick,
      },
    });
  }

  getPlayerState() {
    return this.getState().player;
  }

  _tick(tick) {
    this._consumePendingIntent(tick);
    this._expireActiveIntent(tick);

    if (this.player.isMoving && this.activeIntent && this.activeIntent.type === SandboxIntentType.MOVE) {
      const angle = this.activeIntent.angle;
      this.player.desiredMoveAngle = angle;
      this.player.heading = turnTowards(
        this.player.heading,
        angle,
        R.SANDBOX_TURN_RATE * R.SANDBOX_TICK_DT,
      );

      const velocityX = Math.sin(angle) * R.SANDBOX_MOVE_SPEED;
      const velocityZ = -Math.cos(angle) * R.SANDBOX_MOVE_SPEED;
      this.player.velocity.x = velocityX;
      this.player.velocity.z = velocityZ;

      const next = clampToArena(
        this.player.x + velocityX * R.SANDBOX_TICK_DT,
        this.player.z + velocityZ * R.SANDBOX_TICK_DT,
        this.arenaRadius,
      );
      this.player.x = next.x;
      this.player.z = next.z;
    } else {
      this._stopVelocity();
    }

    this._updateZombies();
    this._resolveZombieContacts(tick);
    this._consumePendingFireIntent(tick);
    this._resolveBeam(tick);
  }

  _consumePendingFireIntent(tick) {
    const intent = this.pendingFireIntent;
    if (!intent || intent.createdAt > tick) return;
    this.pendingFireIntent = null;
    if (tick > intent.expiresAt) return;
    this.activeFireIntent = intent;
  }

  _resolveBeam(tick) {
    const intent = this.activeFireIntent;
    if (!intent || tick > intent.expiresAt) {
      if (intent && tick > intent.expiresAt) this.activeFireIntent = null;
      return;
    }
    if (tick < this.nextBeamTick || this.player.energy < R.SANDBOX_BEAM_ENERGY_COST) return;

    this.player.energy -= R.SANDBOX_BEAM_ENERGY_COST;
    this.nextBeamTick = tick + R.SANDBOX_BEAM_COOLDOWN_TICKS;
    this._emit('beam_fired', { angle: intent.angle, source: intent.source });
    const target = this.zombies.get(this.findNearestBeamTarget(intent.angle)?.id);
    if (!target) return;

    const result = this._applyZombieDamage(target, R.SANDBOX_BEAM_DAMAGE, 'beam');
    if (result.killed) {
      this.score += R.SANDBOX_BEAM_SCORE;
      this._emit('score_awarded', {
        amount: R.SANDBOX_BEAM_SCORE,
        reason: 'zombie_destroyed',
        targetId: target.id,
      });
    }
  }

  _applyZombieDamage(zombie, damage, source) {
    zombie.health = Math.max(0, zombie.health - damage);
    const killed = zombie.health <= 0;
    this._emit('zombie_damaged', { targetId: zombie.id, damage, source });
    const snapshot = this._snapshotZombie(zombie);
    if (killed) {
      this.zombies.delete(zombie.id);
      this._emit('zombie_destroyed', { targetId: zombie.id, source });
    }
    return { killed, zombie: snapshot };
  }

  _emit(type, data = {}) {
    this.events.push({
      sequence: this.nextEventSequence++,
      tick: this.clock.tick,
      type,
      ...data,
    });
  }

  _updateZombies() {
    for (const zombie of this.zombies.values()) {
      const dx = this.player.x - zombie.x;
      const dz = this.player.z - zombie.z;
      const distance = Math.hypot(dx, dz);
      const contactDistance = R.SANDBOX_PLAYER_RADIUS + zombie.radius;
      if (distance <= contactDistance || distance < Number.EPSILON || zombie.speed === 0) continue;

      const travel = Math.min(zombie.speed * R.SANDBOX_TICK_DT, distance - contactDistance);
      zombie.x += (dx / distance) * travel;
      zombie.z += (dz / distance) * travel;
    }
  }

  _resolveZombieContacts(tick) {
    if (this.player.health <= 0) return;
    for (const zombie of this.zombies.values()) {
      const distance = Math.hypot(this.player.x - zombie.x, this.player.z - zombie.z);
      const contactDistance = R.SANDBOX_PLAYER_RADIUS + zombie.radius;
      if (distance > contactDistance || tick < zombie.contactCooldownUntil) continue;

      this.player.health = Math.max(0, this.player.health - R.SANDBOX_ZOMBIE_CONTACT_DAMAGE);
      this._emit('player_damaged', {
        source: 'zombie_contact',
        attackerId: zombie.id,
        damage: R.SANDBOX_ZOMBIE_CONTACT_DAMAGE,
      });
      zombie.contactCooldownUntil = tick + R.SANDBOX_ZOMBIE_CONTACT_COOLDOWN_TICKS;
      if (this.player.health <= 0) break;
    }
  }

  _snapshotZombie(zombie) {
    return Object.freeze({
      id: zombie.id,
      x: zombie.x,
      z: zombie.z,
      speed: zombie.speed,
      health: zombie.health,
      maxHealth: zombie.maxHealth,
      radius: zombie.radius,
      contactCooldownUntil: zombie.contactCooldownUntil,
    });
  }

  _consumePendingIntent(tick) {
    const intent = this.pendingIntent;
    if (!intent || intent.createdAt > tick) return;
    this.pendingIntent = null;

    if (tick > intent.expiresAt) {
      this.activeIntent = null;
      this._stopMovement();
      return;
    }

    this.activeIntent = intent;
    if (intent.type === SandboxIntentType.STOP) this._stopMovement();
    else {
      this.player.isMoving = true;
      this.player.desiredMoveAngle = intent.angle;
    }
  }

  _expireActiveIntent(tick) {
    if (!this.activeIntent || tick <= this.activeIntent.expiresAt) return;
    this.activeIntent = null;
    this._stopMovement();
  }

  _stopMovement() {
    this.player.isMoving = false;
    this.player.desiredMoveAngle = null;
    this._stopVelocity();
  }

  _stopVelocity() {
    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
  }
}

function positiveFinite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveOrZero(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function finiteOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampToArena(x, z, radius) {
  const distance = Math.hypot(x, z);
  if (distance <= radius || distance < Number.EPSILON) return { x, z };
  return { x: (x / distance) * radius, z: (z / distance) * radius };
}

function turnTowards(current, target, maxDelta) {
  const diff = shortestAngleDelta(current, target);
  if (Math.abs(diff) <= maxDelta) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * maxDelta);
}

function shortestAngleDelta(current, target) {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return diff;
}

function normalizeAngle(angle) {
  const normalized = angle % TAU;
  if (Object.is(normalized, -0) || normalized === 0) return 0;
  return normalized < 0 ? normalized + TAU : normalized;
}
