// ─── Sandbox robot presentation adapter ────────────────────────────
// Reads SandboxSimulation snapshots. It never owns position, health or damage.

import * as THREE from 'three';
import { RobotFactory } from '../robots/RobotFactory.js';
import { getRobotDefinition } from '../robots/robotCatalog.js';

const TAU = Math.PI * 2;
const BEAM_LENGTH = 12;

export class SandboxRobotView {
  constructor(definitionOrId = 'forge-titan') {
    this.definition = typeof definitionOrId === 'string'
      ? getRobotDefinition(definitionOrId)
      : definitionOrId;
    const assembly = RobotFactory.create(this.definition);
    this.group = assembly.root;
    this.group.name = `SandboxRobot_${this.definition.id}`;
    this.parts = assembly.parts;
    this.materials = assembly.materials;
    this.elapsed = 0;
    this.recoil = 0;
    this.beamTimer = 0;
    this.beamAngle = 0;
    this._owned = [];

    this.turret = new THREE.Group();
    this.turret.name = 'SandboxUpperBodyTurret';
    this.parts.UpperTorso.add(this.turret);
    this.turret.attach(this.parts.Head);
    this.turret.attach(this.parts.LeftUpperArm);
    this.turret.attach(this.parts.RightUpperArm);
    this.weaponPivot = new THREE.Group();
    this.weaponPivot.name = 'SandboxWeaponAimPivot';
    this.weaponPivot.position.set(0, this.definition.proportions.upperTorsoHeight * 0.45, this.definition.proportions.torsoDepth * 0.7);
    this.turret.add(this.weaponPivot);
    this._buildWeapon();
  }

  _buildWeapon() {
    const primary = this.materials.primary;
    const secondary = this.materials.secondary;
    const accent = this.materials.accent;
    const light = this.materials.light;
    const gun = new THREE.Group();
    gun.name = 'SandboxBeamGun';
    this.weaponPivot.add(gun);
    this.gun = gun;

    this._addMesh(gun, new THREE.BoxGeometry(0.26, 0.18, 0.48), primary, [0, 0, 0.28]);
    this._addMesh(gun, new THREE.BoxGeometry(0.16, 0.12, 0.32), secondary, [0, 0.01, 0.56]);
    this._addMesh(gun, new THREE.CylinderGeometry(0.075, 0.075, 0.46, 12), accent, [0, 0, 0.78], [Math.PI / 2, 0, 0]);
    this._addMesh(gun, new THREE.TorusGeometry(0.105, 0.018, 6, 16), light, [0, 0, 0.98], [Math.PI / 2, 0, 0]);
    const emitter = this._addMesh(gun, new THREE.SphereGeometry(0.07, 12, 8), light, [0, 0, 1.02]);
    emitter.material = emitter.material.clone();
    emitter.material.emissive = emitter.material.color;
    emitter.material.emissiveIntensity = 2.5;
    this.emitter = emitter;

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: this.definition.colors.light,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 8), beamMaterial);
    beam.name = 'SandboxBeamVisual';
    beam.rotation.x = Math.PI / 2;
    beam.position.z = 1.02 + BEAM_LENGTH / 2;
    beam.scale.y = BEAM_LENGTH;
    beam.visible = false;
    gun.add(beam);
    this.beam = beam;
    this._owned.push(beam.geometry, beam.material);
  }

  _addMesh(parent, geometry, material, position, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    this._owned.push(geometry);
    return mesh;
  }

  update(state, delta, events = []) {
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.elapsed += safeDelta;
    this.recoil = Math.max(0, this.recoil - safeDelta * 7);
    this.beamTimer = Math.max(0, this.beamTimer - safeDelta);

    const player = state.player;
    this.group.position.set(player.x, 0, player.z);
    this.group.rotation.y = normalizeAngle(player.heading + Math.PI);
    const aim = player.aimAngle ?? player.heading;
    const aimDelta = shortestAngleDelta(player.heading, aim);
    this.turret.rotation.y = aimDelta;
    this.parts.UpperTorso.rotation.y = 0;
    this.weaponPivot.rotation.y = 0;
    this.gun.position.z = -this.recoil * 0.08;
    this.beam.visible = this.beamTimer > 0;
    this.emitter.scale.setScalar(this.beamTimer > 0 ? 1.35 : 1);

    const stride = player.isMoving ? Math.sin(this.elapsed * 13) * 0.22 : 0;
    this.parts.LeftUpperLeg.rotation.x = stride;
    this.parts.RightUpperLeg.rotation.x = -stride;
    this.parts.LeftLowerLeg.rotation.x = -Math.max(0, stride) * 0.55;
    this.parts.RightLowerLeg.rotation.x = Math.max(0, stride) * 0.55;
    this.turret.rotation.z = player.isMoving ? Math.sin(this.elapsed * 6) * 0.018 : 0;

    for (const event of events) {
      if (event.type === 'beam_fired') {
        this.triggerBeam(event.angle);
      }
    }
  }

  triggerBeam(angle) {
    this.beamAngle = angle;
    this.turret.rotation.y = shortestAngleDelta(this.group.rotation.y - Math.PI, angle);
    this.recoil = 1;
    this.beamTimer = 0.12;
  }

  dispose() {
    this.group.removeFromParent();
    const geometries = new Set();
    const materials = new Set();
    this.group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this._owned.length = 0;
  }
}

function normalizeAngle(angle) {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function shortestAngleDelta(current, target) {
  let delta = normalizeAngle(target) - normalizeAngle(current);
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}
