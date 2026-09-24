// ─── Sandbox movement rules ─────────────────────────────────────────
// Centralized tuning for the pure Sandbox simulation. No Three.js or I/O.

export const SANDBOX_TICK_RATE = 60;
export const SANDBOX_TICK_DT = 1 / SANDBOX_TICK_RATE;
export const SANDBOX_MAX_CATCH_UP = 8;
export const SANDBOX_ARENA_RADIUS = 40;
export const SANDBOX_MOVE_SPEED = 5.5;
export const SANDBOX_TURN_RATE = 8;

// Horde/contact tuning is kept here so later weapon and difficulty tasks can
// rebalance the Sandbox without scattering magic numbers through simulation.
export const SANDBOX_MAX_PLAYER_HEALTH = 100;
export const SANDBOX_PLAYER_RADIUS = 0.4;
export const SANDBOX_ZOMBIE_DEFAULT_SPEED = 1.8;
export const SANDBOX_ZOMBIE_DEFAULT_HEALTH = 30;
export const SANDBOX_ZOMBIE_DEFAULT_RADIUS = 0.6;
export const SANDBOX_ZOMBIE_CONTACT_DAMAGE = 10;
export const SANDBOX_ZOMBIE_CONTACT_COOLDOWN_TICKS = 30;
export const SANDBOX_MAX_ZOMBIES = 128;
export const SANDBOX_MAX_PLAYER_ENERGY = 100;
export const SANDBOX_BEAM_RANGE = 12;
export const SANDBOX_BEAM_HALF_WIDTH = 0.75;
export const SANDBOX_BEAM_DAMAGE = 30;
export const SANDBOX_BEAM_COOLDOWN_TICKS = 12;
export const SANDBOX_BEAM_ENERGY_COST = 10;
export const SANDBOX_BEAM_SCORE = 100;
export const SANDBOX_GATE_RADIUS = 4;
export const SANDBOX_GATE_X = 0;
export const SANDBOX_GATE_Z = -SANDBOX_ARENA_RADIUS * 0.75;
export const SANDBOX_PLAYER_ZONE_RADIUS = 6;
export const SANDBOX_RULE_EVENT_COOLDOWN_TICKS = 60;

export const SANDBOX_RULES = Object.freeze({
  tickRate: SANDBOX_TICK_RATE,
  tickDt: SANDBOX_TICK_DT,
  maxCatchUp: SANDBOX_MAX_CATCH_UP,
  arenaRadius: SANDBOX_ARENA_RADIUS,
  moveSpeed: SANDBOX_MOVE_SPEED,
  turnRate: SANDBOX_TURN_RATE,
  maxPlayerHealth: SANDBOX_MAX_PLAYER_HEALTH,
  playerRadius: SANDBOX_PLAYER_RADIUS,
  zombieDefaultSpeed: SANDBOX_ZOMBIE_DEFAULT_SPEED,
  zombieDefaultHealth: SANDBOX_ZOMBIE_DEFAULT_HEALTH,
  zombieDefaultRadius: SANDBOX_ZOMBIE_DEFAULT_RADIUS,
  zombieContactDamage: SANDBOX_ZOMBIE_CONTACT_DAMAGE,
  zombieContactCooldownTicks: SANDBOX_ZOMBIE_CONTACT_COOLDOWN_TICKS,
  maxZombies: SANDBOX_MAX_ZOMBIES,
  maxPlayerEnergy: SANDBOX_MAX_PLAYER_ENERGY,
  beamRange: SANDBOX_BEAM_RANGE,
  beamHalfWidth: SANDBOX_BEAM_HALF_WIDTH,
  beamDamage: SANDBOX_BEAM_DAMAGE,
  beamCooldownTicks: SANDBOX_BEAM_COOLDOWN_TICKS,
  beamEnergyCost: SANDBOX_BEAM_ENERGY_COST,
  beamScore: SANDBOX_BEAM_SCORE,
  gateRadius: SANDBOX_GATE_RADIUS,
  gateX: SANDBOX_GATE_X,
  gateZ: SANDBOX_GATE_Z,
  playerZoneRadius: SANDBOX_PLAYER_ZONE_RADIUS,
  ruleEventCooldownTicks: SANDBOX_RULE_EVENT_COOLDOWN_TICKS,
});
