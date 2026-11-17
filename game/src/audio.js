// Procedural sound only: Web Audio oscillators, no audio files, no network.
// The context is created lazily on the first player gesture, so a screenshot
// run (no gesture) never touches audio at all.

const MASTER_GAIN = 0.2;

export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context !== null) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  /** Resume (or create) the context from a user gesture. */
  function resume() {
    const ctx = ensure();
    if (ctx !== null && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, duration, type, volume, slideTo) {
    const ctx = ensure();
    if (ctx === null || master === null) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  function click() { tone(660, 0.08, 'triangle', 0.4); }
  function select() { tone(520, 0.07, 'triangle', 0.35); }
  function order() { tone(440, 0.09, 'square', 0.22, 560); }
  function coin() { tone(880, 0.12, 'sine', 0.4, 1320); }
  function train() { tone(392, 0.14, 'triangle', 0.4, 523); }
  function build() { tone(330, 0.16, 'square', 0.25, 415); }
  function buildDone() { tone(523, 0.12, 'triangle', 0.4); tone(784, 0.18, 'triangle', 0.35); }
  function fight() { tone(180, 0.1, 'sawtooth', 0.25, 120); }
  function ability() { tone(220, 0.3, 'sawtooth', 0.3, 880); }
  function error() { tone(160, 0.16, 'square', 0.3, 110); }
  function achievement() { tone(659, 0.12, 'triangle', 0.4); tone(880, 0.12, 'triangle', 0.4); tone(1046, 0.2, 'triangle', 0.4); }
  function win() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.25, 'triangle', 0.4), i * 130);
    });
  }
  function lose() {
    [392, 330, 262, 196].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.3, 'triangle', 0.35), i * 150);
    });
  }

  return { resume, click, select, order, coin, train, build, buildDone, fight, ability, error, achievement, win, lose };
}
