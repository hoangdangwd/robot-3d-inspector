import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * ShowcaseStudio — lights, floor, plinth for the light-themed Fighter Lab.
 *
 * The renderer uses alpha:true / transparent clear so the CSS viewport
 * radial-gradient background shows through.  Only shadow-receiving geometry
 * and the accent ring are drawn by Three.js.
 */
export class ShowcaseStudio {
  constructor(scene, renderer) {
    // Showcase-only geometry lives under one root so Fight Mode can replace
    // the inspection plinth with a real arena without rebuilding the scene.
    this.group = new THREE.Group();
    this.group.name = 'ShowcaseStudio';
    scene.add(this.group);

    // PBR environment (RoomEnvironment gives soft, studio-light reflections)
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(room, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.85;
    this.environmentTexture = envRT.texture;   // shared with portrait renderer
    room.dispose(); pmrem.dispose();

    // No scene.background — renderer clear is transparent, CSS bg shows.
    scene.fog = null;

    // ── Lighting ──────────────────────────────────────────────────
    // Hemisphere: warm sky, cool ground; matches paper-white UI
    scene.add(new THREE.HemisphereLight(0xfaf5e8, 0x72786c, 2.2));

    const key = new THREE.DirectionalLight(0xffefd7, 4.2);
    key.position.set(-3, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -4, near: 0.5, far: 22 });
    key.shadow.normalBias = 0.03;
    key.shadow.bias       = -0.0002;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd0e8ff, 2.0);
    fill.position.set(4, 3, 2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xe4eeff, 2.8);
    rim.position.set(1, 5, -5);
    scene.add(rim);

    // ── Floor (shadow only, nearly invisible) ─────────────────────
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: 0x2e3422, opacity: 0.11 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.20;
    floor.receiveShadow = true;
    this.group.add(floor);

    // ── Grid ──────────────────────────────────────────────────────
    this.grid = new THREE.GridHelper(24, 48, 0xb6b9aa, 0xc6c8ba);
    this.grid.position.y = -0.19;
    const gm = this.grid.material;
    gm.transparent = true;
    gm.opacity = 0.30;
    this.group.add(this.grid);

    // ── Plinth ────────────────────────────────────────────────────
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.13, 2.17, 0.18, 96),
      new THREE.MeshStandardMaterial({ color: 0xd7d8c9, metalness: 0.35, roughness: 0.70 })
    );
    plinth.position.y = -0.09;
    plinth.receiveShadow = true;
    plinth.castShadow    = true;
    this.group.add(plinth);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(2.06, 2.06, 0.025, 96),
      new THREE.MeshStandardMaterial({ color: 0xe7e7db, metalness: 0.25, roughness: 0.76 })
    );
    top.position.y = 0.018;
    top.receiveShadow = true;
    this.group.add(top);

    // ── Accent ring + ticks ───────────────────────────────────────
    this.accentMat = new THREE.MeshBasicMaterial({ color: 0x89975b });

    for (const r of [1.87, 2.065]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.009, 6, 96),
        new THREE.MeshStandardMaterial({ color: 0x9a9e8d, roughness: 0.65 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y  = 0.036;
      this.group.add(ring);
    }

    const ticks = new THREE.Group();
    const tickGeo = new THREE.BoxGeometry(0.013, 0.008, 0.085);
    for (let i = 0; i < 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      const tick  = new THREE.Mesh(tickGeo, this.accentMat);
      tick.position.set(Math.sin(angle) * 1.97, 0.037, Math.cos(angle) * 1.97);
      tick.rotation.y = angle;
      ticks.add(tick);
    }
    this.group.add(ticks);

    // Accent hoop on top of plinth
    this.hoop = new THREE.Mesh(
      new THREE.TorusGeometry(1.57, 0.011, 6, 80),
      this.accentMat
    );
    this.hoop.rotation.x = Math.PI / 2;
    this.hoop.position.y  = -0.075;
    this.group.add(this.hoop);
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  /** Update the accent colour (per-robot). */
  setAccent(hex) {
    this.accentMat.color.setHex(hex);
  }

  /** Show / hide floor grid. */
  setGridVisible(visible) {
    this.grid.visible = visible;
  }
}
