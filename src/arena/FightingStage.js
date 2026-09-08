import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';

/**
 * Realistic Professional Combat Ring Stage
 * High-fidelity, authentic combat canvas, heavy steel posts, turnbuckles, vinyl ropes, and industrial arena.
 * 100% realistic materials, zero flashing neon or particle clutter, optimized for 60+ FPS.
 */
export class FightingStage {
  constructor(scene) {
    this.scene = scene;
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
  }

  /**
   * Elevated Combat Platform with Realistic Canvas Mat & Apron
   * Ring surface is strictly at Y = 1.0 to ensure 100% foot contact grounding.
   */
  buildPlatform() {
    const ringRadius = 5.2;
    const ringHeight = 1.0;
    const segments = 8; // Classic Octagon

    // 1. Octagon Base Geometry
    const baseGeo = new THREE.CylinderGeometry(ringRadius, ringRadius + 0.15, ringHeight, segments);
    baseGeo.rotateY(Math.PI / 8);

    // Multi-material: top is matte canvas mat, sides are draped apron skirt
    const topMat = new THREE.MeshStandardMaterial({
      map: this.matColorMap,
      roughnessMap: this.matRoughnessMap,
      roughness: 0.88,
      metalness: 0.05,
      envMapIntensity: 0.4
    });

    const sideMat = new THREE.MeshStandardMaterial({
      map: this.apronMap,
      roughness: 0.92,
      metalness: 0.04,
      color: 0xcccccc
    });

    const bottomMat = new THREE.MeshBasicMaterial({ color: 0x0c0e12 });

    const platform = new THREE.Mesh(baseGeo, [sideMat, topMat, bottomMat]);
    platform.position.y = ringHeight / 2;
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.group.add(platform);
    this.platform = platform;

    // 2. Heavy Padded Vinyl Ring Edge Bumper (Runs along the stage edge)
    const bumperGeo = new THREE.CylinderGeometry(ringRadius + 0.04, ringRadius + 0.14, 0.08, segments);
    bumperGeo.rotateY(Math.PI / 8);
    const bumperMat = new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.7,
      metalness: 0.1
    });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.y = ringHeight - 0.01;
    bumper.receiveShadow = true;
    this.group.add(bumper);

    // 3. Steel Underframe Perimeter Base
    const frameGeo = new THREE.CylinderGeometry(ringRadius + 0.16, ringRadius + 0.18, 0.15, segments);
    frameGeo.rotateY(Math.PI / 8);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      roughness: 0.4,
      metalness: 0.8
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 0.075;
    this.group.add(frame);
  }

  /**
   * 4 Heavy Structural Steel Corner Posts, Turnbuckles & 4 Ring Ropes
   */
  buildCornerPostsAndRopes() {
    const postDist = 3.65;
    const corners = [
      { x: -postDist, z: postDist, color: 0xba262e, name: 'RED_CORNER' },     // Front Left (Red Corner)
      { x: postDist, z: postDist, color: 0x1e5bb8, name: 'BLUE_CORNER' },    // Front Right (Blue Corner)
      { x: -postDist, z: -postDist, color: 0x242830, name: 'NEUTRAL_1' },    // Rear Left (Neutral Dark)
      { x: postDist, z: -postDist, color: 0x242830, name: 'NEUTRAL_2' },     // Rear Right (Neutral Dark)
    ];

    const postHeight = 2.4;
    const postGeo = new THREE.CylinderGeometry(0.09, 0.10, postHeight, 18);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x1e2229,
      metalness: 0.8,
      roughness: 0.35
    });

    const posts = [];

    corners.forEach((c) => {
      const postGroup = new THREE.Group();
      postGroup.position.set(c.x, 1.0 + postHeight / 2, c.z);

      // Steel Pillar
      const pillar = new THREE.Mesh(postGeo, postMat);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      postGroup.add(pillar);

      // Base Mounting Flange & Bolts
      const flangeGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.06, 12);
      const flange = new THREE.Mesh(flangeGeo, postMat);
      flange.position.y = -postHeight / 2 + 0.03;
      postGroup.add(flange);

      // Steel Top Cap
      const capGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.08, 16);
      const cap = new THREE.Mesh(capGeo, postMat);
      cap.position.y = postHeight / 2 + 0.04;
      postGroup.add(cap);

      // Heavy Padded Protective Corner Cushion
      const padGeo = new THREE.BoxGeometry(0.28, 1.45, 0.28);
      const padMat = new THREE.MeshStandardMaterial({
        color: c.color,
        roughness: 0.72,
        metalness: 0.08
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      // Offset inward toward center of ring
      pad.position.set(-Math.sign(c.x) * 0.08, 0.05, -Math.sign(c.z) * 0.08);
      pad.castShadow = true;
      postGroup.add(pad);

      this.group.add(postGroup);
      posts.push({ pos: new THREE.Vector3(c.x, 1.0, c.z), color: c.color });
    });

    // 4 Professional Ring Ropes
    const ropeHeights = [1.32, 1.68, 2.04, 2.40];
    const ropeOrder = [0, 1, 3, 2, 0]; // Loop through corners: Red -> Blue -> Neutral2 -> Neutral1 -> Red

    ropeHeights.forEach((h, rIdx) => {
      // Realistic rope wrap colors: top is white/red, middle is white/black, bottom is dark
      let ropeColor = 0xdddddd;
      if (rIdx === 3) ropeColor = 0xba262e; // Top rope red wrap
      else if (rIdx === 0) ropeColor = 0x1e5bb8; // Bottom rope blue wrap

      const ropeMat = new THREE.MeshStandardMaterial({
        color: ropeColor,
        roughness: 0.7,
        metalness: 0.15
      });

      const turnbuckleMat = new THREE.MeshStandardMaterial({
        color: 0x48505e,
        metalness: 0.9,
        roughness: 0.25
      });

      for (let i = 0; i < 4; i++) {
        const p1 = posts[ropeOrder[i]].pos;
        const p2 = posts[ropeOrder[i + 1]].pos;

        const start = new THREE.Vector3(p1.x, h, p1.z);
        const end = new THREE.Vector3(p2.x, h, p2.z);

        // Turnbuckle hardware at each post attachment
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const tbStart = new THREE.Vector3().copy(start).addScaledVector(dir, 0.22);
        const tbEnd = new THREE.Vector3().copy(end).addScaledVector(dir, -0.22);

        // Steel turnbuckle connector at p1
        const tb1Geo = new THREE.CylinderGeometry(0.018, 0.018, 0.20, 8);
        tb1Geo.rotateZ(Math.PI / 2);
        const tb1 = new THREE.Mesh(tb1Geo, turnbuckleMat);
        tb1.position.copy(start).lerp(tbStart, 0.5);
        tb1.lookAt(tbStart);
        this.group.add(tb1);

        // Main Rope
        const ropeLength = tbStart.distanceTo(tbEnd);
        const ropeGeo = new THREE.CylinderGeometry(0.022, 0.022, ropeLength, 8);
        ropeGeo.rotateX(Math.PI / 2);

        const ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
        ropeMesh.position.copy(tbStart).lerp(tbEnd, 0.5);
        ropeMesh.lookAt(tbEnd);
        ropeMesh.castShadow = true;
        this.group.add(ropeMesh);
      }
    });

    // Vertical Canvas Rope Spacers (Heavy canvas straps keeping the 4 ropes evenly aligned)
    const sides = [
      { p1: posts[0].pos, p2: posts[1].pos },
      { p1: posts[1].pos, p2: posts[3].pos },
      { p1: posts[3].pos, p2: posts[2].pos },
      { p1: posts[2].pos, p2: posts[0].pos },
    ];

    const spacerGeo = new THREE.BoxGeometry(0.05, 1.25, 0.015);
    const spacerMat = new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      roughness: 0.9,
      metalness: 0.05
    });

    sides.forEach((side) => {
      [0.33, 0.67].forEach((frac) => {
        const mid = new THREE.Vector3().copy(side.p1).lerp(side.p2, frac);
        mid.y = 1.86;
        const spacer = new THREE.Mesh(spacerGeo, spacerMat);
        spacer.position.copy(mid);
        spacer.lookAt(new THREE.Vector3(0, mid.y, 0));
        this.group.add(spacer);
      });
    });
  }

  /**
   * Welded Steel Entry Steps (South and North sides)
   */
  buildSteps() {
    [-1, 1].forEach((dir) => {
      const stepGroup = new THREE.Group();
      const stepCount = 3;
      const stepW = 1.4;
      const stepD = 0.42;
      const ringHeight = 1.0;
      const stepH = ringHeight / stepCount;

      const stepMat = new THREE.MeshStandardMaterial({
        map: this.treadMap,
        metalness: 0.75,
        roughness: 0.4
      });

      for (let s = 0; s < stepCount; s++) {
        const stepGeo = new THREE.BoxGeometry(stepW, stepH * (s + 1), stepD);
        const stepMesh = new THREE.Mesh(stepGeo, stepMat);
        stepMesh.position.set(0, (stepH * (s + 1)) / 2, s * stepD);
        stepMesh.receiveShadow = true;
        stepMesh.castShadow = true;
        stepGroup.add(stepMesh);
      }

      stepGroup.position.set(0, 0, 5.25 * dir);
      if (dir === -1) stepGroup.rotateY(Math.PI);
      this.group.add(stepGroup);
    });
  }

  /**
   * Realistic Dark Industrial Concrete Floor & Arena Perimeter
   */
  buildArenaEnvironment() {
    // 1. Polished Concrete Ground
    const floorGeo = new THREE.CircleGeometry(40, 48);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.concreteMap,
      roughness: 0.6,
      metalness: 0.25,
      envMapIntensity: 0.3
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. Distant Arena Stands / Dark Walls (Low-poly backdrop)
    const tiers = 4;
    const innerRadius = 16;
    const tierH = 1.4;
    const tierD = 2.8;

    const tierMat = new THREE.MeshStandardMaterial({
      color: 0x121418,
      roughness: 0.85,
      metalness: 0.15
    });

    for (let t = 0; t < tiers; t++) {
      const r = innerRadius + t * tierD;
      const h = (t + 1) * tierH;
      const geo = new THREE.CylinderGeometry(r + tierD, r, tierH, 32, 1, true);
      const mesh = new THREE.Mesh(geo, tierMat);
      mesh.position.y = h - tierH / 2;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /**
   * Realistic Overhead Industrial Steel Lighting Truss & Fixtures
   */
  buildOverheadRig() {
    const trussGroup = new THREE.Group();
    const trussY = 9.0;
    const trussR = 6.2;
    const segs = 8;

    // Heavy Square Steel Tube Truss Ring
    const tubeGeo = new THREE.TorusGeometry(trussR, 0.10, 6, segs);
    tubeGeo.rotateX(Math.PI / 2);
    tubeGeo.rotateY(Math.PI / 8);
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      metalness: 0.85,
      roughness: 0.4
    });
    const trussRing = new THREE.Mesh(tubeGeo, trussMat);
    trussRing.position.y = trussY;
    trussGroup.add(trussRing);

    // Cross support beams
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 4) * i;
      const barGeo = new THREE.CylinderGeometry(0.06, 0.06, trussR * 2, 8);
      barGeo.rotateZ(Math.PI / 2);
      barGeo.rotateY(angle);
      const bar = new THREE.Mesh(barGeo, trussMat);
      bar.position.y = trussY;
      trussGroup.add(bar);
    }

    // Realistic Industrial Floodlight Fixtures aimed at ring center
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      metalness: 0.8,
      roughness: 0.35
    });
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0xfffaed
    });

    const spotCount = 8;
    for (let i = 0; i < spotCount; i++) {
      const angle = (Math.PI * 2 / spotCount) * i + Math.PI / 8;
      const fx = trussR * Math.cos(angle);
      const fz = trussR * Math.sin(angle);

      const housingGeo = new THREE.CylinderGeometry(0.18, 0.26, 0.45, 12);
      const housing = new THREE.Mesh(housingGeo, fixtureMat);
      housing.position.set(fx, trussY - 0.22, fz);
      housing.lookAt(0, 1.0, 0);

      // Emissive bulb lens
      const lensGeo = new THREE.CircleGeometry(0.22, 12);
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, -0.23, 0);
      lens.rotateX(Math.PI / 2);
      housing.add(lens);

      trussGroup.add(housing);
    }

    this.group.add(trussGroup);
  }

  /**
   * Fast no-op update: zero CPU overhead per frame
   */
  update(delta, time) {
    // Stage is static realistic geometry, no animation CPU loops needed
  }
}
