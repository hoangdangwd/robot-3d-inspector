import * as THREE from 'three';
window.THREE = THREE;
import { FightingStage } from './arena/FightingStage.js';
import { LightingManager } from './arena/LightingManager.js';
import { AtmosphereFX } from './arena/AtmosphereFX.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { ModelManager } from './loaders/ModelManager.js';
import { Fighter } from './combat/Fighter.js';
import { FightCameraController } from './camera/FightCameraController.js';
import { CombatHUD } from './ui/CombatHUD.js';

class RobotShowcaseApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.timer = new THREE.Timer();

    // FPS calculation
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.currentFps = 60;

    this.initThree();
    this.initAudio();
    this.initScene();
    this.initHUD();
    this.loadInitialModel();
    this.bindWindowEvents();
  }

  initThree() {
    // 1. Direct WebGL Renderer with Native Anti-Aliasing, PCF Soft Shadows & ACES Tone Mapping
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false,
      stencil: false,
      depth: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 2. Realistic Arena Scene & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1014);
    this.scene.fog = new THREE.FogExp2(0x0e1014, 0.015);

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 2.2, 4.8);
  }

  initAudio() {
    this.sound = new SoundEngine();
  }

  initScene() {
    // 1. Realistic Combat Stage (Platform surface at Y = 1.0)
    this.stage = new FightingStage(this.scene);

    // 2. Realistic Arena Lighting
    this.lighting = new LightingManager(this.scene);

    // 3. Lightweight Atmosphere
    this.atmosphere = new AtmosphereFX(this.scene);

    // 4. Orbit Camera Controller (Free 360 inspection)
    this.cameraController = new FightCameraController(
      this.camera,
      this.renderer.domElement,
      null,
      null
    );

    // 5. Model Loader
    this.modelManager = new ModelManager();
  }

  initHUD() {
    this.hud = new CombatHUD({
      onSelectClip: (key) => this.handleSelectClip(key),
      onScrub: (frac) => this.handleScrub(frac),
      onTogglePlay: () => this.handleTogglePlay(),
      onStepFrame: (delta) => this.handleStepFrame(delta),
      onSpeedChange: (speed) => this.handleSpeedChange(speed),
      onLoopToggle: (loop) => this.handleLoopToggle(loop),
      onInPlaceToggle: (inPlace) => this.handleInPlaceToggle(inPlace),
      onResetCamera: () => this.cameraController.setMode('FRONT'),
      onTurntableToggle: () => this.cameraController.toggleTurntable(),
      onModelChange: (modelId) => this.switchModel(modelId),
      onFileDrop: (file) => this.loadDroppedModel(file)
    });

    this.hud.populateModelCatalog(this.modelManager.modelsCatalog, '2_animated');
  }

  async loadInitialModel() {
    console.log('[RobotShowcase] Starting initial model load...');
    const loadingStatus = document.getElementById('loading-status');
    const loadingOverlay = document.getElementById('loading-overlay');

    try {
      if (loadingStatus) loadingStatus.textContent = 'Nạp mô hình @animated/2_animated.glb...';

      // Load the latest user-retargeted model from @animated/
      const initialItem = this.modelManager.modelsCatalog[0];
      await this.loadModelInternal(initialItem.path, initialItem.name);

      // Dismiss loading overlay
      if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => loadingOverlay.remove(), 400);
      }

      this.sound.playGong();
      this.hud.showToast(`Robot "${initialItem.name}" đã sẵn sàng!`);

      // Start render loop
      this.animate();

    } catch (err) {
      console.error('Failed to load initial model:', err);
      if (loadingStatus) loadingStatus.textContent = `Lỗi nạp mô hình: ${err.message}`;
    }
  }

  async loadModelInternal(path, displayName, modelId = null) {
    const { gltf, stats } = await this.modelManager.loadModel(path);

    // Remove existing fighter if any
    if (this.fighter) {
      this.scene.remove(this.fighter.group);
      this.fighter.dispose?.();
    }

    // Centered exactly in the middle of the octagon stage (Y = 1.0 is ring surface)
    this.fighter = new Fighter(gltf, {
      name: displayName,
      isPlayer: true,
      initialPos: new THREE.Vector3(0, 1.0, 0),
      facingAngle: 0
    });
    this.scene.add(this.fighter.group);

    // Update Camera focus on this single fighter
    this.cameraController.setFighters(this.fighter, null);

    // Populate HUD model, animations and specs
    if (modelId) {
      this.hud.populateModelCatalog(this.modelManager.modelsCatalog, modelId);
    }
    this.hud.populateClipList(this.fighter.clipList, this.fighter.currentClipName);
    this.hud.updateModelSpecs(stats);
  }

  async switchModel(modelId) {
    const item = this.modelManager.modelsCatalog.find(m => m.id === modelId);
    if (!item) return;

    this.hud.showToast(`Đang nạp ${item.name}...`);

    try {
      await this.loadModelInternal(item.path, item.name, item.id);
      this.sound.playGong();
      this.hud.showToast(`Đã nạp: ${item.name}`);
    } catch (e) {
      console.error(`Failed to switch model to ${item.name}:`, e);
      this.hud.showToast(`Lỗi nạp: ${e.message}`);
    }
  }

  async loadDroppedModel(file) {
    try {
      this.hud.showToast(`Đang phân tích file: ${file.name}...`);
      const { gltf, stats, fileName, customItem } = await this.modelManager.loadFromFile(file);

      if (this.fighter) {
        this.scene.remove(this.fighter.group);
        this.fighter.dispose?.();
      }

      this.fighter = new Fighter(gltf, {
        name: fileName,
        isPlayer: true,
        initialPos: new THREE.Vector3(0, 1.0, 0),
        facingAngle: 0
      });
      this.scene.add(this.fighter.group);

      this.cameraController.setFighters(this.fighter, null);
      if (customItem) {
        this.hud.populateModelCatalog(this.modelManager.modelsCatalog, customItem.id);
      }
      this.hud.populateClipList(this.fighter.clipList, this.fighter.currentClipName);
      this.hud.updateModelSpecs(stats);
      this.sound.playGong();
      this.hud.showToast(`Đã nạp: ${fileName}`);

    } catch (e) {
      console.error('Failed to parse dropped GLB:', e);
      alert(`Không thể đọc file 3D: ${e.message}`);
    }
  }

  handleSelectClip(clipKey) {
    if (!this.fighter) return;
    this.sound.ensureContext();
    this.fighter.playAnimation(clipKey, { crossFade: 0.2 });
    this.sound.playWhoosh(1.0);
  }

  handleScrub(frac) {
    if (!this.fighter) return;
    const dur = this.fighter.getDuration();
    this.fighter.scrubToTime(frac * dur);
  }

  handleTogglePlay() {
    if (!this.fighter) return false;
    return this.fighter.togglePlayPause();
  }

  handleStepFrame(deltaFrames) {
    if (!this.fighter) return;
    this.fighter.pause();
    this.fighter.stepFrame(deltaFrames, 30);
  }

  handleSpeedChange(speed) {
    if (!this.fighter) return;
    this.fighter.setPlaybackSpeed(speed);
  }

  handleLoopToggle(loop) {
    if (!this.fighter) return;
    this.fighter.setLoop(loop);
  }

  handleInPlaceToggle(inPlace) {
    if (!this.fighter) return;
    this.fighter.setInPlace(inPlace);
  }

  bindWindowEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Start audio context on user interaction
    window.addEventListener('pointerdown', () => {
      this.sound.ensureContext();
    }, { once: true });
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    this.timer.update();
    const delta = Math.min(0.1, this.timer.getDelta());
    const time = this.timer.getElapsed();

    // Calculate live FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.currentFps = (this.frameCount * 1000) / (now - this.lastFpsTime);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    // 1. Stage & Lighting Update (fast zero-overhead)
    this.stage.update(delta, time);
    this.lighting.update(delta, time);
    this.atmosphere.update(delta, time);

    // 2. Active Fighter Animation & Ground Clamping
    if (this.fighter) {
      this.fighter.update(delta);
    }

    // 3. Orbit Camera (Damping, turntable rotation)
    this.cameraController.update(delta);

    // 4. HUD State Sync (Timeline scrubber position, duration, frame index, FPS)
    if (this.hud && this.fighter) {
      const fighterState = {
        currentTime: this.fighter.getCurrentTime(),
        duration: this.fighter.getDuration(),
        frameIndex: this.fighter.getFrameIndex(30),
        totalFrames: this.fighter.getTotalFrames(30)
      };
      this.hud.update(fighterState, this.currentFps);
    }

    // 5. Direct Single-Pass WebGL Render (Instant 60+ FPS, native hardware MSAA anti-aliasing)
    this.renderer.render(this.scene, this.camera);
  };
}

// Instantiate application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.__app = new RobotShowcaseApp();
});
