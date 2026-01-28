// Audio Manager for Unicycle Hero
export class AudioManager {
  private static audioContext: AudioContext | null = null;
  private static musicGain: GainNode | null = null;
  private static fxGain: GainNode | null = null;
  private static musicEnabled: boolean = true;
  private static fxEnabled: boolean = true;

  static initialize(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.musicGain = this.audioContext.createGain();
      this.fxGain = this.audioContext.createGain();
      this.musicGain.connect(this.audioContext.destination);
      this.fxGain.connect(this.audioContext.destination);
      this.musicGain.gain.value = 0.3;
      this.fxGain.gain.value = 0.5;
    }
  }

  static playCircusMusic(): void {
    if (!this.musicEnabled || !this.audioContext || !this.musicGain) return;

    // Create a simple circus-style melody using Web Audio API
    const tempo = 120; // BPM
    const beatDuration = 60 / tempo;

    // Simple circus melody notes (frequencies in Hz)
    const melody = [
      { freq: 523.25, duration: beatDuration }, // C5
      { freq: 587.33, duration: beatDuration }, // D5
      { freq: 659.25, duration: beatDuration * 2 }, // E5
      { freq: 523.25, duration: beatDuration }, // C5
      { freq: 587.33, duration: beatDuration }, // D5
      { freq: 659.25, duration: beatDuration * 2 }, // E5
      { freq: 783.99, duration: beatDuration }, // G5
      { freq: 659.25, duration: beatDuration }, // E5
      { freq: 523.25, duration: beatDuration * 2 }, // C5
    ];

    let currentTime = this.audioContext.currentTime;

    melody.forEach(note => {
      const oscillator = this.audioContext!.createOscillator();
      const envelope = this.audioContext!.createGain();

      oscillator.connect(envelope);
      envelope.connect(this.musicGain!);

      oscillator.frequency.value = note.freq;
      oscillator.type = 'square'; // 8-bit style sound

      envelope.gain.setValueAtTime(0, currentTime);
      envelope.gain.linearRampToValueAtTime(0.1, currentTime + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.01, currentTime + note.duration);

      oscillator.start(currentTime);
      oscillator.stop(currentTime + note.duration);

      currentTime += note.duration;
    });
  }

  static playPedalSound(): void {
    if (!this.fxEnabled || !this.audioContext || !this.fxGain) return;

    const oscillator = this.audioContext.createOscillator();
    const envelope = this.audioContext.createGain();

    oscillator.connect(envelope);
    envelope.connect(this.fxGain);

    oscillator.frequency.value = 200;
    oscillator.type = 'sawtooth';

    envelope.gain.setValueAtTime(0, this.audioContext.currentTime);
    envelope.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  static setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (this.musicGain) {
      this.musicGain.gain.value = enabled ? 0.3 : 0;
    }
  }

  static setFXEnabled(enabled: boolean): void {
    this.fxEnabled = enabled;
    if (this.fxGain) {
      this.fxGain.gain.value = enabled ? 0.5 : 0;
    }
  }
}
