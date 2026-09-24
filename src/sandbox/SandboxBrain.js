// ─── Local reflex layer + Jev strategic directive receiver ──────────
// Runs every tick locally. Handles immediate survival reflexes (dodge
// when zombie too close, auto-fire nearest). Strategic decisions come
// from Jev via setDirective(). No rendering, network, or I/O.

import {
  createSandboxIntent,
  SandboxIntentSource,
  SandboxIntentType,
} from './SandboxIntent.js';
import * as R from './SandboxRules.js';

// ponytail: hardcoded thresholds, extract to SandboxRules when tuning matters
const SENSOR_RADIUS = R.SANDBOX_ARENA_RADIUS;
const AUTO_FIRE_INTERVAL = 18;
const AUTO_FIRE_DURATION = 6;
const DODGE_DISTANCE = 2.5;
const DODGE_DURATION = 24;
const REFLEX_PRIORITY = 0.6;

/**
 * Valid Jev strategic directives. The brain maps these to local behavior.
 * Jev classifies one of these labels; the brain executes it locally.
 */
export const BrainDirective = Object.freeze({
  PATROL: 'patrol',
  ADVANCE: 'advance',
  RETREAT: 'retreat',
  HOLD_AND_FIRE: 'hold_and_fire',
  KITE: 'kite',
  FOCUS_NEAREST: 'focus_nearest',
  FOCUS_LARGEST: 'focus_largest',
  FLANK: 'flank',
  IDLE: 'idle',
});

const VALID_DIRECTIVES = new Set(Object.values(BrainDirective));

export class SandboxBrain {
  constructor() {
    this.directive = BrainDirective.PATROL;
    this.nextFireTick = 0;
    this.lastTargetId = null;
  }

  /**
   * Apply a strategic directive from Jev. Validated label only.
   * @param {string} directive  One of BrainDirective values.
   */
  setDirective(directive) {
    if (VALID_DIRECTIVES.has(directive)) this.directive = directive;
  }

  /**
   * Local reflex tick. Returns an array of intents (0-2) to submit.
   * Called every simulation tick by SandboxSimulation or its owner.
   * @param {{ player: object, zombies: Map|Array }} state
   * @param {number} tick
   * @returns {Array<object>}  Validated SandboxIntent objects.
   */
  tick(state, tick) {
    const intents = [];
    const player = state.player;
    const zombies = state.zombies instanceof Map
      ? [...state.zombies.values()]
      : Array.isArray(state.zombies) ? state.zombies : [];

    const nearest = findNearest(player, zombies, SENSOR_RADIUS);
    this.lastTargetId = nearest?.id ?? null;

    // ── Reflex: dodge if zombie is dangerously close ──
    if (nearest) {
      const dist = Math.hypot(nearest.x - player.x, nearest.z - player.z);
      if (dist < DODGE_DISTANCE && this.directive !== BrainDirective.ADVANCE) {
        const away = angleTo(nearest, player);
        intents.push(createSandboxIntent({
          type: SandboxIntentType.MOVE,
          source: SandboxIntentSource.AI,
          priority: REFLEX_PRIORITY + 0.2,
          createdAt: tick,
          expiresAt: tick + DODGE_DURATION,
          angle: away,
        }));
      }
    }

    // ── Strategic behavior from Jev directive ──
    switch (this.directive) {
      case BrainDirective.HOLD_AND_FIRE:
      case BrainDirective.FOCUS_NEAREST:
      case BrainDirective.FOCUS_LARGEST: {
        const target = this.directive === BrainDirective.FOCUS_LARGEST
          ? findLargest(zombies) || nearest
          : nearest;
        if (target && tick >= this.nextFireTick) {
          intents.push(makeFireIntent(player, target, tick));
          this.nextFireTick = tick + AUTO_FIRE_INTERVAL;
        }
        break;
      }
      case BrainDirective.RETREAT: {
        if (nearest) {
          intents.push(createSandboxIntent({
            type: SandboxIntentType.MOVE,
            source: SandboxIntentSource.AI,
            priority: REFLEX_PRIORITY,
            createdAt: tick,
            expiresAt: tick + 30,
            angle: angleTo(nearest, player),
          }));
        }
        if (nearest && tick >= this.nextFireTick) {
          intents.push(makeFireIntent(player, nearest, tick));
          this.nextFireTick = tick + AUTO_FIRE_INTERVAL;
        }
        break;
      }
      case BrainDirective.KITE: {
        if (nearest) {
          const dist = Math.hypot(nearest.x - player.x, nearest.z - player.z);
          if (dist < 6) {
            intents.push(createSandboxIntent({
              type: SandboxIntentType.MOVE,
              source: SandboxIntentSource.AI,
              priority: REFLEX_PRIORITY,
              createdAt: tick,
              expiresAt: tick + 20,
              angle: angleTo(nearest, player),
            }));
          }
          if (tick >= this.nextFireTick) {
            intents.push(makeFireIntent(player, nearest, tick));
            this.nextFireTick = tick + AUTO_FIRE_INTERVAL;
          }
        }
        break;
      }
      case BrainDirective.ADVANCE: {
        if (nearest) {
          intents.push(createSandboxIntent({
            type: SandboxIntentType.MOVE,
            source: SandboxIntentSource.AI,
            priority: REFLEX_PRIORITY,
            createdAt: tick,
            expiresAt: tick + 30,
            angle: angleTo(player, nearest),
          }));
          if (tick >= this.nextFireTick) {
            intents.push(makeFireIntent(player, nearest, tick));
            this.nextFireTick = tick + AUTO_FIRE_INTERVAL;
          }
        }
        break;
      }
      case BrainDirective.PATROL:
      default: {
        if (nearest && tick >= this.nextFireTick) {
          intents.push(makeFireIntent(player, nearest, tick));
          this.nextFireTick = tick + AUTO_FIRE_INTERVAL;
        }
        break;
      }
    }

    return intents;
  }

  reset() {
    this.directive = BrainDirective.PATROL;
    this.nextFireTick = 0;
    this.lastTargetId = null;
  }
}

function findNearest(player, zombies, radius) {
  const r2 = radius * radius;
  let best = null;
  let bestDist = Infinity;
  for (const z of zombies) {
    const d2 = (z.x - player.x) ** 2 + (z.z - player.z) ** 2;
    if (d2 > r2) continue;
    if (d2 < bestDist || (d2 === bestDist && z.id < best.id)) {
      best = z;
      bestDist = d2;
    }
  }
  return best;
}

function findLargest(zombies) {
  let best = null;
  for (const z of zombies) {
    if (!best || z.maxHealth > best.maxHealth) best = z;
  }
  return best;
}

function angleTo(from, to) {
  return normalizeAngle(Math.atan2(to.x - from.x, -(to.z - from.z)));
}

function makeFireIntent(player, target, tick) {
  return createSandboxIntent({
    type: SandboxIntentType.FIRE,
    source: SandboxIntentSource.AI,
    priority: REFLEX_PRIORITY,
    createdAt: tick,
    expiresAt: tick + AUTO_FIRE_DURATION,
    angle: angleTo(player, target),
  });
}

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  const n = angle % tau;
  return n < 0 ? n + tau : n;
}
