// ─── Sandbox follow/orbit camera ────────────────────────────────────
// Presentation-only camera. It reads the simulation player position through
// SandboxMode and never affects simulation coordinates or targeting.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SandboxCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 28;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.target = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3(0, 0.8, 0);
    this.desiredLookTarget = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.defaultOffset = new THREE.Vector3(9, 9, 11);
    this.reset();
  }

  reset(player = { x: 0, z: 0 }) {
    this.target.set(player.x, 0, player.z);
    this.lookTarget.set(player.x, 0.8, player.z);
    this.camera.position.copy(this.target).add(this.defaultOffset);
    this.controls.target.copy(this.lookTarget);
    this.camera.lookAt(this.lookTarget);
    this.controls.update(0);
  }

  update(delta, player = { x: 0, z: 0 }) {
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.target.set(player.x, 0, player.z);
    this.desiredLookTarget.set(player.x, 0.8, player.z);
    this.lookTarget.lerp(this.desiredLookTarget, Math.min(1, safeDelta * 8));
    this.desiredPosition.copy(this.target).add(this.defaultOffset);
    this.camera.position.lerp(this.desiredPosition, Math.min(1, safeDelta * 5));
    this.controls.target.lerp(this.lookTarget, Math.min(1, safeDelta * 8));
    this.controls.update(safeDelta);
  }

  dispose() {
    this.controls.dispose();
  }
}
