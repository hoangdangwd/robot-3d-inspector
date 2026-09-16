import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';

/**
 * Dedicated Fight Mode arena.
 *
 * The legal simulation circle sits inside the octagonal ropes with a visible
 * safety apron around it. The combat surface is always Y=0 so presentation
 * fighters and simulation coordinates share the same ground plane.
 */
export class FightingStage {
  constructor(scene, { playableRadius = 6.5, stagePadding = 1.5 } = {}) {
    this.scene = scene;
    this.playableRadius = playableRadius;
    this.stageRadius = playableRadius + stagePadding;
    this.surfaceY = 0;
    this.platformHeight = 1;

    this.group = new THREE.Group();
    this.group.name = 'FightingStage';
    this.scene.add(this.group);

    this.initTextures();
    this.buildPlatform();
    this.buildCornerPostsAndRopes();
    this.buildSteps();
    this.buildArenaEnvironment();
    this.buildOverheadRig();
  }

  initTextures() {
    this.matColorMap = TextureGenerator.createRealisticMatTexture();
    this.matRoughnessMap = TextureGenerator.createRealisticMatRoughness();
    this.apronMap = TextureGenerator.createApronTexture();
    this.treadMap = TextureGenerator.createMetalTreadTexture();
    this.concreteMap = TextureGenerator.createConcreteFloorTexture();
    this.textures = [
      this.matColorMap,
      this.matRoughnessMap,
      this.apronMap,
      this.treadMap,
      this.concreteMap,
    ];
  }

  buildPlatform() {
    const segments = 8;
    const baseGeo = new THREE.CylinderGeometry(
      this.stageRadius,
      this.stageRadius + 0.18,
      this.platformHeight,
      segments,
    );
    baseGeo.rotateY(Math.PI / 8);

    const topMat = new THREE.MeshStandardMaterial({
      map: this.matColorMap,
      roughnessMap: this.matRoughnessMap,
      roughness: 0.88,
      metalness: 0.05,
      envMapIntensity: 0.4,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      map: this.apronMap,
      roughness: 0.92,
      metalness: 0.04,
      color: 0xcccccc,
    });
    const bottomMat = new THREE.MeshBasicMaterial({ color: 0x0c0e12 });

    const platform = new THREE.Mesh(baseGeo, [sideMat, topMat, bottomMat]);
    platform.name = 'fight-surface';
    platform.position.y = this.surfaceY - this.platformHeight / 2;
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.group.add(platform);
    this.platform = platform;

    const bumperGeo = new THREE.CylinderGeometry(
      this.stageRadius + 0.04,
      this.stageRadius + 0.16,
      0.1,
      segments,
    );
    bumperGeo.rotateY(Math.PI / 8);
    const bumper = new THREE.Mesh(bumperGeo, new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.7,
      metalness: 0.1,
    }));
    bumper.position.y = this.surfaceY - 0.03;
    bumper.receiveShadow = true;
    this.group.add(bumper);

    const frameGeo = new THREE.CylinderGeometry(
      this.stageRadius + 0.18,
      this.stageRadius + 0.22,
      0.16,
      segments,
    );
    frameGeo.rotateY(Math.PI / 8);
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      roughness: 0.4,
      metalness: 0.8,
    }));
    frame.position.y = this.surfaceY - this.platformHeight + 0.08;
    this.group.add(frame);
  }

  buildCornerPostsAndRopes() {
    const postRadius = this.stageRadius - 0.3;
    const postHeight = 2.55;
    const corners = Array.from({ length: 8 }, (_, index) => {
      const angle = Math.PI / 8 + index * Math.PI / 4;
      return {
        x: Math.cos(angle) * postRadius,
        z: Math.sin(angle) * postRadius,
        color: index === 2 ? 0xba262e : index === 6 ? 0x1e5bb8 : 0x242830,
      };
    });

    const postGeo = new THREE.CylinderGeometry(0.11, 0.13, postHeight, 18);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x1e2229,
      metalness: 0.8,
      roughness: 0.35,
    });
    const padGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 12);

    const posts = corners.map((corner) => {
      const postGroup = new THREE.Group();
      postGroup.position.set(corner.x, this.surfaceY + postHeight / 2, corner.z);

      const pillar = new THREE.Mesh(postGeo, postMat);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      postGroup.add(pillar);

      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.24, 0.07, 12),
        postMat,
      );
      flange.position.y = -postHeight / 2 + 0.035;
      postGroup.add(flange);

      const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({
        color: corner.color,
        roughness: 0.72,
        metalness: 0.08,
      }));
      pad.position.set(-corner.x / postRadius * 0.09, 0.05, -corner.z / postRadius * 0.09);
      pad.castShadow = true;
      postGroup.add(pad);

      this.group.add(postGroup);
      return new THREE.Vector3(corner.x, this.surfaceY, corner.z);
    });

    const ropeHeights = [0.42, 0.82, 1.22, 1.62];
    const ropeColors = [0x1e5bb8, 0xdddddd, 0xdddddd, 0xba262e];
    ropeHeights.forEach((height, ropeIndex) => {
      const ropeMat = new THREE.MeshStandardMaterial({
        color: ropeColors[ropeIndex],
        roughness: 0.7,
        metalness: 0.15,
      });
      for (let index = 0; index < posts.length; index++) {
        const start = posts[index].clone();
        const end = posts[(index + 1) % posts.length].clone();
        start.y = this.surfaceY + height;
        end.y = this.surfaceY + height;
        this._addCylinderBetween(start, end, 0.025, ropeMat);
      }
    });

    const spacerMat = new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      roughness: 0.9,
      metalness: 0.05,
    });
    for (let index = 0; index < posts.length; index++) {
      const start = posts[index];
      const end = posts[(index + 1) % posts.length];
      const midpoint = start.clone().lerp(end, 0.5);
      const spacer = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.28, 0.025), spacerMat);
      spacer.position.set(midpoint.x, this.surfaceY + 1.02, midpoint.z);
      spacer.lookAt(0, spacer.position.y, 0);
      this.group.add(spacer);
    }
  }

  _addCylinderBetween(start, end, radius, material) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 8),
      material,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    mesh.castShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  buildSteps() {
    [-1, 1].forEach((direction) => {
      const stepGroup = new THREE.Group();
      const stepCount = 3;
      const stepWidth = 1.65;
      const stepDepth = 0.48;
      const stepHeight = this.platformHeight / stepCount;
      const stepMat = new THREE.MeshStandardMaterial({
        map: this.treadMap,
        metalness: 0.75,
        roughness: 0.4,
      });

      for (let index = 0; index < stepCount; index++) {
        const height = stepHeight * (index + 1);
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(stepWidth, height, stepDepth),
          stepMat,
        );
        step.position.set(0, -this.platformHeight + height / 2, index * stepDepth);
        step.receiveShadow = true;
        step.castShadow = true;
        stepGroup.add(step);
      }

      stepGroup.position.set(0, this.surfaceY, (this.stageRadius + 0.05) * direction);
      if (direction === -1) stepGroup.rotateY(Math.PI);
      this.group.add(stepGroup);
    });
  }

  buildArenaEnvironment() {
    const floorGeo = new THREE.CircleGeometry(Math.max(42, this.stageRadius * 4.5), 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
      map: this.concreteMap,
      roughness: 0.68,
      metalness: 0.2,
      envMapIntensity: 0.3,
    }));
    floor.position.y = this.surfaceY - this.platformHeight;
    floor.receiveShadow = true;
    this.group.add(floor);

    const tiers = 4;
    const innerRadius = this.stageRadius + 8;
    const tierHeight = 1.5;
    const tierDepth = 3;
    const tierMat = new THREE.MeshStandardMaterial({
      color: 0x101216,
      roughness: 0.88,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });

    for (let index = 0; index < tiers; index++) {
      const radius = innerRadius + index * tierDepth;
      const height = (index + 1) * tierHeight;
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(radius + tierDepth, radius, tierHeight, 40, 1, true),
        tierMat,
      );
      tier.position.y = this.surfaceY - this.platformHeight + height - tierHeight / 2;
      tier.receiveShadow = true;
      this.group.add(tier);
    }
  }

  buildOverheadRig() {
    const rigHeight = this.surfaceY + 10.5;
    const rigRadius = this.stageRadius + 1.7;
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      metalness: 0.85,
      roughness: 0.4,
    });
    const truss = new THREE.Mesh(
      new THREE.TorusGeometry(rigRadius, 0.11, 6, 8),
      trussMat,
    );
    truss.rotation.x = Math.PI / 2;
    truss.rotation.z = Math.PI / 8;
    truss.position.y = rigHeight;
    this.group.add(truss);

    const fixtureMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      metalness: 0.8,
      roughness: 0.35,
    });
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xfffaed });
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4 + Math.PI / 8;
      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.29, 0.48, 12),
        fixtureMat,
      );
      fixture.position.set(
        Math.cos(angle) * rigRadius,
        rigHeight - 0.25,
        Math.sin(angle) * rigRadius,
      );
      fixture.lookAt(0, this.surfaceY, 0);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), lensMat);
      lens.position.set(0, -0.245, 0);
      lens.rotation.x = Math.PI / 2;
      fixture.add(lens);
      this.group.add(fixture);
    }
  }

  getSurfaceWorldY() {
    return this.group.position.y + this.surfaceY;
  }

  update() {
    // Static arena geometry; no per-frame work required.
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.scene.remove(this.group);
  }
}
