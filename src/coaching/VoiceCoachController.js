// ─── Browser Web Speech API adapter ────────────────────────────────
// Optional input only. Combat and text coaching remain functional without it.

export class VoiceCoachController {
  constructor({ language = 'en-US', onFinal, onInterim, onStatus } = {}) {
    this.language = language;
    this.onFinal = onFinal || (() => {});
    this.onInterim = onInterim || (() => {});
    this.onStatus = onStatus || (() => {});
    this.active = false;
    this.recognition = null;

    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) {
      this.onStatus({ state: 'unavailable', message: 'VOICE UNAVAILABLE — USE TEXT' });
      return;
    }

    this.recognition = new Recognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.onstart = () => {
      this.active = true;
      this.onStatus({ state: 'listening', message: `LISTENING — ${this.language}` });
    };
    this.recognition.onresult = event => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += text;
        else interim += text;
      }
      if (interim) this.onInterim(interim.trim());
      if (finalText.trim()) this.onFinal(finalText.trim(), this.language);
    };
    this.recognition.onerror = event => {
      const state = event.error === 'not-allowed' ? 'denied' : 'error';
      this.onStatus({ state, message: event.error === 'not-allowed' ? 'MICROPHONE DENIED' : `VOICE ERROR — ${event.error}` });
    };
    this.recognition.onend = () => {
      this.active = false;
      this.onStatus({ state: 'idle', message: `MIC OFF — ${this.language}` });
    };
  }

  setLanguage(language) {
    if (!['en-US', 'vi-VN'].includes(language)) return false;
    this.language = language;
    if (this.recognition) this.recognition.lang = language;
    this.onStatus({ state: this.active ? 'listening' : 'idle', message: `${this.active ? 'LISTENING' : 'MIC OFF'} — ${language}` });
    return true;
  }

  toggle() {
    if (!this.recognition) {
      this.onStatus({ state: 'unavailable', message: 'VOICE UNAVAILABLE — USE TEXT' });
      return false;
    }
    if (this.active) {
      this.stop();
      return false;
    }
    this.recognition.lang = this.language;
    try {
      this.recognition.start();
      return true;
    } catch {
      this.onStatus({ state: 'error', message: 'VOICE START FAILED — USE TEXT' });
      return false;
    }
  }

  stop() {
    if (!this.recognition || !this.active) return;
    this.recognition.stop();
  }

  dispose() {
    this.stop();
    if (this.recognition) {
      this.recognition.onstart = null;
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
  }
}
