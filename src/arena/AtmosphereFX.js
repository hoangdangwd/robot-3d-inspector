import * as THREE from 'three';

/**
 * AtmosphereFX
 * Clean, lightweight atmospheric manager without laggy particle or fog planes.
 */
export class AtmosphereFX {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'AtmosphereFX';
    this.scene.add(this.group);
  }

  update(delta, time) {
    // Zero-overhead
  }

  triggerImpact(point, normal, strength) {
    // No-op to avoid visual clutter/lag
  }
}
