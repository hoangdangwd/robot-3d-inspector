/**
 * Streamlined 3D Model & Animation Inspector HUD
 * Minimalist, ultra-responsive, zero lag, and zero unnecessary visual clutter.
 */
export class CombatHUD {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onSelectClip = options.onSelectClip || (() => {});
    this.onAttack = options.onAttack || this.onSelectClip;
    this.onScrub = options.onScrub || (() => {});
    this.onTogglePlay = options.onTogglePlay || (() => {});
    this.onStepFrame = options.onStepFrame || (() => {});
    this.onSpeedChange = options.onSpeedChange || (() => {});
    this.onLoopToggle = options.onLoopToggle || (() => {});
    this.onInPlaceToggle = options.onInPlaceToggle || (() => {});
    this.onResetCamera = options.onResetCamera || (() => {});
    this.onTurntableToggle = options.onTurntableToggle || (() => {});
    this.onModelChange = options.onModelChange || (() => {});
    this.onFileDrop = options.onFileDrop || (() => {});

    this.isScrubbing = false;
    this.isPlaying = true;
    this.isTurntableActive = false;
    this.isLooping = true;
    this.isInPlace = true;

    this.createDOM();
    this.initEventListeners();
    this.initKeyboardListeners();
    this.initDragDrop();
  }

  createDOM() {
    this.root = document.createElement('div');
    this.root.id = 'model-inspector-hud';
    this.root.innerHTML = `
      <!-- TOP BAR: Minimal Info & Quick Actions -->
      <header class="inspector-top-bar">
        <div class="top-left-info">
          <div class="model-title" id="active-model-name">UNIT-02 Axelrod (@animated/2_animated.glb)</div>
          <div class="model-specs-row">
            <span class="spec-pill" id="spec-fps">60 FPS</span>
            <span class="spec-pill"><span id="spec-triangles">6,768</span> tris</span>
            <span class="spec-pill"><span id="spec-bones">35</span> bones</span>
            <span class="spec-pill" id="spec-rig-type" style="display:none;"></span>
            <span id="spec-vertices" style="display:none;"></span>
            <span id="spec-meshes" style="display:none;"></span>
            <span id="spec-materials" style="display:none;"></span>
          </div>
        </div>

        <div class="top-right-controls">
          <!-- Model Select -->
          <div class="clip-selector-wrapper">
            <label for="model-select">MODEL:</label>
            <select id="model-select" class="hud-select" title="Chọn model"></select>
          </div>

          <!-- Animation Clip Select -->
          <div class="clip-selector-wrapper">
            <label for="clip-select">ĐỘNG TÁC:</label>
            <select id="clip-select" class="hud-select" title="Chọn Animation"></select>
          </div>

          <!-- Utility Toggles -->
          <button class="hud-btn" id="btn-toggle-turntable" title="Xoay 360 tự động [T]">
            🔄 Xoay 360°
          </button>
          <button class="hud-btn" id="btn-reset-camera" title="Đặt lại góc nhìn [O]">
            📷 Reset Cam
          </button>
        </div>
      </header>

      <!-- DRAG OVERLAY -->
      <div class="drop-overlay" id="drop-overlay">
        <div class="drop-modal">
          <span class="drop-icon">📥</span>
          <span>Thả file <strong>.GLB</strong> để nạp vào võ đài...</span>
        </div>
      </div>

      <!-- TOAST NOTIFICATION -->
      <div class="toast-notification" id="toast-notify">
        <span id="toast-message">Ready</span>
      </div>

      <!-- BOTTOM PLAYBACK & SCRUBBER BAR -->
      <footer class="bottom-playback-bar">
        <!-- Controls Left -->
        <div class="pb-left">
          <button class="pb-icon-btn" id="btn-step-prev" title="Lùi 1 frame [←]">◀</button>
          <button class="pb-icon-btn primary" id="btn-play-pause" title="Phát / Tạm dừng [Space]">⏸</button>
          <button class="pb-icon-btn" id="btn-step-next" title="Tiến 1 frame [→]">▶</button>

          <div class="pb-clip-info">
            <div class="clip-title" id="active-clip-name">Đang nạp animation...</div>
            <div class="clip-timer" id="active-clip-time">0.00s / 0.00s</div>
            <span id="active-clip-icon" style="display:none;"></span>
          </div>
        </div>

        <!-- Scrubber Center -->
        <div class="pb-center">
          <div class="scrubber-wrapper">
            <div class="scrubber-fill" id="scrubber-progress"></div>
            <input type="range" id="timeline-slider" min="0" max="1000" value="0" step="1" title="Kéo để tua animation" />
          </div>
        </div>

        <!-- Options Right -->
        <div class="pb-right">
          <!-- Speed Chips -->
          <div class="speed-group">
            <button class="speed-chip" data-speed="0.25">0.25x</button>
            <button class="speed-chip" data-speed="0.5">0.5x</button>
            <button class="speed-chip active" data-speed="1.0">1.0x</button>
            <button class="speed-chip" data-speed="2.0">2.0x</button>
          </div>

          <!-- Loop & In-Place -->
          <button class="badge-btn active" id="btn-toggle-loop" title="Lặp lại animation">🔁 Lặp</button>
          <button class="badge-btn active" id="btn-toggle-inplace" title="Khóa di chuyển vị trí">⚓ Cố định</button>
        </div>
      </footer>
    `;

    this.container.appendChild(this.root);
  }

  initEventListeners() {
    // 1. Play / Pause
    const btnPlayPause = document.getElementById('btn-play-pause');
    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', () => {
        this.isPlaying = this.onTogglePlay();
        btnPlayPause.textContent = this.isPlaying ? '⏸' : '▶';
      });
    }

    // 2. Step Prev / Next
    const btnStepPrev = document.getElementById('btn-step-prev');
    const btnStepNext = document.getElementById('btn-step-next');
    if (btnStepPrev) {
      btnStepPrev.addEventListener('click', () => {
        this.isPlaying = false;
        if (btnPlayPause) btnPlayPause.textContent = '▶';
        this.onStepFrame(-1);
      });
    }
    if (btnStepNext) {
      btnStepNext.addEventListener('click', () => {
        this.isPlaying = false;
        if (btnPlayPause) btnPlayPause.textContent = '▶';
        this.onStepFrame(1);
      });
    }

    // 3. Timeline Scrubber
    const slider = document.getElementById('timeline-slider');
    if (slider) {
      slider.addEventListener('mousedown', () => { this.isScrubbing = true; });
      slider.addEventListener('touchstart', () => { this.isScrubbing = true; }, { passive: true });
      slider.addEventListener('input', (e) => {
        const frac = parseFloat(e.target.value) / 1000;
        const prog = document.getElementById('scrubber-progress');
        if (prog) prog.style.width = `${(frac * 100).toFixed(1)}%`;
        this.onScrub(frac);
      });
      const endScrub = () => { this.isScrubbing = false; };
      window.addEventListener('mouseup', endScrub);
      window.addEventListener('touchend', endScrub);
    }

    // 4. Speed Chips
    document.querySelectorAll('.speed-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.speed-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const speed = parseFloat(chip.dataset.speed || 1.0);
        this.onSpeedChange(speed);
      });
    });

    // 5. Loop Toggle
    const btnLoop = document.getElementById('btn-toggle-loop');
    if (btnLoop) {
      btnLoop.addEventListener('click', () => {
        this.isLooping = !this.isLooping;
        btnLoop.classList.toggle('active', this.isLooping);
        this.onLoopToggle(this.isLooping);
      });
    }

    // 6. In-Place Toggle
    const btnInPlace = document.getElementById('btn-toggle-inplace');
    if (btnInPlace) {
      btnInPlace.addEventListener('click', () => {
        this.isInPlace = !this.isInPlace;
        btnInPlace.classList.toggle('active', this.isInPlace);
        this.onInPlaceToggle(this.isInPlace);
      });
    }

    // 7. Model Select Dropdown
    const modelSelect = document.getElementById('model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        this.onModelChange(e.target.value);
      });
    }

    // 8. Clip Select Dropdown
    const clipSelect = document.getElementById('clip-select');
    if (clipSelect) {
      clipSelect.addEventListener('change', (e) => {
        this.onSelectClip(e.target.value);
      });
    }

    // 9. Turntable Toggle
    const btnTurntable = document.getElementById('btn-toggle-turntable');
    if (btnTurntable) {
      btnTurntable.addEventListener('click', () => {
        this.isTurntableActive = this.onTurntableToggle();
        btnTurntable.classList.toggle('active', this.isTurntableActive);
      });
    }

    // 10. Reset Camera
    const btnResetCam = document.getElementById('btn-reset-camera');
    if (btnResetCam) {
      btnResetCam.addEventListener('click', () => {
        this.onResetCamera();
        if (btnTurntable) {
          btnTurntable.classList.remove('active');
          this.isTurntableActive = false;
        }
      });
    }
  }

  initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // Avoid hotkeys when typing in inputs/selects
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.isPlaying = this.onTogglePlay();
          const btn = document.getElementById('btn-play-pause');
          if (btn) btn.textContent = this.isPlaying ? '⏸' : '▶';
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.isPlaying = false;
          this.onStepFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.isPlaying = false;
          this.onStepFrame(1);
          break;
        case 'KeyT':
          document.getElementById('btn-toggle-turntable')?.click();
          break;
        case 'KeyO':
          document.getElementById('btn-reset-camera')?.click();
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5': {
          const idx = parseInt(e.key, 10) - 1;
          const select = document.getElementById('clip-select');
          if (select && select.options[idx]) {
            select.selectedIndex = idx;
            this.onSelectClip(select.options[idx].value);
          }
          break;
        }
      }
    });
  }

  initDragDrop() {
    const overlay = document.getElementById('drop-overlay');

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (overlay) overlay.classList.add('visible');
    });

    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null && overlay) {
        overlay.classList.remove('visible');
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (overlay) overlay.classList.remove('visible');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (/\.(glb|gltf)$/i.test(file.name)) {
          this.onFileDrop(file);
        } else {
          this.showToast('Vui lòng chọn định dạng file .GLB hoặc .GLTF');
        }
      }
    });
  }

  populateModelCatalog(catalog, selectedId) {
    const titleEl = document.getElementById('active-model-name');
    const select = document.getElementById('model-select');
    const cur = catalog.find(m => m.id === selectedId) || catalog[0];

    if (select) {
      select.innerHTML = '';
      catalog.forEach((model) => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.name;
        opt.selected = model.id === (cur && cur.id);
        select.appendChild(opt);
      });
    }

    if (titleEl && cur) {
      titleEl.textContent = cur.path ? `${cur.name} (${cur.path})` : cur.name;
    }

    const rigTypeEl = document.getElementById('spec-rig-type');
    if (rigTypeEl) {
      const isR15 = cur && /r15/i.test(`${cur.id || ''} ${cur.category || ''} ${cur.name || ''}`);
      rigTypeEl.textContent = isR15 ? 'R15 RIG' : '';
      rigTypeEl.style.display = isR15 ? '' : 'none';
    }
  }

  populateClipList(clipList, activeKey) {
    const select = document.getElementById('clip-select');
    if (!select) return;

    select.innerHTML = '';
    clipList.forEach((clip, i) => {
      const opt = document.createElement('option');
      opt.value = clip.key;
      opt.textContent = `[${i + 1}] ${clip.label || clip.rawName} (${clip.duration.toFixed(2)}s)`;
      if (clip.key === activeKey) opt.selected = true;
      select.appendChild(opt);
    });

    const activeItem = clipList.find(c => c.key === activeKey) || clipList[0];
    if (activeItem) {
      this.updateActiveClipInfo(activeItem);
    }
  }

  updateActiveClipInfo(item) {
    const nameEl = document.getElementById('active-clip-name');
    if (nameEl && item) {
      nameEl.textContent = item.label || item.rawName || 'Combat Action';
    }
  }

  updateModelSpecs(stats) {
    if (!stats) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('spec-triangles', Number(stats.triangles || 0).toLocaleString());
    set('spec-vertices', Number(stats.vertices || 0).toLocaleString());
    set('spec-bones', stats.bonesCount || '--');
    set('spec-meshes', stats.meshes || '--');
    set('spec-materials', `${stats.materialsCount || 0}`);
  }

  update(fighterState, currentFps) {
    if (!fighterState) return;
    const { currentTime, duration, frameIndex, totalFrames } = fighterState;

    // Time text
    const timerEl = document.getElementById('active-clip-time');
    if (timerEl && duration > 0) {
      const curSec = currentTime.toFixed(2);
      const durSec = duration.toFixed(2);
      const curF = frameIndex !== undefined ? frameIndex : Math.floor(currentTime * 30);
      const totF = totalFrames !== undefined ? totalFrames : Math.round(duration * 30);
      timerEl.textContent = `${curSec}s / ${durSec}s  •  Frame ${curF} / ${totF}`;
    }

    // Scrubber update
    if (!this.isScrubbing && duration > 0) {
      const frac = Math.max(0, Math.min(1, currentTime / duration));
      const slider = document.getElementById('timeline-slider');
      const prog = document.getElementById('scrubber-progress');
      if (slider) slider.value = Math.round(frac * 1000);
      if (prog) prog.style.width = `${(frac * 100).toFixed(1)}%`;
    }

    // FPS badge
    if (currentFps !== undefined) {
      const fpsEl = document.getElementById('spec-fps');
      if (fpsEl) fpsEl.textContent = `${Math.round(currentFps)} FPS`;
    }
  }

  showToast(message, duration = 2000) {
    const toast = document.getElementById('toast-notify');
    const msg = document.getElementById('toast-message');
    if (toast && msg) {
      msg.textContent = message;
      toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
      }, duration);
    }
  }

  showAnnouncement(title, sub, duration = 1500) {
    this.showToast(`${title} — ${sub}`, duration);
  }
}
