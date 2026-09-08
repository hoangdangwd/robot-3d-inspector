import * as THREE from 'three';

/**
 * Realistic Arena & Studio Lighting Manager
 * Delivers natural PBR illumination with soft contact shadows and crisp edge definition.
 * Zero neon flickering or performance-draining updates.
 */
export class LightingManager {
  constructor(scene) {
    this.scene = scene;
    this.lightsGroup = new THREE.Group();
    this.lightsGroup.name = 'LightingManager';
    this.scene.add(this.lightsGroup);

    this.initLights();
  }

  initLights() {
    // 1. Neutral Ambient Base
    this.ambientLight = new THREE.AmbientLight(0x222630, 1.4);
    this.lightsGroup.add(this.ambientLight);

    // 2. Realistic Sky/Floor Hemispheric Bounce
    this.hemiLight = new THREE.HemisphereLight(0x28303d, 0x14161a, 1.0);
    this.lightsGroup.add(this.hemiLight);

    // 3. Main Overhead Arena Spot (Casts primary soft contact shadow under robot)
    this.overheadSpot = new THREE.SpotLight(0xfff8ee, 55, 18, Math.PI / 4, 0.45, 1.4);
    this.overheadSpot.position.set(0, 9.2, 0);
    this.overheadSpot.castShadow = true;
    this.overheadSpot.shadow.mapSize.width = 2048;
    this.overheadSpot.shadow.mapSize.height = 2048;
    this.overheadSpot.shadow.camera.near = 2.0;
    this.overheadSpot.shadow.camera.far = 14;
    this.overheadSpot.shadow.bias = -0.0004;
    this.overheadSpot.shadow.normalBias = 0.02;
    this.overheadSpot.target.position.set(0, 1.0, 0);
    this.lightsGroup.add(this.overheadSpot);
    this.lightsGroup.add(this.overheadSpot.target);

    // 4. Front-Right Key Fill (Warm white 4800K, brings out chest/face/armor details)
    this.frontKey = new THREE.DirectionalLight(0xfff2e3, 1.6);
    this.frontKey.position.set(4.5, 5.5, 6.0);
    this.lightsGroup.add(this.frontKey);

    // 5. Front-Left Fill (Soft cool white 6000K, fills left flank shadows)
    this.frontFill = new THREE.DirectionalLight(0xd8e4f5, 1.2);
    this.frontFill.position.set(-5.0, 4.5, 4.5);
    this.lightsGroup.add(this.frontFill);

    // 6. Rear Rim / Hair Light (Crisp edge light defining the robot's silhouette)
    this.rimLight = new THREE.DirectionalLight(0xd0e2ff, 2.2);
    this.rimLight.position.set(0, 6.0, -6.0);
    this.lightsGroup.add(this.rimLight);
  }

  /**
   * Fast no-op update
   */
  update(delta, time) {
    // Static high-performance lighting
  }
}
