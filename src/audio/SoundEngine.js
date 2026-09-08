/**
 * Procedural Web Audio Engine for AAA 3D Fighting Game
 * Generates all SFX and music in real time using the Web Audio API.
 * 100% offline, zero missing audio assets, instant loading.
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmInterval = null;
    this.step = 0;
    this.bpm = 128;
    this.enabled = true;

    this.initOnUserGesture();
  }

  initOnUserGesture() {
    const unlock = () => {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.masterGain);

        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.45;
        this.bgmGain.connect(this.masterGain);

        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };

    window.addEventListener('click', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    window.addEventListener('touchstart', unlock, { once: false });
  }

  initAudioContext() {
    return this.ensureContext();
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.45;
      this.bgmGain.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.85;
    }
  }

  setVolume(type, val) {
    if (!this.ensureContext()) return;
    if (type === 'master' && this.masterGain) this.masterGain.gain.value = val;
    if (type === 'sfx' && this.sfxGain) this.sfxGain.gain.value = val;
    if (type === 'bgm' && this.bgmGain) this.bgmGain.gain.value = val;
  }

  /**
   * Fast air whoosh for punch/kick windup
   */
  playWhoosh(intensity = 1.0) {
    if (this.isMuted || !this.ensureContext()) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.0;
    filter.frequency.setValueAtTime(300 * intensity, now);
    filter.frequency.exponentialRampToValueAtTime(1400 * intensity, now + 0.1);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.7 * intensity, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.26);
  }

  /**
   * Heavy punch impact: sub-bass thump + metallic crunch + distortion
   */
  playPunch(strength = 1.0) {
    if (this.isMuted || !this.ensureContext()) return;
    const now = this.ctx.currentTime;

    // Sub thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160 * strength, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(1.0 * strength, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Metal snap / crunch noise
    const noiseLen = this.ctx.sampleRate * 0.15;
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(400, now + 0.12);
    noiseFilter.Q.value = 4.0;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.85 * strength, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    noiseSource.start(now);
    noiseSource.stop(now + 0.16);

    // Metallic ring overtone
    const ringOsc = this.ctx.createOscillator();
    ringOsc.type = 'sine';
    ringOsc.frequency.setValueAtTime(650 * strength, now);
    ringOsc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    const ringGain = this.ctx.createGain();
    ringGain.gain.setValueAtTime(0.4 * strength, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    ringOsc.connect(ringGain);
    ringGain.connect(this.sfxGain);
    ringOsc.start(now);
    ringOsc.stop(now + 0.13);
  }

  /**
   * Massive Heavy Uppercut / Special Impact: deep explosion + shockwave + metallic clash
   */
  playHeavyPunch(multiplier = 1.3) {
    if (this.isMuted || !this.ensureContext()) return;
    const now = this.ctx.currentTime;

    this.playPunch(multiplier);

    // Deep sub-boom
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, now);
    sub.frequency.exponentialRampToValueAtTime(25, now + 0.4);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(1.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.5);

    // Electric zap / sparks
    const zapLen = this.ctx.sampleRate * 0.2;
    const zapBuf = this.ctx.createBuffer(1, zapLen, this.ctx.sampleRate);
    const zapData = zapBuf.getChannelData(0);
    for (let i = 0; i < zapLen; i++) {
      zapData[i] = (Math.sin(i * 0.4) * (Math.random() * 2 - 1)) * (1 - i / zapLen);
    }
    const zap = this.ctx.createBufferSource();
    zap.buffer = zapBuf;

    const zapFilter = this.ctx.createBiquadFilter();
    zapFilter.type = 'highpass';
    zapFilter.frequency.setValueAtTime(2500, now);

    const zapGain = this.ctx.createGain();
    zapGain.gain.setValueAtTime(0.5, now);
    zapGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    zap.connect(zapFilter);
    zapFilter.connect(zapGain);
    zapGain.connect(this.sfxGain);
    zap.start(now);
    zap.stop(now + 0.22);
  }

  /**
   * Arena Gong / Round Bell
   */
  playGong() {
    if (this.isMuted || !this.ensureContext()) return;
    const now = this.ctx.currentTime;

    const freqs = [440, 680, 920, 1280, 1850];
    const amps = [1.0, 0.65, 0.4, 0.25, 0.15];

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(amps[idx] * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 2.6);
    });
  }

  /**
   * Crowd cheer on combo
   */
  playCrowdCheer() {
    if (this.isMuted || !this.ensureContext()) return;
    const now = this.ctx.currentTime;

    const dur = 1.2;
    const bufLen = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufLen) * Math.PI);
    }
    const cheer = this.ctx.createBufferSource();
    cheer.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.value = 1.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    cheer.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    cheer.start(now);
    cheer.stop(now + dur + 0.1);
  }

  /**
   * UI Click Sound
   */
  playUIClick(pitch = 1.0) {
    if (this.isMuted || !this.ensureContext()) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1400 * pitch, now + 0.04);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Announcer Voice Synthesis via Web Speech API or voice cue
   */
  speak(text) {
    if (this.isMuted) return;
    // Play electronic chime first
    this.playUIClick(1.4);

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.15;
        utterance.pitch = 0.8;
        utterance.volume = 0.9;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        // Fallback
      }
    }
  }

  /**
   * Procedural Cyberpunk Combat Synthwave BGM
   */
  toggleBGM() {
    if (this.bgmPlaying) {
      this.stopBGM();
      return false;
    } else {
      this.startBGM();
      return true;
    }
  }

  startBGM() {
    if (this.bgmPlaying || !this.ensureContext()) return;
    this.bgmPlaying = true;
    this.step = 0;

    const stepInterval = (60 / this.bpm) / 4; // 16th note

    const bassNotes = [55, 55, 55, 65, 55, 55, 73, 65, 58, 58, 58, 65, 58, 58, 77, 73];
    const leadNotes = [220, 0, 261, 293, 0, 329, 0, 293, 220, 0, 349, 329, 0, 293, 261, 0];

    this.bgmInterval = setInterval(() => {
      if (!this.bgmPlaying || this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const s = this.step % 16;

      // Kick drum on beats 0, 4, 8, 12
      if (s % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(130, now);
        kickOsc.frequency.exponentialRampToValueAtTime(38, now + 0.09);

        const kickGain = this.ctx.createGain();
        kickGain.gain.setValueAtTime(0.8, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        kickOsc.connect(kickGain);
        kickGain.connect(this.bgmGain);
        kickOsc.start(now);
        kickOsc.stop(now + 0.13);
      }

      // Snare on 4, 12
      if (s === 4 || s === 12) {
        const snareLen = this.ctx.sampleRate * 0.08;
        const snareBuf = this.ctx.createBuffer(1, snareLen, this.ctx.sampleRate);
        const data = snareBuf.getChannelData(0);
        for (let i = 0; i < snareLen; i++) data[i] = Math.random() * 2 - 1;
        const snare = this.ctx.createBufferSource();
        snare.buffer = snareBuf;

        const snareFilter = this.ctx.createBiquadFilter();
        snareFilter.type = 'highpass';
        snareFilter.frequency.value = 1000;

        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.4, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        snare.connect(snareFilter);
        snareFilter.connect(snareGain);
        snareGain.connect(this.bgmGain);
        snare.start(now);
        snare.stop(now + 0.09);
      }

      // Hi-hat on every off-beat
      if (s % 2 === 1) {
        const hatLen = this.ctx.sampleRate * 0.03;
        const hatBuf = this.ctx.createBuffer(1, hatLen, this.ctx.sampleRate);
        const data = hatBuf.getChannelData(0);
        for (let i = 0; i < hatLen; i++) data[i] = Math.random() * 2 - 1;
        const hat = this.ctx.createBufferSource();
        hat.buffer = hatBuf;

        const hatFilter = this.ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.value = 7000;

        const hatGain = this.ctx.createGain();
        hatGain.gain.setValueAtTime(0.18, now);
        hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        hat.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(this.bgmGain);
        hat.start(now);
        hat.stop(now + 0.04);
      }

      // Bass synth
      const bassFreq = bassNotes[s];
      if (bassFreq) {
        const bOsc = this.ctx.createOscillator();
        bOsc.type = 'sawtooth';
        bOsc.frequency.setValueAtTime(bassFreq, now);

        const bFilter = this.ctx.createBiquadFilter();
        bFilter.type = 'lowpass';
        bFilter.frequency.setValueAtTime(320, now);
        bFilter.frequency.exponentialRampToValueAtTime(140, now + 0.1);

        const bGain = this.ctx.createGain();
        bGain.gain.setValueAtTime(0.28, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

        bOsc.connect(bFilter);
        bFilter.connect(bGain);
        bGain.connect(this.bgmGain);
        bOsc.start(now);
        bOsc.stop(now + 0.12);
      }

      // Cyber Lead Arpeggio
      const leadFreq = leadNotes[s];
      if (leadFreq > 0) {
        const lOsc = this.ctx.createOscillator();
        lOsc.type = 'square';
        lOsc.frequency.setValueAtTime(leadFreq, now);

        const lGain = this.ctx.createGain();
        lGain.gain.setValueAtTime(0.09, now);
        lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        lOsc.connect(lGain);
        lGain.connect(this.bgmGain);
        lOsc.start(now);
        lOsc.stop(now + 0.11);
      }

      this.step++;
    }, stepInterval * 1000);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}
