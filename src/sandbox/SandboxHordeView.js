// ─── Sandbox zombie presentation adapter ───────────────────────────
// Maps serializable zombie state to reusable Three.js placeholder views.

import * as THREE from 'three';

export class SandboxHordeView {
  constructor(scene) {
    this.scene = scene;
    this.views = new Map();
    this.sharedGeometry = new THREE.IcosahedronGeometry(0.55, 1);
    this.sharedMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c8a72,
      roughness: 0.82,
      metalness: 0.12,
      emissive: 0x102a1c,
      emissiveIntensity: 0.45,
    });
    this.sharedEyeGeometry = new THREE.SphereGeometry(0.065, 8, 6);
    this.sharedEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffc45a });
    this.sharedHealthBackgroundGeometry = new THREE.PlaneGeometry(0.9, 0.06);
    this.sharedHealthGeometry = new THREE.PlaneGeometry(0.86, 0.035);
    this.sharedHealthBackgroundMaterial = new THREE.MeshBasicMaterial({ color: 0x251a1b, side: THREE.DoubleSide });
    this.sharedHealthMaterial = new THREE.MeshBasicMaterial({ color: 0xe95f54, side: THREE.DoubleSide });
  }

  update(zombies = [], delta = 0) {
    const activeIds = new Set();
    for (const zombie of zombies) {
      activeIds.add(zombie.id);
      let view = this.views.get(zombie.id);
      if (!view) {
        view = this._createView(zombie.id);
        this.views.set(zombie.id, view);
        this.scene.add(view.group);
      }
      view.group.position.set(zombie.x, zombie.radius, zombie.z);
      view.group.scale.setScalar(Math.max(0.55, zombie.radius / 0.6));
      view.group.rotation.y += Math.max(0, delta) * 0.7;
      view.health.scale.x = Math.max(0, zombie.health / zombie.maxHealth);
    }

    for (const [id, view] of this.views) {
      if (activeIds.has(id)) continue;
      view.group.removeFromParent();
      this.views.delete(id);
    }
  }

  _createView(id) {
    const group = new THREE.Group();
    group.name = `SandboxZombie_${id}`;
    const body = new THREE.Mesh(this.sharedGeometry, this.sharedMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const eye = new THREE.Mesh(this.sharedEyeGeometry, this.sharedEyeMaterial);
    eye.position.set(0, 0.08, 0.49);
    group.add(eye);

    const healthBackground = new THREE.Mesh(
      this.sharedHealthBackgroundGeometry,
      this.sharedHealthBackgroundMaterial,
    );
    healthBackground.position.set(0, 0.82, 0);
    healthBackground.rotation.x = -Math.PI / 2;
    group.add(healthBackground);

    const health = new THREE.Mesh(this.sharedHealthGeometry, this.sharedHealthMaterial);
    health.position.set(0, 0.825, 0.01);
    health.rotation.x = -Math.PI / 2;
    health.scale.x = 1;
    group.add(health);
    return { group, health };
  }

  dispose() {
    for (const view of this.views.values()) view.group.removeFromParent();
    this.views.clear();
    this.sharedGeometry.dispose();
    this.sharedMaterial.dispose();
    this.sharedEyeGeometry.dispose();
    this.sharedEyeMaterial.dispose();
    this.sharedHealthBackgroundGeometry.dispose();
    this.sharedHealthGeometry.dispose();
    this.sharedHealthBackgroundMaterial.dispose();
    this.sharedHealthMaterial.dispose();
  }
}
