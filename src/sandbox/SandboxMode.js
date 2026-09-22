// ─── Three.js presentation adapter for Zombie Survival Sandbox ─────
// SandboxSimulation owns position, health, energy, zombie damage and score.
// This module only presents that state and forwards validated intents.

import * as THREE from 'three';
import { Fighter } from '../combat/Fighter.js';
import { RobotFactory } from '../robots/RobotFactory.js';
import { getRobotDefinition } from '../robots/robotCatalog.js';
import { SandboxSimulation } from './SandboxSimulation.js';
import * as R from './SandboxRules.js';

export class SandboxMode {
  constructor(scene, { defId = 'forge-titan', seed = 2026, onStateChange = null } = {}) {
    this.scene = scene;
    this.onStateChange = onStateChange || (() => {});
    this.sim = new SandboxSimulation({ seed, arenaRadius: R.SANDBOX_ARENA_RADIUS });
    this.definition = getRobotDefinition(defId);
    this.fighter = Fighter.fromFactory(this.definition, RobotFactory.create(this.definition));
    this.fighter.setLoop(true);
    this.fighter.playAnimation('idle', { crossFade: 0 });
    this.scene.add(this.fighter.group);

    this.stage = new THREE.Group();
    this.stage.name = 'SandboxStage';
    this.scene.add(this.stage);
    this._buildStage();

    this.zombieViews = new Map();
    this.effects = [];
    this.eventCursor = 0;
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
    beacon.position.set(0, 1.75, 0);
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

  reset() {
    this.sim.reset();
    this.zombieViews.forEach(view => this._disposeZombieView(view));
    this.zombieViews.clear();
    this.effects.forEach(effect => this._disposeEffect(effect));
    this.effects = [];
    this.eventCursor = 0;
    this._spawnInitialHorde();
    this.fighter.playAnimation('idle', { crossFade: 0 });
    this._sync();
  }

  update(delta) {
    this.sim.update(delta);
    this._sync();
    this._updateEffects(delta);
    this.fighter.update(delta);
    this.onStateChange(this.getState());
  }

  getState() {
    return this.sim.getState();
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

  _createZombieView(zombie) {
    const group = new THREE.Group();
    group.name = `SandboxZombie_${zombie.id}`;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(zombie.radius * 0.52, zombie.radius * 1.2, 5, 10),
      new THREE.MeshStandardMaterial({ color: 0x6e9b67, roughness: 0.85, metalness: 0.05 }),
    );
    body.position.y = zombie.radius * 0.9;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(zombie.radius * 0.48, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x9abb73, roughness: 0.8 }),
    );
    head.position.y = zombie.radius * 2.05;
    head.castShadow = true;
    group.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a44 });
    for (const x of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
      eye.position.set(x, zombie.radius * 2.08, zombie.radius * 0.40);
      group.add(eye);
    }

    const health = new THREE.Mesh(
      new THREE.BoxGeometry(zombie.radius * 1.7, 0.045, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xff6b4d }),
    );
    health.position.set(0, zombie.radius * 2.65, 0);
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
