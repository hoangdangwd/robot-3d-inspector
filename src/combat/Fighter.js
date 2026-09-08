import * as THREE from 'three';

export class Fighter {
  constructor(gltf, options = {}) {
    this.gltf = gltf;
    this.name = options.name || 'UNIT-10';
    this.isPlayer = options.isPlayer ?? true;
    this.platformY = 1.0; // Arena mat level

    this.group = new THREE.Group();
    this.group.name = `Fighter_${this.name}`;

    this.root = gltf.scene;
    this.group.add(this.root);

    this.animations = gltf.animations || [];
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = new Map();
    this.currentAction = null;
    this.currentClipName = null;

    this.playbackSpeed = 1.0;
    this.isPaused = false;
    this.loopEnabled = true;
    this.inPlaceMode = true;

    this.hp = 1000;
    this.maxHp = 1000;
    this.isHit = false;
    this.hitTimer = 0;

    // Materials backup for wireframe/clay/normals toggling
    this.originalMaterials = new Map();
    this.skinnedMeshes = [];
    this.bones = [];

    // Temporary vectors for bone & ground calculations
    this.tmpV1 = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
    this.tmpV3 = new THREE.Vector3();
    this.tmpV4 = new THREE.Vector3();
    this.baseRootY = 0;

    this.initHierarchyAndMaterials();
    this.normalizeModelScaleAndPosition(options.initialPos || new THREE.Vector3(0, 0, 0));
    this.initAnimationClips();
    this.initHitboxes();

    if (options.facingAngle !== undefined) {
      this.group.rotation.y = options.facingAngle;
    }
  }

  initHierarchyAndMaterials() {
    this.root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.isSkinnedMesh) {
          this.skinnedMeshes.push(child);
        }

        // Save original material for inspection toggles
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m, idx) => {
              this.originalMaterials.set(`${child.uuid}_${idx}`, m);
              m.roughness = Math.min(0.85, m.roughness || 0.5);
              m.metalness = Math.max(0.2, m.metalness || 0.0);
            });
          } else {
            this.originalMaterials.set(child.uuid, child.material);
            child.material.roughness = Math.min(0.85, child.material.roughness || 0.5);
            child.material.metalness = Math.max(0.2, child.material.metalness || 0.0);
          }
        }
      } else if (child.isBone) {
        this.bones.push(child);
      }
    });

    // Find main tracking bones (Hips, Head, Hands, Feet, Toes)
    this.hipsBone = this.bones.find(b => /humanoidrootpart|lowertorso|rootjoint|hips|pelvis|spine/i.test(b.name)) || this.bones[0];
    this.headBone = this.bones.find(b => /head|neck/i.test(b.name));
    this.rightHandBone = this.bones.find(b => /righthand|hand\.r|hand_r/i.test(b.name));
    this.leftHandBone = this.bones.find(b => /lefthand|hand\.l|hand_l/i.test(b.name));
    this.leftFootBone = this.bones.find(b => /mixamorigleftfoot|leftfoot|foot\.l|foot_l/i.test(b.name));
    this.rightFootBone = this.bones.find(b => /mixamorigrightfoot|rightfoot|foot\.r|foot_r/i.test(b.name));
    this.leftToeBone = this.bones.find(b => /mixamoriglefttoebase|lefttoebase|lefttoe|toe\.l|toe_l/i.test(b.name));
    this.rightToeBone = this.bones.find(b => /mixamorigrighttoebase|righttoebase|righttoe|toe\.r|toe_r/i.test(b.name));
  }

  normalizeModelScaleAndPosition(initialPos) {
    const box = new THREE.Box3().setFromObject(this.root);
    const size = box.getSize(new THREE.Vector3());

    // Desired fighter height ~2.1m (Real Steel combat robot scale)
    const targetHeight = 2.1;
    if (size.y > 0.01) {
      const scaleFactor = targetHeight / size.y;
      this.root.scale.multiplyScalar(scaleFactor);
    }

    // Re-calculate box after scale
    const scaledBox = new THREE.Box3().setFromObject(this.root);
    // Align base to Y=0 inside the local group
    this.root.position.y -= scaledBox.min.y;

    // Center X and Z
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    this.root.position.x -= scaledCenter.x;
    this.root.position.z -= scaledCenter.z;

    // Position group on arena platform
    this.group.position.copy(initialPos);
    this.group.position.y = this.platformY;

    this.baseRootY = this.root.position.y;
    this.initialLocalHipsPos = this.hipsBone ? this.hipsBone.position.clone() : new THREE.Vector3();
  }

  initAnimationClips() {
    this.clipList = [];
    this.actions.clear();

    const getMeta = (rawName, index) => {
      const name = (rawName || '').trim();
      const lower = name.toLowerCase();

      if (lower.includes('elbow') || lower.includes('combo')) {
        return { label: 'Elbow Uppercut Combo', key: 'elbow', icon: '🥊', priority: 1 };
      }
      if (lower.includes('crescent') || lower.includes('inside')) {
        return { label: 'Inside Crescent Kick', key: 'inside', icon: '🥋', priority: 2 };
      }
      if (lower.includes('punching1') || lower.includes('punching_1') || lower.includes('punch_1') || lower.includes('jab')) {
        return { label: 'Punching1', key: 'punch_1', icon: '👊', priority: 3 };
      }
      if (lower.includes('punching2') || lower.includes('punching_2') || lower.includes('punch_2') || lower.includes('hook')) {
        return { label: 'Punching2', key: 'punch_2', icon: '💥', priority: 4 };
      }
      if (lower.includes('roundhouse')) {
        return { label: 'Roundhouse Kick', key: 'roundhouse', icon: '🌪️', priority: 5 };
      }

      // Exact fallback matching by raw name if any
      const clean = name.replace(/[_\.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { label: clean || `Clip ${index + 1}`, key: `clip_${index}`, icon: '⚔️', priority: 10 + index };
    };

    // Sort animations according to requested order: elbow (1), inside (2), punch 1 (3), punch 2 (4), roundhouse (5)
    const parsedClips = this.animations.map((clip, index) => ({
      clip,
      meta: getMeta(clip.name, index),
      originalIndex: index
    }));
    parsedClips.sort((a, b) => a.meta.priority - b.meta.priority);

    parsedClips.forEach((item, index) => {
      const { clip, meta } = item;
      let uniqueKey = meta.key;
      let counter = 1;
      while (this.actions.has(uniqueKey)) {
        uniqueKey = `${meta.key}_${counter++}`;
      }

      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(1.0);

      const shortcut = `${index + 1}`;
      const finalMeta = { ...meta, key: uniqueKey, shortcut, index };

      const actionEntry = { action, clip, meta: finalMeta, index };
      this.actions.set(uniqueKey, actionEntry);

      // Aliases for compatibility
      if (uniqueKey === 'elbow') this.actions.set('elbow_combo', actionEntry);
      if (uniqueKey === 'inside') this.actions.set('crescent_kick', actionEntry);
      if (uniqueKey === 'punch_1') {
        this.actions.set('punching1', actionEntry);
        this.actions.set('punching_1', actionEntry);
      }
      if (uniqueKey === 'punch_2') {
        this.actions.set('punching2', actionEntry);
        this.actions.set('punching_2', actionEntry);
      }
      if (uniqueKey === 'roundhouse') this.actions.set('roundhouse_kick', actionEntry);

      this.clipList.push({
        key: uniqueKey,
        rawName: clip.name,
        label: meta.label,
        duration: clip.duration,
        icon: meta.icon,
        shortcut,
        index
      });
    });

    // Default play first clip in requested order (Elbow)
    if (this.clipList.length > 0) {
      this.playAnimation(this.clipList[0].key, { crossFade: 0.1 });
    }
  }

  playAnimation(key, options = {}) {
    const entry = this.actions.get(key);
    if (!entry) return;

    const { action, clip, meta } = entry;
    const duration = options.crossFade ?? 0.25;

    if (this.currentAction && this.currentAction !== action) {
      action.reset();
      action.setLoop(this.loopEnabled ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !this.loopEnabled;
      action.play();
      this.currentAction.crossFadeTo(action, duration, true);
    } else {
      action.reset();
      action.setLoop(this.loopEnabled ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !this.loopEnabled;
      action.play();
    }

    this.currentAction = action;
    this.currentClipName = key;
    this.currentMeta = meta;
    this.currentClip = clip;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  togglePlayPause() {
    this.isPaused = !this.isPaused;
    return !this.isPaused;
  }

  scrubToTime(timeInSeconds) {
    if (!this.currentAction || !this.currentClip) return;
    const clamped = Math.max(0, Math.min(this.currentClip.duration, timeInSeconds));
    this.currentAction.time = clamped;
    this.mixer.update(0);
    this.updateGroundClamping();
  }

  stepFrame(deltaFrames = 1, fps = 30) {
    if (!this.currentAction || !this.currentClip) return;
    const stepTime = deltaFrames * (1.0 / fps);
    let newTime = this.currentAction.time + stepTime;
    if (newTime > this.currentClip.duration) newTime = 0;
    if (newTime < 0) newTime = this.currentClip.duration;
    this.currentAction.time = newTime;
    this.mixer.update(0);
    this.updateGroundClamping();
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = speed;
    this.mixer.timeScale = speed;
  }

  setLoop(loop) {
    this.loopEnabled = loop;
    if (this.currentAction) {
      this.currentAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      this.currentAction.clampWhenFinished = !loop;
    }
  }

  setInPlace(inPlace) {
    this.inPlaceMode = inPlace;
  }

  getCurrentTime() {
    return this.currentAction ? this.currentAction.time : 0;
  }

  getDuration() {
    return this.currentClip ? this.currentClip.duration : 0;
  }

  getFrameIndex(fps = 30) {
    if (!this.currentAction) return 0;
    return Math.floor(this.currentAction.time * fps);
  }

  getTotalFrames(fps = 30) {
    if (!this.currentClip) return 0;
    return Math.max(1, Math.round(this.currentClip.duration * fps));
  }

  /**
   * Hitboxes & Hurtboxes visualization for combat debugging
   */
  initHitboxes() {
    this.hitboxesGroup = new THREE.Group();
    this.hitboxesGroup.name = 'Hitboxes';
    this.hitboxesGroup.visible = false;
    this.group.add(this.hitboxesGroup);

    const makeSphere = (radius, color) => {
      const geo = new THREE.SphereGeometry(radius, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.65
      });
      return new THREE.Mesh(geo, mat);
    };

    // Attack Hitboxes (Fists & Feet)
    this.fistRMesh = makeSphere(0.18, 0xff0044); // Red
    this.fistLMesh = makeSphere(0.18, 0xff0044);
    this.footRMesh = makeSphere(0.22, 0xff8800); // Orange
    this.footLMesh = makeSphere(0.22, 0xff8800);

    // Body Hurtboxes (Head, Chest, Pelvis)
    this.headMesh = makeSphere(0.22, 0x00f0ff);  // Cyan
    this.chestMesh = makeSphere(0.35, 0x00ff88); // Green
    this.hipsMesh = makeSphere(0.32, 0x00aaff);

    this.hitboxesGroup.add(this.fistRMesh, this.fistLMesh, this.footRMesh, this.footLMesh);
    this.hitboxesGroup.add(this.headMesh, this.chestMesh, this.hipsMesh);
  }

  setHitboxesVisible(visible) {
    this.hitboxesGroup.visible = visible;
  }

  setSkeletonVisible(visible) {
    // Skeleton view removed per user request
  }

  setShadingMode(mode) {
    // Wireframe / custom shading removed per user request
  }

  /**
   * Returns world position of a combat bone (e.g. right hand, right foot, head)
   */
  getBoneWorldPosition(bone) {
    if (!bone) return this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const v = new THREE.Vector3();
    bone.getWorldPosition(v);
    return v;
  }

  getRightHandPos() {
    return this.getBoneWorldPosition(this.rightHandBone);
  }

  getLeftHandPos() {
    return this.getBoneWorldPosition(this.leftHandBone);
  }

  getRightFootPos() {
    return this.getBoneWorldPosition(this.rightFootBone);
  }

  getHeadPos() {
    return this.getBoneWorldPosition(this.headBone);
  }

  getChestPos() {
    if (this.hipsBone) {
      const p = this.getBoneWorldPosition(this.hipsBone);
      p.y += 0.45;
      return p;
    }
    return this.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
  }

  /**
   * Combat Hit Reaction (damage flash, recoil impulse, health decrement)
   */
  takeHit(damage, hitLocation, knockbackDir = new THREE.Vector3(1, 0, 0)) {
    this.hp = Math.max(0, this.hp - damage);
    this.isHit = true;
    this.hitTimer = 0.12;

    // Emissive red damage flash
    this.root.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissive.setHex(0xff0033);
        child.material.emissiveIntensity = 1.8;
      }
    });

    // Knockback impulse
    if (knockbackDir) {
      const impulse = knockbackDir.clone().normalize().multiplyScalar(0.08);
      this.group.position.add(impulse);
    }
  }

  /**
   * Dynamic Ground Clamping: prevents feet soles from penetrating below the arena platform surface.
   * If any animated foot bone drops below the stage floor, the character root is elevated so the sole rests on top.
   * If the character leaps into the air (e.g. flying hook/kick), the upward motion is fully preserved.
   */
  updateGroundClamping() {
    if (!this.leftToeBone && !this.rightToeBone && !this.leftFootBone && !this.rightFootBone) return;

    // Reset root to baseline to sample animated bone world positions accurately
    this.root.position.y = this.baseRootY;
    this.group.updateMatrixWorld(true);

    let lowestSoleY = Infinity;
    const soleThicknessToe = 0.115; // Measured distance from toe bone to boot sole bottom (with safety margin)
    const soleThicknessFoot = 0.220; // Measured distance from ankle joint to boot sole bottom

    if (this.leftToeBone) {
      this.leftToeBone.getWorldPosition(this.tmpV1);
      lowestSoleY = Math.min(lowestSoleY, this.tmpV1.y - soleThicknessToe);
    }
    if (this.rightToeBone) {
      this.rightToeBone.getWorldPosition(this.tmpV2);
      lowestSoleY = Math.min(lowestSoleY, this.tmpV2.y - soleThicknessToe);
    }
    if (this.leftFootBone) {
      this.leftFootBone.getWorldPosition(this.tmpV3);
      lowestSoleY = Math.min(lowestSoleY, this.tmpV3.y - soleThicknessFoot);
    }
    if (this.rightFootBone) {
      this.rightFootBone.getWorldPosition(this.tmpV4);
      lowestSoleY = Math.min(lowestSoleY, this.tmpV4.y - soleThicknessFoot);
    }

    const floorY = this.platformY; // 1.000 (arena mat level)
    if (lowestSoleY < floorY) {
      const penetration = floorY - lowestSoleY;
      this.root.position.y = this.baseRootY + penetration;
      this.group.updateMatrixWorld(true);
    }
  }

  update(delta) {
    // 1. Animation Mixer Update
    if (!this.isPaused) {
      this.mixer.update(delta);
    }

    // 2. In-Place Root Motion Locking (keeps fighter grounded horizontally on stage)
    if (this.inPlaceMode && this.hipsBone) {
      this.hipsBone.position.x = this.initialLocalHipsPos.x;
      this.hipsBone.position.z = this.initialLocalHipsPos.z;
    }

    // 3. Dynamic Ground Clamping (keeps boots strictly on top of arena floor)
    this.updateGroundClamping();

    // 4. Update Hitbox Spheres to match bone world positions
    if (this.hitboxesGroup && this.hitboxesGroup.visible) {
      if (this.rightHandBone) this.fistRMesh.position.copy(this.group.worldToLocal(this.getRightHandPos()));
      if (this.leftHandBone) this.fistLMesh.position.copy(this.group.worldToLocal(this.getLeftHandPos()));
      if (this.rightFootBone) this.footRMesh.position.copy(this.group.worldToLocal(this.getRightFootPos()));
      if (this.leftFootBone) this.footLMesh.position.copy(this.group.worldToLocal(this.getLeftFootPos()));
      if (this.headBone) this.headMesh.position.copy(this.group.worldToLocal(this.getHeadPos()));
      this.chestMesh.position.copy(this.group.worldToLocal(this.getChestPos()));
      if (this.hipsBone) this.hipsMesh.position.copy(this.group.worldToLocal(this.getBoneWorldPosition(this.hipsBone)));
    }

    // 5. Update Hit Flash Decay
    if (this.isHit) {
      this.hitTimer -= delta;
      if (this.hitTimer <= 0) {
        this.isHit = false;
        this.root.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0.0;
          }
        });
      }
    }
  }
}
