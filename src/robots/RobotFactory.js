import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R15_PART_NAMES } from './robotCatalog.js';

// Chamfered, tapered armor instead of scaled cubes. All dimensions are in metres.
function armorGeometry(w, h, d, taper = 0.83) {
  const c = Math.min(w, h) * 0.15;
  const x = w / 2, y = h / 2, b = x * taper;
  const shape = new THREE.Shape();
  shape.moveTo(-b + c, -y); shape.lineTo(b - c, -y);
  shape.lineTo(b, -y + c); shape.lineTo(x, y - c);
  shape.lineTo(x - c, y); shape.lineTo(-x + c, y);
  shape.lineTo(-x, y - c); shape.lineTo(-b, -y + c); shape.closePath();
  const bevel = Math.min(w, h, d) * 0.075;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.002, d - 2 * bevel), bevelEnabled: true,
    bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 1
  });
  geo.translate(0, 0, -d / 2 + bevel);
  return geo;
}

function mesh(parent, geometry, material, position, rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position); object.rotation.set(...rotation);
  object.castShadow = true; object.receiveShadow = true;
  parent.add(object);
  return object;
}

function plate(parent, material, size, at, taper = 0.83, rotation) {
  return mesh(parent, armorGeometry(...size, taper), material, at, rotation);
}

function cylinder(parent, material, radius, length, at, axis = 'y', sides = 16) {
  const rotation = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return mesh(parent, new THREE.CylinderGeometry(radius, radius, length, sides), material, at, rotation);
}

function ring(parent, material, radius, tube, at, axis = 'z') {
  return mesh(parent, new THREE.TorusGeometry(radius, tube, 6, 24), material, at,
    axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]);
}

function fasteners(parent, mat, w, h, z, cy = 0) {
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    cylinder(parent, mat, 0.018, 0.016, [x * w * 0.35, cy + y * h * 0.31, z], 'z', 6);
  }
}

function joint(parent, m, radius, axis = 'x') {
  cylinder(parent, m.dark, radius, radius * 1.95, [0, 0, 0], axis);
  ring(parent, m.trim, radius * 0.79, radius * 0.11, [radius, 0, 0], axis);
  ring(parent, m.trim, radius * 0.79, radius * 0.11, [-radius, 0, 0], axis);
}

// Details are welded into rigid render shells; only the 15 semantic pivots animate.
function weldPart(part) {
  const buckets = new Map();
  for (const child of [...part.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    let geo = child.geometry.clone().applyMatrix4(child.matrix);
    if (geo.index) { const nonIndexed = geo.toNonIndexed(); geo.dispose(); geo = nonIndexed; }
    geo.clearGroups();
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(geo);
    child.geometry.dispose(); part.remove(child);
  }
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    const shell = mesh(part, geometry, material, [0, 0, 0]);
    shell.name = `${part.name}_${material.name}`;
  }
}

export class RobotFactory {
  static create(definition) {
    const p = definition.proportions, style = definition.featureStyle;
    const materials = {};
    for (const [name, color] of Object.entries(definition.colors)) {
      materials[name] = new THREE.MeshStandardMaterial({
        name, color, metalness: name === 'trim' ? 0.88 : 0.48,
        roughness: name === 'trim' ? 0.28 : 0.4,
        emissive: name === 'light' ? color : 0,
        emissiveIntensity: name === 'light' ? 1.1 : 0
      });
    }
    materials.dark = new THREE.MeshStandardMaterial({ name: 'rubber', color: 0x101920, roughness: 0.65, metalness: 0.25 });
    const m = materials;
    const root = new THREE.Group(); root.name = `Robot_${definition.id}`;
    const parts = {};
    const add = (name, parent, at) => {
      const part = new THREE.Group(); part.name = name;
      part.position.set(...at); part.userData.bodyPart = name;
      parent.add(part); parts[name] = part; return part;
    };
    const hipsY = p.foot[1] + p.lowerLegLength + p.upperLegLength;
    const hips = add('LowerTorso', root, [0, hipsY, 0]);
    const chest = add('UpperTorso', hips, [0, p.lowerTorsoHeight, 0]);
    const head = add('Head', chest, [0, p.upperTorsoHeight + 0.06, 0]);

    // Segmented abdomen, pelvic belt and separated hip sockets.
    plate(hips, m.secondary, [p.hipWidth * 1.2, p.lowerTorsoHeight * 0.52, p.torsoDepth * 0.8], [0, p.lowerTorsoHeight * 0.16, 0], 0.8);
    for (let i = 0; i < 3; i++) {
      plate(hips, i === 1 ? m.trim : m.dark, [p.hipWidth * (0.64 - i * 0.04), 0.052, p.torsoDepth * 0.64], [0, p.lowerTorsoHeight * 0.48 + i * 0.065, 0], 0.95);
    }
    plate(hips, m.accent, [p.hipWidth * 0.24, 0.075, 0.04], [0, 0.07, p.torsoDepth * 0.44]);
    // Broad top / tapered waist, layered breastplate with visible seams.
    plate(chest, m.secondary, [p.shoulderWidth * 0.88, p.upperTorsoHeight, p.torsoDepth], [0, p.upperTorsoHeight / 2, 0], 0.62);
    for (const s of [-1, 1]) {
      plate(chest, m.primary, [p.shoulderWidth * 0.4, p.upperTorsoHeight * 0.6, p.torsoDepth * 0.27],
        [s * p.shoulderWidth * 0.225, p.upperTorsoHeight * 0.64, p.torsoDepth * 0.47], 0.74, [0, s * -0.16, s * -0.10]);
      plate(chest, m.trim, [p.shoulderWidth * 0.36, 0.045, 0.06],
        [s * p.shoulderWidth * 0.22, p.upperTorsoHeight * 0.88, p.torsoDepth * 0.61], 0.92, [0, 0, s * -0.10]);
      for (let i = 0; i < 3; i++) {
        plate(chest, m.dark, [p.shoulderWidth * 0.15, 0.02, 0.016],
          [s * p.shoulderWidth * 0.23, p.upperTorsoHeight * (0.37 + i * 0.075), p.torsoDepth * 0.58]);
      }
      // Rear service plates stay interesting when orbiting.
      plate(chest, m.primary, [p.shoulderWidth * 0.28, p.upperTorsoHeight * 0.72, 0.09],
        [s * p.shoulderWidth * 0.23, p.upperTorsoHeight * 0.51, -p.torsoDepth * 0.5], 0.86);
    }
    this.chestFeature(chest, p, m, style);
    this.headFeature(head, p, m, style);

    for (const [side, s] of [['Left', 1], ['Right', -1]]) {
      const upper = add(`${side}UpperArm`, chest, [s * (p.shoulderWidth * 0.49 + p.armWidth * 0.26), p.upperTorsoHeight * 0.78, 0]);
      const lower = add(`${side}LowerArm`, upper, [0, -p.upperArmLength, 0]);
      const hand = add(`${side}Hand`, lower, [0, -p.lowerArmLength, 0]);
      const thigh = add(`${side}UpperLeg`, hips, [s * p.hipWidth * 0.55, 0, 0]);
      const shin = add(`${side}LowerLeg`, thigh, [0, -p.upperLegLength, 0]);
      const foot = add(`${side}Foot`, shin, [0, -p.lowerLegLength, 0]);
      joint(upper, m, p.armWidth * 0.58);
      joint(lower, m, p.armWidth * 0.47);
      joint(thigh, m, p.legWidth * 0.56);
      joint(shin, m, p.legWidth * 0.5);
      const shoulderScale = style === 'forge' ? 1.85 : style === 'aegis' ? 1.8 : 1.5;
      plate(upper, m.primary, [p.armWidth * shoulderScale, p.upperArmLength * 0.53, p.armWidth * 1.65],
        [s * p.armWidth * 0.23, -p.upperArmLength * 0.15, 0], style === 'aegis' ? 0.9 : 0.65, [0, 0, s * 0.12]);
      plate(upper, m.accent, [p.armWidth * 1.25, 0.045, p.armWidth * 1.5], [s * p.armWidth * 0.23, -0.015, 0]);
      cylinder(upper, m.trim, p.armWidth * 0.28, p.upperArmLength * 0.8, [0, -p.upperArmLength * 0.51, 0]);
      plate(upper, m.secondary, [p.armWidth * 0.95, p.upperArmLength * 0.48, p.armWidth], [0, -p.upperArmLength * 0.57, 0]);
      const forearmWidth = p.armWidth * (style === 'forge' ? 1.8 : style === 'aegis' ? 1.6 : 1.3);
      plate(lower, m.primary, [forearmWidth, p.lowerArmLength * 0.75, p.armWidth * 1.6], [0, -p.lowerArmLength * 0.47, 0], 1.18);
      plate(lower, m.secondary, [forearmWidth * 0.67, p.lowerArmLength * 0.5, 0.05], [0, -p.lowerArmLength * 0.47, p.armWidth * 0.85]);
      plate(lower, m.light, [0.025, p.lowerArmLength * 0.31, 0.018], [0, -p.lowerArmLength * 0.43, p.armWidth * 0.89]);
      cylinder(hand, m.trim, p.armWidth * 0.39, 0.10, [0, -0.01, 0]);
      plate(hand, m.secondary, p.hand, [0, -p.hand[1] * 0.48, 0], 0.88);
      plate(hand, m.primary, [p.hand[0] * 1.02, p.hand[1] * 0.5, p.hand[2] * 0.5], [0, -p.hand[1] * 0.73, p.hand[2] * 0.31]);
      for (let i = 0; i < 4; i++) {
        plate(hand, m.trim, [p.hand[0] * 0.17, p.hand[1] * 0.24, 0.04],
          [(i - 1.5) * p.hand[0] * 0.22, -p.hand[1] * 0.79, p.hand[2] * 0.54]);
      }
      plate(hand, m.dark, [p.hand[0] * 0.3, p.hand[1] * 0.7, p.hand[2] * 0.55], [s * p.hand[0] * 0.47, -p.hand[1] * 0.35, p.hand[2] * 0.15]);
      this.armFeature(upper, lower, p, m, style, s);

      // Broad armor, exposed actuators, floating knee cap; no tube-like legs.
      plate(thigh, m.secondary, [p.legWidth * 1.3, p.upperLegLength * 0.76, p.legWidth * 1.15], [0, -p.upperLegLength * 0.46, 0]);
      plate(thigh, m.primary, [p.legWidth * 1.18, p.upperLegLength * 0.55, 0.10], [0, -p.upperLegLength * 0.40, p.legWidth * 0.6], 0.7);
      cylinder(thigh, m.trim, 0.033, p.upperLegLength * 0.58, [s * p.legWidth * 0.57, -p.upperLegLength * 0.52, 0]);
      plate(shin, m.accent, [p.legWidth * 1.12, p.legWidth * 0.65, 0.09], [0, -0.025, p.legWidth * 0.54]);
      plate(shin, m.primary, [p.legWidth * 1.3, p.lowerLegLength * 0.79, p.legWidth * 1.05], [0, -p.lowerLegLength * 0.52, 0], 1.06);
      plate(shin, m.secondary, [p.legWidth * 0.61, p.lowerLegLength * 0.56, 0.06], [0, -p.lowerLegLength * 0.50, p.legWidth * 0.56], 0.55);
      plate(shin, m.trim, [0.025, p.lowerLegLength * 0.41, 0.02], [0, -p.lowerLegLength * 0.5, p.legWidth * 0.61]);
      const [fw, fh, fd] = p.foot;
      plate(foot, m.dark, [fw, fh * 0.48, fd], [0, -fh * 0.75, fd * 0.20], 1);
      plate(foot, m.primary, [fw * 0.9, fh * 0.65, fd * 0.88], [0, -fh * 0.40, fd * 0.23], 0.93);
      plate(foot, m.trim, [fw * 0.86, fh * 0.30, fd * 0.27], [0, -fh * 0.55, fd * 0.57]);
      for (const offset of [-0.23, 0.23]) {
        plate(foot, m.dark, [0.015, 0.014, fd * 0.58], [offset * fw, -fh * 0.05, fd * 0.23]);
      }
      fasteners(lower, m.trim, forearmWidth, p.lowerArmLength * 0.7, p.armWidth * 0.85, -p.lowerArmLength * 0.47);
    }

    for (const name of R15_PART_NAMES) weldPart(parts[name]);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    root.scale.setScalar(p.height / (bounds.max.y - bounds.min.y));
    root.updateMatrixWorld(true);
    root.position.y -= new THREE.Box3().setFromObject(root).min.y;
    root.userData.visualHeight = p.height;
    root.userData.partCount = 15;
    return { root, parts, materials };
  }

  static headFeature(head, p, m, style) {
    const [w, h, d] = p.head;
    cylinder(head, m.trim, w * 0.25, 0.10, [0, 0.015, 0]);
    plate(head, m.primary, [w, h * 0.9, d], [0, h * 0.55, 0], style === 'forge' ? 0.97 : 0.65);
    plate(head, m.dark, [w * 0.84, h * 0.37, 0.065], [0, h * 0.60, d * 0.5], 0.8);
    if (style === 'forge') {
      cylinder(head, m.trim, w * 0.18, 0.04, [0, h * 0.63, d * 0.56], 'z');
      cylinder(head, m.light, w * 0.105, 0.047, [0, h * 0.63, d * 0.59], 'z');
    } else {
      for (const s of [-1, 1]) plate(head, m.light, [w * 0.30, h * 0.07, 0.025],
        [s * w * 0.23, h * 0.64, d * 0.5 + 0.046], 0.8, [0, 0, s * (style === 'vanta' ? 0.15 : 0.06)]);
    }
    plate(head, m.secondary, [w * 0.75, h * 0.23, d * 0.46], [0, h * 0.29, d * 0.33], 0.65);
    if (style === 'forge' || style === 'volt') {
      for (let i = -1; i <= 1; i++) plate(head, m.trim, [w * 0.085, h * 0.15, 0.02], [i * w * 0.16, h * 0.28, d * 0.58]);
    } else {
      plate(head, style === 'aegis' ? m.primary : m.secondary, [w * 0.42, h * 0.40, 0.055], [0, h * 0.30, d * 0.57], 0.18);
      plate(head, m.accent, [w * 0.055, h * 0.24, 0.018], [0, h * 0.32, d * 0.69], 0.6);
    }
    if (style === 'aegis') plate(head, m.accent, [w * 0.18, h * 0.27, d * 0.9], [0, h * 0.96, 0]);
    if (style === 'vanta' || style === 'mantis') for (const s of [-1, 1]) {
      plate(head, m.secondary, [w * 0.18, h * 0.72, d * 0.55], [s * w * 0.50, h * 0.90, -d * 0.2], 0.3, [-0.28, 0, s * -0.25]);
      plate(head, m.accent, [0.02, h * 0.5, 0.035], [s * w * 0.52, h * 0.92, d * 0.08], 0.6, [0, 0, s * -0.25]);
    }
    for (const s of [-1, 1]) cylinder(head, m.trim, h * 0.16, 0.045, [s * w * 0.51, h * 0.54, 0], 'x');
  }

  static chestFeature(chest, p, m, style) {
    const y = p.upperTorsoHeight * 0.53, z = p.torsoDepth * 0.63;
    if (style === 'forge') {
      plate(chest, m.dark, [0.24, 0.25, 0.05], [0, y, z]);
      for (let i = -1; i <= 1; i++) plate(chest, m.light, [0.033, 0.17, 0.02], [i * 0.065, y, z + 0.035]);
      for (const s of [-1, 1]) {
        cylinder(chest, m.secondary, 0.075, 0.55, [s * p.shoulderWidth * 0.27, y + 0.2, -p.torsoDepth * 0.68]);
        for (let i = 0; i < 5; i++) cylinder(chest, m.trim, 0.09, 0.026, [s * p.shoulderWidth * 0.27, y + i * 0.09, -p.torsoDepth * 0.68]);
      }
    } else if (style === 'aegis') {
      plate(chest, m.accent, [0.13, 0.35, 0.055], [0, y, z], 0.45);
      plate(chest, m.light, [0.035, 0.18, 0.025], [0, y + 0.04, z + 0.04]);
    } else if (style === 'vanta') {
      plate(chest, m.accent, [0.13, 0.30, 0.05], [0, y, z], 0.13);
      plate(chest, m.light, [0.025, 0.17, 0.02], [0, y + 0.03, z + 0.04]);
    } else {
      ring(chest, m.trim, 0.105, 0.026, [0, y, z]);
      cylinder(chest, m.dark, 0.088, 0.04, [0, y, z], 'z');
      ring(chest, m.light, 0.068, 0.012, [0, y, z + 0.03]);
      plate(chest, m.accent, [0.07, 0.12, 0.02], [0, y, z + 0.02]);
    }
  }

  static armFeature(upper, lower, p, m, style, s) {
    if (style === 'forge') {
      ring(lower, m.trim, p.armWidth * 0.50, 0.025, [s * p.armWidth * 0.95, -p.lowerArmLength * 0.43, 0], 'x');
      cylinder(lower, m.accent, p.armWidth * 0.36, 0.045, [s * p.armWidth * 0.96, -p.lowerArmLength * 0.43, 0], 'x');
    } else if (style === 'aegis') {
      for (const z of [-1, 1]) {
        plate(upper, m.primary, [p.armWidth * 1.6, p.upperArmLength * 0.55, 0.07], [s * p.armWidth * 0.4, 0.065, z * p.armWidth * 0.82], 0.95);
        plate(upper, m.accent, [p.armWidth * 1.3, 0.026, 0.02], [s * p.armWidth * 0.4, 0.15, z * p.armWidth * 1.02], 0.9);
      }
      plate(lower, m.primary, [p.armWidth * 2.05, p.lowerArmLength * 0.95, 0.075], [0, -p.lowerArmLength * 0.40, p.armWidth], 0.63);
      plate(lower, m.accent, [0.065, p.lowerArmLength * 0.62, 0.02], [0, -p.lowerArmLength * 0.40, p.armWidth + 0.06]);
    } else if (style === 'volt') {
      for (let i = 0; i < 2; i++) {
        cylinder(upper, m.secondary, 0.055, 0.25, [s * p.armWidth * (0.65 + i * 0.48), -0.07, -p.armWidth * 0.5]);
        ring(upper, m.light, 0.051, 0.009, [s * p.armWidth * (0.65 + i * 0.48), 0.06, -p.armWidth * 0.5], 'y');
      }
    } else {
      plate(lower, m.accent, [0.045, p.lowerArmLength * 0.85, p.armWidth * 1.8],
        [s * p.armWidth * 0.84, -p.lowerArmLength * 0.43, -p.armWidth * 0.22], 0.5, [0.18, 0, s * -0.13]);
      if (style === 'mantis') {
        plate(upper, m.primary, [p.armWidth * 0.9, 0.38, p.armWidth * 1.7], [s * p.armWidth * 0.85, 0.13, -0.04], 0.15, [0, 0, s * -0.35]);
        plate(upper, m.accent, [0.025, 0.26, 0.025], [s * p.armWidth * 0.98, 0.17, p.armWidth * 0.65], 0.9, [0, 0, s * -0.35]);
      }
    }
  }
}
