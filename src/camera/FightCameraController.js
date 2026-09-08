import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class FightCameraController {
  constructor(camera, domElement, model = null) {
    this.camera = camera;
    this.domElement = domElement;
    this.model = model;

    this.mode = 'ORBIT_INSPECT';
    this.trauma = 0;
    this.defaultPos = new THREE.Vector3(0, 2.0, 3.8);
    this.defaultTarget = new THREE.Vector3(0, 1.7, 0);

    this.targetPos = this.defaultPos.clone();
    this.lookTarget = this.defaultTarget.clone();

    // Orbit Controls for free model & animation inspection
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.04; // Don't go below floor
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 25.0;
    this.controls.target.copy(this.defaultTarget);
    this.controls.enabled = true;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 2.0;

    // When user manually manipulates camera, seamlessly switch to ORBIT_INSPECT
    this.controls.addEventListener('start', () => {
      if (this.mode !== 'ORBIT_INSPECT' && this.mode !== 'TURNTABLE') {
        this.mode = 'ORBIT_INSPECT';
      }
    });

    this.cinematicAngle = 0;
    this.turntableSpeed = 0.6;

    // Set initial position
    this.camera.position.copy(this.defaultPos);
    this.camera.lookAt(this.defaultTarget);

    this.setMode('ORBIT_INSPECT');
  }

  setModel(model) {
    this.model = model;
    this.p1 = model; // compatibility
  }

  setFighters(p1, p2) {
    this.model = p1;
    this.p1 = p1;
    this.p2 = p2;
  }

  resetCamera() {
    this.mode = 'ORBIT_INSPECT';
    this.controls.autoRotate = false;
    this.controls.target.copy(this.defaultTarget);
    this.camera.position.copy(this.defaultPos);
    this.camera.lookAt(this.defaultTarget);
    this.controls.update();
  }

  toggleTurntable() {
    this.controls.autoRotate = !this.controls.autoRotate;
    if (this.controls.autoRotate) {
      this.mode = 'TURNTABLE';
    } else {
      this.mode = 'ORBIT_INSPECT';
    }
    return this.controls.autoRotate;
  }

  setMode(mode) {
    this.mode = mode;

    if (mode === 'TURNTABLE') {
      this.controls.enabled = true;
      this.controls.autoRotate = true;
      this.controls.target.copy(this.defaultTarget);
      return;
    }

    this.controls.autoRotate = false;

    if (mode === 'ORBIT_INSPECT') {
      this.controls.enabled = true;
      this.controls.target.copy(this.defaultTarget);
      return;
    }

    // Preset camera positions
    switch (mode) {
      case 'FRONT':
        this.targetPos.set(0, 2.0, 3.8);
        this.lookTarget.copy(this.defaultTarget);
        break;

      case 'SIDE':
        this.targetPos.set(3.8, 2.0, 0);
        this.lookTarget.copy(this.defaultTarget);
        break;

      case 'TOP_DOWN':
        this.targetPos.set(0, 5.0, 0.1);
        this.lookTarget.copy(this.defaultTarget);
        break;

      case 'CLOSEUP_HEAD':
        if (this.model && typeof this.model.getHeadPos === 'function') {
          const hp = this.model.getHeadPos();
          this.targetPos.set(hp.x, hp.y + 0.05, hp.z + 1.25);
          this.lookTarget.copy(hp);
        } else {
          this.targetPos.set(0, 2.7, 1.2);
          this.lookTarget.set(0, 2.6, 0);
        }
        break;

      case 'CLOSEUP_TORSO':
        if (this.model && typeof this.model.getChestPos === 'function') {
          const cp = this.model.getChestPos();
          this.targetPos.set(cp.x, cp.y, cp.z + 1.7);
          this.lookTarget.copy(cp);
        } else {
          this.targetPos.set(0, 1.9, 1.7);
          this.lookTarget.set(0, 1.7, 0);
        }
        break;

      case 'CLOSEUP_FEET':
        this.targetPos.set(0, 1.25, 1.8);
        this.lookTarget.set(0, 1.05, 0);
        break;

      case 'CINEMATIC_ORBIT':
        this.cinematicAngle = 0;
        break;

      case 'DYNAMIC_FIGHT':
        this.targetPos.set(0, 2.2, 4.8);
        this.lookTarget.copy(this.defaultTarget);
        break;
    }
  }

  addShake(amount = 0.25) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  update(delta) {
    // 1. Free Orbit inspection & Turntable
    if (this.mode === 'ORBIT_INSPECT' || this.mode === 'TURNTABLE') {
      this.controls.update();

    } else if (this.mode === 'CINEMATIC_ORBIT') {
      this.cinematicAngle += delta * this.turntableSpeed;
      const dist = 4.2;
      const height = 2.1 + Math.sin(this.cinematicAngle * 0.5) * 0.4;
      this.camera.position.set(
        Math.cos(this.cinematicAngle) * dist,
        height,
        Math.sin(this.cinematicAngle) * dist
      );
      this.camera.lookAt(this.defaultTarget);
      this.controls.target.copy(this.defaultTarget);

    } else if (this.mode.startsWith('CLOSEUP_') || this.mode === 'FRONT' || this.mode === 'SIDE' || this.mode === 'TOP_DOWN' || this.mode === 'DYNAMIC_FIGHT') {
      // Smooth lerp towards preset position & target
      this.camera.position.lerp(this.targetPos, 0.08);
      this.lookTarget.lerp(this.lookTarget, 0.08);
      this.camera.lookAt(this.lookTarget);
      this.controls.target.lerp(this.lookTarget, 0.08);
    }

    // 2. Camera Shake (if triggered)
    if (this.trauma > 0) {
      const shake = Math.pow(this.trauma, 2);
      const maxOffset = 0.12;
      const maxAngle = 0.025;

      const offsetX = (Math.random() * 2 - 1) * maxOffset * shake;
      const offsetY = (Math.random() * 2 - 1) * maxOffset * shake;
      const offsetZ = (Math.random() * 2 - 1) * maxOffset * shake;

      this.camera.position.x += offsetX;
      this.camera.position.y += offsetY;
      this.camera.position.z += offsetZ;
      this.camera.rotation.z += (Math.random() * 2 - 1) * maxAngle * shake;

      this.trauma -= delta * 1.8;
      if (this.trauma < 0) this.trauma = 0;
    }
  }
}
