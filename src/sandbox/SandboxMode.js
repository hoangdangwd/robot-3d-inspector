// ─── Three.js presentation adapter for Zombie Survival Sandbox ─────
// SandboxSimulation owns position, health, energy, zombie damage and score.
// SandboxBrain provides local reflex behavior (dodge, auto-fire).
// This module presents state, forwards Jev decisions, and runs brain ticks.

import * as THREE from 'three';
import { Fighter } from '../combat/Fighter.js';
import { RobotFactory } from '../robots/RobotFactory.js';
import { getRobotDefinition } from '../robots/robotCatalog.js';
import { SandboxSimulation } from './SandboxSimulation.js';
import { SandboxBrain } from './SandboxBrain.js';
import * as R from './SandboxRules.js';

export class SandboxMode {
  constructor(scene, { defId = 'forge-titan', seed = 2026, onStateChange = null, onRuleEvent = null } = {}) {
    this.scene = scene;
    this.onStateChange = onStateChange || (() => {});
    this.onRuleEvent = onRuleEvent || (() => {});
    this.sim = new SandboxSimulation({ seed, arenaRadius: R.SANDBOX_ARENA_RADIUS });
    this.brain = new SandboxBrain();
    this.definition = getRobotDefinition(defId);
    this.fighter = Fighter.fromFactory(this.definition, RobotFactory.create(this.definition));
    this.fighter.setLoop(true);
    this.fighter.playAnimation('idle', { crossFade: 0 });
    this._createHeldWeapon();
    this.scene.add(this.fighter.group);

    this.stage = new THREE.Group();
    this.stage.name = 'SandboxStage';
    this.scene.add(this.stage);
    this._buildStage();

    this.zombieViews = new Map();
    this.effects = [];
    this.eventCursor = 0;
    this._lastBrainTick = -1;
    this._insideGate = new Set();
    this._insidePlayer = new Set();
    this._eventSerial = 0;
    this._nextRuleEventTick = 0;
    this._spawnInitialHorde();
    this._sync();
  }

  _buildStage() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(R.SANDBOX_ARENA_RADIUS, 96),
      new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.92, metalness: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.stage.add(ground);

    const grid = new THREE.GridHelper(R.SANDBOX_ARENA_RADIUS * 2, 32, 0x284456, 0x172833);
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    this.stage.add(grid);

    const boundary = new THREE.Mesh(
      new THREE.RingGeometry(R.SANDBOX_ARENA_RADIUS - 0.08, R.SANDBOX_ARENA_RADIUS, 96),
      new THREE.MeshBasicMaterial({ color: 0x3ac7ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.02;
    this.stage.add(boundary);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x3ac7ff, transparent: true, opacity: 0.24 }),
    );
    beacon.position.set(R.SANDBOX_GATE_X, 1.75, R.SANDBOX_GATE_Z);
    this.stage.add(beacon);
  }

  _spawnInitialHorde() {
    const spawnRadius = R.SANDBOX_ARENA_RADIUS * 0.82;
    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * Math.PI * 2;
      this.sim.spawnZombie({
        x: Math.sin(angle) * spawnRadius,
        z: Math.cos(angle) * spawnRadius,
        speed: R.SANDBOX_ZOMBIE_DEFAULT_SPEED + (index % 3) * 0.12,
        health: R.SANDBOX_ZOMBIE_DEFAULT_HEALTH,
      });
    }
  }

  submitIntent(raw) {
    return this.sim.submitIntent(raw);
  }

  submitPlan(plan) {
    return this.sim.submitPlan(plan);
  }

  /** Apply a Jev strategic directive to the local brain. */
  setDirective(directive) {
    this.brain.setDirective(directive);
  }

  reset() {
    this.sim.reset();
    this.brain.reset();
    this._lastBrainTick = -1;
    this.zombieViews.forEach(view => this._disposeZombieView(view));
    this.zombieViews.clear();
    this.effects.forEach(effect => this._disposeEffect(effect));
    this.effects = [];
    this.eventCursor = 0;
    this._spawnInitialHorde();
    this._insideGate.clear();
    this._insidePlayer.clear();
    this._nextRuleEventTick = 0;
    this.fighter.playAnimation('idle', { crossFade: 0 });
    this._sync();
  }

  update(delta) {
    this.sim.update(delta);

    // Run brain reflex every 6 sim ticks (~100ms at 60Hz)
    const tick = this.sim.clock.tick;
    if (tick - this._lastBrainTick >= 6) {
      this._lastBrainTick = tick;
      const state = { player: this.sim.player, zombies: this.sim.zombies };
      const intents = this.brain.tick(state, tick);
      for (const intent of intents) {
        this.sim.submitIntent(intent);
      }
      this._emitZoneEvent(tick);
    }

    this._sync();
    this._updateEffects(delta);
    this.fighter.update(delta);
    this.onStateChange(this.getState());
  }

  getState() {
    return this.sim.getState();
  }

  /** Compact game state for Jev context. */
  getJevGameState() {
    const state = this.sim.getState();
    const nearest = this._nearestZombieDistance(state);
    return {
      playerHealth: state.player.health,
      playerEnergy: state.player.energy,
      zombieCount: state.zombies.length,
      nearestZombieDistance: nearest,
      score: state.score,
      directive: this.brain.directive,
      gate: { x: R.SANDBOX_GATE_X, z: R.SANDBOX_GATE_Z, radius: R.SANDBOX_GATE_RADIUS },
      gateDistance: this._gateDistance(state),
      playerZone: { x: state.player.x, z: state.player.z, radius: R.SANDBOX_PLAYER_ZONE_RADIUS },
    };
  }

  _gateDistance(state) {
    let min = Infinity;
    for (const zombie of state.zombies) {
      const distance = Math.hypot(zombie.x - R.SANDBOX_GATE_X, zombie.z - R.SANDBOX_GATE_Z);
      if (distance < min) min = distance;
    }
    return min === Infinity ? -1 : Math.round(min * 10) / 10;
  }

  _emitZoneEvent(tick) {
    if (tick < this._nextRuleEventTick) return;
    const enteredGate = [];
    const enteredPlayer = [];
    const insideGate = new Set();
    const insidePlayer = new Set();
    for (const zombie of this.sim.zombies.values()) {
      const gateDistance = Math.hypot(zombie.x - R.SANDBOX_GATE_X, zombie.z - R.SANDBOX_GATE_Z);
      if (gateDistance <= R.SANDBOX_GATE_RADIUS) {
        insideGate.add(zombie.id);
        if (!this._insideGate.has(zombie.id)) enteredGate.push({ zombieId: zombie.id, distance: Math.round(gateDistance * 10) / 10 });
      }
      const playerDistance = Math.hypot(zombie.x - this.sim.player.x, zombie.z - this.sim.player.z);
      if (playerDistance <= R.SANDBOX_PLAYER_ZONE_RADIUS) {
        insidePlayer.add(zombie.id);
        if (!this._insidePlayer.has(zombie.id)) enteredPlayer.push({ zombieId: zombie.id, distance: Math.round(playerDistance * 10) / 10 });
      }
    }
    this._insideGate = insideGate;
    this._insidePlayer = insidePlayer;
    const zoneId = enteredGate.length ? 'gate' : 'player';
    const entered = zoneId === 'gate' ? enteredGate : enteredPlayer;
    if (!entered.length) return;
    this._nextRuleEventTick = tick + R.SANDBOX_RULE_EVENT_COOLDOWN_TICKS;
    this._eventSerial += 1;
    this.onRuleEvent({ type: 'zombie_entered_zone', zoneId, eventId: 'zone_' + tick + '_' + this._eventSerial, tick, entries: entered.slice(0, 8) });
  }

  _nearestZombieDistance(state) {
    let min = Infinity;
    for (const z of state.zombies) {
      const d = Math.hypot(z.x - state.player.x, z.z - state.player.z);
      if (d < min) min = d;
    }
    return min === Infinity ? -1 : Math.round(min * 10) / 10;
  }

  _sync() {
    const state = this.sim.getState();
    const player = state.player;
    this.fighter.group.position.set(player.x, 0, player.z);
    this.fighter.group.rotation.y = player.heading;

    const animation = player.isMoving ? 'walk_forward' : 'idle';
    if (this.fighter.currentMeta?.id !== animation) this.fighter.playAnimation(animation, { crossFade: 0.12 });

    const activeIds = new Set();
    state.zombies.forEach(zombie => {
      activeIds.add(zombie.id);
      let view = this.zombieViews.get(zombie.id);
      if (!view) {
        view = this._createZombieView(zombie);
        this.zombieViews.set(zombie.id, view);
        this.scene.add(view.group);
      }
      view.group.position.set(zombie.x, 0, zombie.z);
      view.group.lookAt(player.x, 0.7, player.z);
      view.health.scale.x = Math.max(0.05, zombie.health / zombie.maxHealth);
    });

    for (const [id, view] of this.zombieViews) {
      if (!activeIds.has(id)) {
        this._disposeZombieView(view);
        this.zombieViews.delete(id);
      }
    }

    const events = state.events;
    for (const event of events) {
      if (event.sequence <= this.eventCursor) continue;
      if (event.type === 'beam_fired') this._createBeamEffect(event.angle, player);
      this.eventCursor = Math.max(this.eventCursor, event.sequence);
    }
  }

  _createHeldWeapon() {
    const hand = this.fighter.parts.RightHand;
    const { primary, secondary, accent, trim, light, dark } = this.fighter.materials;
    const gun = new THREE.Group();
    gun.name = 'SandboxHeldBeamGun';
    gun.position.set(0, -0.16, 0.20);
    gun.rotation.x = 0.08;
    hand.add(gun);

    const add = (geometry, material, position, rotation = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      gun.add(mesh);
      return mesh;
    };

    add(new THREE.BoxGeometry(0.22, 0.16, 0.42), primary, [0, 0, 0.22]);
    add(new THREE.BoxGeometry(0.16, 0.12, 0.28), secondary, [0, 0.02, 0.55]);
    add(new THREE.BoxGeometry(0.12, 0.28, 0.14), dark, [0, -0.16, 0.12], [0.08, 0, 0]);
    add(new THREE.BoxGeometry(0.20, 0.05, 0.28), accent, [0, 0.11, 0.30]);
    add(new THREE.CylinderGeometry(0.055, 0.07, 0.44, 12), trim, [0, 0, 0.84], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.085, 0.014, 6, 16), light, [0, 0, 1.06], [Math.PI / 2, 0, 0]);
    const emitter = add(new THREE.SphereGeometry(0.05, 10, 8), light, [0, 0, 1.08]);
    emitter.name = 'SandboxGunEmitter';
    gun.userData.emitter = emitter;
    this.weapon = gun;
    return gun;
  }

  _createZombieView(zombie) {
    const group = new THREE.Group();
    group.name = `SandboxZombie_${zombie.id}`;
    const skin = new THREE.MeshStandardMaterial({ color: 0x8daa6d, roughness: 0.86, metalness: 0.02 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x263c35, roughness: 0.95, metalness: 0.02 });
    const wound = new THREE.MeshStandardMaterial({ color: 0x6b2e2e, roughness: 0.9 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a44 });
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x160f12 });
    const r = zombie.radius;

    const add = (geometry, material, position, rotation = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    add(new THREE.CapsuleGeometry(r * 0.52, r * 1.2, 5, 10), shirt, [0, r * 0.9, 0]);
    add(new THREE.SphereGeometry(r * 0.48, 12, 8), skin, [0, r * 2.05, 0]);
    add(new THREE.BoxGeometry(r * 0.58, r * 0.23, r * 0.50), skin, [0, r * 1.84, -r * 0.30], [0.12, 0, 0]);

    for (const x of [-r * 0.20, r * 0.20]) {
      add(new THREE.SphereGeometry(r * 0.075, 8, 6), eyeMat, [x, r * 2.10, -r * 0.42]);
    }
    add(new THREE.BoxGeometry(r * 0.42, r * 0.035, r * 0.025), mouthMat, [0, r * 1.91, -r * 0.47]);
    add(new THREE.BoxGeometry(r * 0.12, r * 0.06, r * 0.03), wound, [r * 0.22, r * 1.98, -r * 0.46], [0, 0, -0.35]);

    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(r * 0.12, r * 0.15, r * 1.15, 8), skin,
        [side * r * 0.68, r * 1.16, -r * 0.10], [0.45, 0, side * 0.42]);
      add(new THREE.CapsuleGeometry(r * 0.17, r * 0.48, 4, 8), shirt,
        [side * r * 0.22, r * 0.31, 0], [0, 0, 0]);
    }

    const health = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.7, 0.045, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xff6b4d }),
    );
    health.position.set(0, r * 2.65, 0);
    group.add(health);
    return { group, health };
  }

  _createBeamEffect(angle, player) {
    const direction = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
    const length = R.SANDBOX_BEAM_RANGE;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.18, length, 12),
      new THREE.MeshBasicMaterial({ color: 0x67e8ff, transparent: true, opacity: 0.9 }),
    );
    beam.position.set(player.x, 1.15, player.z).addScaledVector(direction, length / 2);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.scene.add(beam);
    this.effects.push({ mesh: beam, life: 0.12 });
  }

  _updateEffects(delta) {
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      effect.life -= delta;
      effect.mesh.material.opacity = Math.max(0, effect.life / 0.12) * 0.9;
      if (effect.life <= 0) {
        this._disposeEffect(effect);
        this.effects.splice(index, 1);
      }
    }
  }

  _disposeZombieView(view) {
    this.scene.remove(view.group);
    view.group.traverse(object => {
      object.geometry?.dispose();
      if (object.material) object.material.dispose();
    });
  }

  _disposeEffect(effect) {
    this.scene.remove(effect.mesh);
    effect.mesh.geometry.dispose();
    effect.mesh.material.dispose();
  }

  dispose() {
    this.fighter.dispose();
    this.scene.remove(this.fighter.group);
    this.zombieViews.forEach(view => this._disposeZombieView(view));
    this.zombieViews.clear();
    this.effects.forEach(effect => this._disposeEffect(effect));
    this.effects = [];
    this.stage.traverse(object => {
      object.geometry?.dispose();
      if (object.material) object.material.dispose();
    });
    this.scene.remove(this.stage);
  }
}
