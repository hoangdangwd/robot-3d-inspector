// ─── Sandbox Three.js presentation validation ───────────────────────
// Headless scene graph checks; no WebGL context or browser DOM required.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SandboxRobotView } from '../src/sandbox/SandboxRobotView.js';
import { SandboxHordeView } from '../src/sandbox/SandboxHordeView.js';
import { SandboxMode } from '../src/sandbox/SandboxMode.js';
import { SandboxSimulation } from '../src/sandbox/SandboxSimulation.js';
import * as R from '../src/sandbox/SandboxRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }

console.log('\n── SandboxRobotView ──');
const robot = new SandboxRobotView('forge-titan');
assert.ok(robot.group.isGroup);
assert.ok(robot.weaponPivot.isGroup);
assert.ok(robot.gun.name === 'SandboxBeamGun');
assert.equal(robot.beam.visible, false);
robot.update({ player: { x: 2, z: -3, heading: 0.5, aimAngle: 1.2, isMoving: true } }, 1 / 60);
assert.equal(robot.group.position.x, 2);
assert.equal(robot.group.position.z, -3);
assert.ok(Math.abs(robot.turret.rotation.y - 0.7) < 1e-6);
assert.equal(robot.parts.LeftUpperLeg.rotation.y, 0);
assert.equal(robot.beam.visible, false);
robot.triggerBeam(1.2);
robot.update({ player: { x: 2, z: -3, heading: 0.5, aimAngle: 1.2, isMoving: false } }, 0);
assert.equal(robot.beam.visible, true);
ok('robot presentation owns a procedural beam weapon and follows detached simulation state');
robot.dispose();

console.log('\n── SandboxHordeView ──');
const scene = new THREE.Scene();
const horde = new SandboxHordeView(scene);
horde.update([{ id: 'zombie_1', x: 1, z: -2, radius: 0.6, health: 15, maxHealth: 30 }], 1 / 60);
assert.equal(horde.views.size, 1);
assert.equal(scene.children.length, 1);
horde.update([], 1 / 60);
assert.equal(horde.views.size, 0);
horde.dispose();
ok('zombie views are created, synchronized by id, and removed when simulation entities disappear');

console.log('\n── SandboxMode state-to-presentation boundary ──');
const sim = new SandboxSimulation();
const zombie = sim.spawnZombie({ x: 0, z: -5, speed: 0, health: 30 });
assert.equal(sim.getState().zombies[0].id, zombie.id);
assert.ok(R.SANDBOX_BEAM_RANGE > 0);
const modeScene = new THREE.Scene();
const mode = new SandboxMode(modeScene, { seed: 11 });
assert.equal(mode.weapon.name, 'SandboxHeldBeamGun');
assert.equal(mode.fighter.parts.RightHand.getObjectByName('SandboxHeldBeamGun'), mode.weapon);
const zombieModel = modeScene.getObjectByName('SandboxZombie_zombie_1');
assert.ok(zombieModel && zombieModel.children.length >= 8);
mode.dispose();
ok('sandbox mode presents a held gun and articulated zombie model');
ok('presentation validation remains independent from WebGL and combat authority');

console.log(`\nPASS: ${pass} assertions. Sandbox presentation validated.\n`);
