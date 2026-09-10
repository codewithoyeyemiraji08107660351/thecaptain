// Web Audio API synthesized sound effects
const audioCtx = () => {
  if (!(window as any).__audioCtx) {
    (window as any).__audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return (window as any).__audioCtx as AudioContext;
};

/** Shared AudioContext accessor for other audio modules (e.g. background music). */
export const getAudioContext = (): AudioContext | null => {
  try { return audioCtx(); } catch { return null; }
};

/** Resume the shared AudioContext if suspended (browsers require user gesture). */
export const ensureAudioContextResumed = () => {
  try {
    const ctx = audioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  } catch {}
};

// ── Daily Spin SFX ──
// Procedural ratchet/ticker driven by the SAME easing curve as the wheel,
// so every audible "thock" lands the moment a segment boundary crosses the pointer.
let activeSpinSfx: { stop: () => void } | null = null;

// Cubic bezier evaluator — matches framer-motion's [x1,y1,x2,y2] ease curve.
// Returns the eased progress [0..1] for a given time progress [0..1].
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  // Solve t for given x using Newton-Raphson + bisection (precise enough for audio scheduling).
  const sampleX = (t: number) =>
    3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const sampleY = (t: number) =>
    3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  const sampleDerivX = (t: number) => {
    const u = 1 - t;
    return 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
  };
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    // Newton-Raphson
    for (let i = 0; i < 8; i++) {
      const cx = sampleX(t) - x;
      const d = sampleDerivX(t);
      if (Math.abs(cx) < 1e-6) break;
      if (d === 0) break;
      t -= cx / d;
    }
    // Clamp & fall back to bisection if Newton drifted
    if (t < 0 || t > 1) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        t = (lo + hi) / 2;
        const cx = sampleX(t) - x;
        if (Math.abs(cx) < 1e-6) break;
        if (cx < 0) lo = t; else hi = t;
      }
    }
    return sampleY(t);
  };
};

interface SpinSoundOptions {
  /** Total animation duration in ms */
  durationMs?: number;
  /** Number of segments on the wheel (= ticks per full rotation) */
  segments?: number;
  /** Total rotation traveled, in degrees */
  totalRotationDeg?: number;
  /** Cubic bezier easing matching the visual animation */
  ease?: [number, number, number, number];
}

export const playDailySpinSound = (
  optsOrDuration: number | SpinSoundOptions = 10000,
): { stop: () => void } => {
  const opts: SpinSoundOptions =
    typeof optsOrDuration === "number" ? { durationMs: optsOrDuration } : optsOrDuration;
  const durationMs = opts.durationMs ?? 10000;
  const segments = opts.segments ?? 11;
  // Default total rotation matches the wheel's typical 5–7 full spins (~6 → 2160°).
  const totalRotationDeg = opts.totalRotationDeg ?? 360 * 6;
  const ease = opts.ease ?? [0.15, 0.85, 0.35, 1.0];

  // Only one active spin SFX at a time
  if (activeSpinSfx) {
    try { activeSpinSfx.stop(); } catch {}
    activeSpinSfx = null;
  }
  if (!getAllSoundsMaster()) {
    return { stop: () => {} };
  }

  let cancelled = false;
  let timeoutId: number | undefined;
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };
  // Browsers suspend AudioContext until a user gesture — make sure it's running
  // before scheduling, otherwise none of the ticks will be heard.
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const startTime = ctx.currentTime;
  const totalDuration = durationMs / 1000;
  const segmentAngle = 360 / segments;
  const totalTicks = Math.max(1, Math.floor(totalRotationDeg / segmentAngle));
  const easeFn = cubicBezier(ease[0], ease[1], ease[2], ease[3]);

  const playTick = (when: number, intensity: number) => {
    // Wooden peg "thock" — a damped low-mid resonator hit by a soft noise transient.
    const tickDur = 0.12;

    // 1) Soft noise transient (the strike) — short, lowpassed so it isn't harsh.
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) {
      const t = i / ctx.sampleRate;
      nd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 220);
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseLp = ctx.createBiquadFilter();
    noiseLp.type = "lowpass";
    noiseLp.frequency.value = 2200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 * intensity, when);
    ng.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
    noiseSrc.connect(noiseLp).connect(ng).connect(ctx.destination);
    noiseSrc.start(when);
    noiseSrc.stop(when + 0.04);

    // 2) Pitched "thock" body — triangle wave at a wood-like frequency with a fast decay.
    const baseFreq = 320 + Math.random() * 60;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(baseFreq * 1.6, when);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, when + 0.025);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = baseFreq;
    bp.Q.value = 4;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(0.32 * intensity, when + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, when + tickDur);
    osc.connect(bp).connect(og).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + tickDur + 0.02);
  };

  // For each segment boundary the wheel will cross, find the EXACT time
  // (via inverse easing) when the wheel reaches that rotation. That is when
  // the visual marker clicks against the peg — schedule a tick at that moment.
  // Solve easeFn(timeProgress) = rotationProgress  using bisection.
  const inverseEase = (rotationProgress: number): number => {
    if (rotationProgress <= 0) return 0;
    if (rotationProgress >= 1) return 1;
    let lo = 0, hi = 1, mid = rotationProgress;
    for (let i = 0; i < 32; i++) {
      mid = (lo + hi) / 2;
      const v = easeFn(mid);
      if (Math.abs(v - rotationProgress) < 1e-5) break;
      if (v < rotationProgress) lo = mid; else hi = mid;
    }
    return mid;
  };

  // Schedule one tick per boundary crossed. The final tick lands at t=durationMs (wheel stop).
  let prevT = -1;
  for (let n = 1; n <= totalTicks; n++) {
    const rotationProgress = n / totalTicks;
    const timeProgress = inverseEase(rotationProgress);
    const tSec = timeProgress * totalDuration;
    // Intensity: louder during fast middle, softer at start (ramp-in) and end (fade-out).
    // Use the instantaneous tick spacing to model "how fast the wheel is spinning".
    const dt = tSec - prevT;
    prevT = tSec;
    // Map tick spacing to intensity — tighter spacing = more energetic.
    // Reference fastest spacing is around totalDuration / totalTicks * 0.4.
    const refFast = (totalDuration / totalTicks) * 0.4;
    const speedRatio = Math.min(1, refFast / Math.max(dt, 0.001));
    // Final tail fade so the very last few ticks taper gracefully.
    const tail = rotationProgress > 0.92 ? 1 - (rotationProgress - 0.92) / 0.08 * 0.7 : 1;
    const intensity = Math.max(0.12, 0.35 + 0.65 * speedRatio) * tail;
    playTick(startTime + tSec, intensity);
  }

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    activeSpinSfx = null;
  };

  timeoutId = window.setTimeout(() => { activeSpinSfx = null; }, durationMs + 500);

  activeSpinSfx = { stop };
  return { stop };
};

// Sound settings stored in localStorage
export interface SoundSettings {
  buttonPress: boolean;
  newMessages: boolean;
  receiveCommand: boolean;
  sendCommand: boolean;
  missionResult: boolean;
  promotionDemotion: boolean;
  squadSelect: boolean;
  tabSwitch: boolean;
}

export const getDefaultSoundSettings = (): SoundSettings => ({
  buttonPress: true,
  newMessages: true,
  receiveCommand: true,
  sendCommand: true,
  missionResult: true,
  promotionDemotion: true,
  squadSelect: true,
  tabSwitch: true,
});

export const getSoundSettings = (): SoundSettings => {
  try {
    const stored = localStorage.getItem("soundSettings");
    return stored ? { ...getDefaultSoundSettings(), ...JSON.parse(stored) } : getDefaultSoundSettings();
  } catch { return getDefaultSoundSettings(); }
};

export const saveSoundSettings = (s: SoundSettings) => {
  localStorage.setItem("soundSettings", JSON.stringify(s));
};

export const getAllSoundsMaster = (): boolean => {
  const v = localStorage.getItem("allSoundsMaster");
  return v === null ? true : v === "true";
};

export const setAllSoundsMaster = (on: boolean) => {
  localStorage.setItem("allSoundsMaster", String(on));
};

const playTone = (freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15) => {
  try {
    const ctx = audioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
};

const playNoise = (duration: number, volume = 0.05) => {
  try {
    const ctx = audioCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {}
};

/** Returns true only if master toggle AND individual key are both enabled */
const isSoundEnabled = (key: keyof SoundSettings): boolean => {
  if (!getAllSoundsMaster()) return false;
  return getSoundSettings()[key];
};

// Re-read settings fresh each call so toggling takes effect immediately
export const playButtonSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(800, 0.08, "square", 0.06);
};

export const playProfileSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(500, 0.1, "sine", 0.08);
  setTimeout(() => playTone(700, 0.08, "sine", 0.06), 70);
};

export const playBackSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(600, 0.08, "sine", 0.07);
  setTimeout(() => playTone(400, 0.1, "sine", 0.06), 60);
};

export const playMessageSendSound = () => {
  if (!isSoundEnabled("newMessages")) return;
  playTone(600, 0.1, "sine", 0.08);
  setTimeout(() => playTone(900, 0.08, "sine", 0.06), 60);
};

export const playBubblePopSound = () => {
  if (!isSoundEnabled("newMessages")) return;
  playTone(1200, 0.12, "sine", 0.07);
};

export const playSendCommandSound = () => {
  if (!isSoundEnabled("sendCommand")) return;
  playTone(300, 0.15, "sawtooth", 0.1);
  setTimeout(() => playTone(500, 0.15, "sawtooth", 0.1), 100);
  setTimeout(() => playTone(700, 0.2, "sawtooth", 0.12), 200);
};

export const playReceiveCommandSound = () => {
  if (!isSoundEnabled("receiveCommand")) return;
  playTone(800, 0.2, "square", 0.1);
  setTimeout(() => playTone(600, 0.2, "square", 0.1), 150);
  setTimeout(() => playTone(400, 0.3, "square", 0.12), 300);
  setTimeout(() => playTone(800, 0.15, "square", 0.08), 500);
};

export const playMissionSuccessSound = () => {
  if (!isSoundEnabled("missionResult")) return;
  playTone(523, 0.15, "sine", 0.12);
  setTimeout(() => playTone(659, 0.15, "sine", 0.12), 120);
  setTimeout(() => playTone(784, 0.15, "sine", 0.12), 240);
  setTimeout(() => playTone(1047, 0.3, "sine", 0.15), 360);
};

export const playMissionFailedSound = () => {
  if (!isSoundEnabled("missionResult")) return;
  playTone(400, 0.3, "sawtooth", 0.1);
  setTimeout(() => playTone(300, 0.3, "sawtooth", 0.1), 250);
  setTimeout(() => playTone(200, 0.5, "sawtooth", 0.12), 500);
};

export const playPromotionSound = () => {
  if (!isSoundEnabled("promotionDemotion")) return;
  [523, 587, 659, 784, 880, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, "sine", 0.1), i * 80);
  });
};

export const playDemotionSound = () => {
  if (!isSoundEnabled("promotionDemotion")) return;
  [800, 600, 400, 300].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, "triangle", 0.1), i * 150);
  });
};

export const playSquadSelectSound = () => {
  if (!isSoundEnabled("squadSelect")) return;
  playTone(440, 0.1, "sine", 0.08);
  setTimeout(() => playTone(660, 0.12, "sine", 0.1), 80);
  setTimeout(() => playTone(880, 0.08, "sine", 0.06), 160);
};

export const playTabSwitchSound = () => {
  if (!isSoundEnabled("tabSwitch")) return;
  playTone(1000, 0.06, "sine", 0.05);
};

export const playSpinWheelSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  let i = 0;
  const tick = () => {
    if (i > 20) return;
    playTone(800 + Math.random() * 400, 0.04, "sine", 0.05);
    i++;
    setTimeout(tick, 80 + i * 15);
  };
  tick();
};

// Action button press sound
export const playActionButtonSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(500, 0.1, "square", 0.08);
  setTimeout(() => playTone(800, 0.08, "square", 0.06), 50);
  setTimeout(() => playTone(1100, 0.06, "sine", 0.05), 100);
};

// Shield action sound — solid metallic clang
export const playShieldActionSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(1200, 0.2, "triangle", 0.12);
  playTone(2400, 0.1, "sine", 0.06);
  setTimeout(() => playTone(800, 0.15, "triangle", 0.08), 80);
};

// Friendly Fire action sound — ricochet whistle
export const playFriendlyFireActionSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(600, 0.1, "sawtooth", 0.08);
  setTimeout(() => playTone(900, 0.08, "sine", 0.07), 60);
  setTimeout(() => playTone(500, 0.12, "sawtooth", 0.06), 130);
};

// Power Trip action sound — deep slam
export const playPowerTripActionSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(200, 0.2, "sawtooth", 0.12);
  setTimeout(() => playTone(100, 0.3, "square", 0.1), 100);
  setTimeout(() => playTone(400, 0.1, "sine", 0.08), 250);
};

// Stray Bullet action sound — gunshot crack
export const playStrayBulletActionSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playNoise(0.08, 0.15);
  playTone(150, 0.15, "sawtooth", 0.1);
  setTimeout(() => playTone(80, 0.2, "square", 0.08), 60);
};

// Glamorous upgrade sound — sparkly ascending fanfare
export const playUpgradeSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
    setTimeout(() => {
      playTone(f, 0.2, "sine", 0.12);
      playTone(f * 1.5, 0.15, "sine", 0.06); // shimmer harmonic
    }, i * 100);
  });
  setTimeout(() => playTone(2093, 0.5, "sine", 0.1), 600);
};

export const playChaosSound = () => {
  if (!getAllSoundsMaster()) return;
  const chaos = () => {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        playTone(200 + Math.random() * 1500, 0.15, ["sine", "square", "sawtooth", "triangle"][Math.floor(Math.random() * 4)] as OscillatorType, 0.08);
      }, i * 100);
    }
  };
  chaos();
  const interval = setInterval(chaos, 800);
  setTimeout(() => clearInterval(interval), 4800);
  playTone(60, 5, "sawtooth", 0.12);
  playNoise(5, 0.03);
};

export const playBoatHornSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(180, 1.2, "sawtooth", 0.15);
  playTone(175, 1.2, "sawtooth", 0.12);
  setTimeout(() => {
    playTone(160, 0.8, "sawtooth", 0.1);
    playTone(155, 0.8, "sawtooth", 0.08);
  }, 400);
};

// "Join The Ranks" button — war drum rally
export const playJoinRanksSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(80, 0.2, "triangle", 0.15);
  setTimeout(() => playTone(80, 0.15, "triangle", 0.12), 150);
  setTimeout(() => playTone(80, 0.1, "triangle", 0.1), 250);
  setTimeout(() => playTone(120, 0.3, "triangle", 0.15), 350);
  setTimeout(() => playNoise(0.08, 0.06), 350);
};

// Username shuffle sound — quick dice roll click
export const playShuffleSound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(1100, 0.05, "square", 0.06);
  setTimeout(() => playTone(1300, 0.04, "square", 0.05), 40);
};

// "Deploy" button — tactical beep sequence
export const playDeploySound = () => {
  if (!isSoundEnabled("buttonPress")) return;
  playTone(900, 0.06, "square", 0.08);
  setTimeout(() => playTone(900, 0.06, "square", 0.08), 100);
  setTimeout(() => playTone(1200, 0.12, "square", 0.1), 250);
};

// ── Animation sounds ──

// Command issued — dramatic descending slam
export const playCommandIssuedSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(1200, 0.15, "square", 0.1);
  setTimeout(() => playTone(900, 0.12, "square", 0.08), 100);
  setTimeout(() => playTone(600, 0.2, "sawtooth", 0.12), 200);
  setTimeout(() => playNoise(0.06, 0.08), 200);
};

// Command target reveal — impact thud
export const playCommandTargetSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(200, 0.25, "sawtooth", 0.12);
  playTone(100, 0.15, "square", 0.08);
  setTimeout(() => playNoise(0.04, 0.06), 50);
};

// Coup d'état — sword clash
export const playCoupSlashSound = () => {
  if (!getAllSoundsMaster()) return;
  playNoise(0.12, 0.15);
  playTone(2000, 0.08, "sawtooth", 0.1);
  setTimeout(() => playTone(800, 0.15, "triangle", 0.08), 60);
  setTimeout(() => playTone(400, 0.2, "sawtooth", 0.06), 120);
};

// Coup new captain reveal — triumphant brass
export const playCoupRevealSound = () => {
  if (!getAllSoundsMaster()) return;
  [440, 554, 659, 880].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, "sawtooth", 0.1), i * 100);
  });
};

// Rank lottery spin tick
export const playLotteryTickSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(900 + Math.random() * 400, 0.03, "square", 0.04);
};

// Rank lottery result reveal
export const playLotteryResultSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(523, 0.15, "sine", 0.1);
  setTimeout(() => playTone(659, 0.15, "sine", 0.1), 100);
  setTimeout(() => playTone(784, 0.2, "sine", 0.12), 200);
  setTimeout(() => playTone(1047, 0.3, "sine", 0.15), 300);
};

// Saboteur shake — ominous rumble
export const playSaboteurShakeSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(80, 1.2, "sawtooth", 0.12);
  playTone(90, 1.0, "square", 0.08);
  playNoise(1.0, 0.04);
};

// Saboteur timer change — alarm blare
export const playSaboteurAlarmSound = () => {
  if (!getAllSoundsMaster()) return;
  [800, 600, 800, 600].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, "square", 0.1), i * 150);
  });
};

// Squad reset — dramatic wipe
export const playResetFlashSound = () => {
  if (!getAllSoundsMaster()) return;
  playNoise(0.3, 0.12);
  playTone(150, 0.4, "sawtooth", 0.15);
  setTimeout(() => playTone(100, 0.3, "square", 0.1), 200);
};

// Squad reset scatter — items falling
export const playResetScatterSound = () => {
  if (!getAllSoundsMaster()) return;
  for (let i = 0; i < 8; i++) {
    setTimeout(() => playTone(400 + Math.random() * 600, 0.08, "sine", 0.05), i * 100);
  }
};

// Squad reset rebuild — hopeful ascending
export const playResetRebuildSound = () => {
  if (!getAllSoundsMaster()) return;
  [262, 330, 392, 523, 659].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, "sine", 0.1), i * 120);
  });
};

// Member departure — melancholic descend
export const playDepartureSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(500, 0.3, "sine", 0.1);
  setTimeout(() => playTone(400, 0.3, "sine", 0.08), 300);
  setTimeout(() => playTone(300, 0.4, "sine", 0.06), 600);
  setTimeout(() => playTone(200, 0.5, "sine", 0.04), 900);
};

// Member ejected — harsh alarm + slam
export const playEjectedSound = () => {
  if (!getAllSoundsMaster()) return;
  playNoise(0.15, 0.12);
  playTone(200, 0.2, "sawtooth", 0.15);
  setTimeout(() => playTone(150, 0.15, "square", 0.12), 100);
  setTimeout(() => {
    [600, 400, 600, 400].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.1, "square", 0.08), i * 120);
    });
  }, 300);
};

// Captain lottery intro — drumroll build
export const playCaptainLotteryIntroSound = () => {
  if (!getAllSoundsMaster()) return;
  let i = 0;
  const roll = () => {
    if (i > 15) return;
    playTone(100 + i * 5, 0.06, "triangle", 0.06 + i * 0.003);
    playNoise(0.03, 0.02 + i * 0.002);
    i++;
    setTimeout(roll, 60 - i * 2);
  };
  roll();
};

// Captain lottery result — fanfare
export const playCaptainLotteryResultSound = () => {
  if (!getAllSoundsMaster()) return;
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => {
      playTone(f, 0.25, "sine", 0.12);
      playTone(f * 1.5, 0.15, "sine", 0.06);
    }, i * 120);
  });
  setTimeout(() => playTone(1568, 0.5, "sine", 0.1), 500);
};

// Auto-fail / Time's Up sound — alarm clock + descending failure tones
export const playAutoFailSound = () => {
  if (!getAllSoundsMaster()) return;
  // Alarm ring
  [880, 0, 880, 0, 880].forEach((f, i) => {
    setTimeout(() => {
      if (f > 0) playTone(f, 0.12, "square", 0.1);
    }, i * 100);
  });
  // Descending doom tones
  setTimeout(() => {
    [440, 370, 311, 261].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.3, "sawtooth", 0.08), i * 150);
    });
  }, 600);
  // Final thud
  setTimeout(() => playTone(80, 0.4, "sine", 0.15), 1200);
};

export const playAutoFailStrikeSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(200, 0.2, "square", 0.12);
  setTimeout(() => playTone(150, 0.3, "sawtooth", 0.1), 150);
};

// Legendary command — lightning/thunder strike
export const playLegendaryThunderSound = () => {
  if (!getAllSoundsMaster()) return;
  // Lightning crack
  playNoise(0.15, 0.2);
  playTone(2500, 0.06, "sawtooth", 0.15);
  setTimeout(() => playTone(1800, 0.08, "sawtooth", 0.12), 30);
  // Thunder rumble
  setTimeout(() => {
    playTone(60, 1.5, "sawtooth", 0.15);
    playTone(80, 1.2, "triangle", 0.1);
    playNoise(1.0, 0.06);
  }, 150);
  // Second crack
  setTimeout(() => {
    playNoise(0.1, 0.12);
    playTone(2000, 0.05, "square", 0.1);
  }, 400);
  // Distant rumble
  setTimeout(() => {
    playTone(40, 2.0, "sawtooth", 0.08);
    playNoise(1.5, 0.03);
  }, 800);
};

// Underwater easter egg sounds
export const playWaterFillSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(80, 2.0, "sawtooth", 0.07);
  playTone(120, 1.5, "triangle", 0.05);
  playNoise(2.0, 0.03);
};

export const playUnderwaterBubblesSound = () => {
  if (!getAllSoundsMaster()) return;
  [0, 150, 350, 600, 900].forEach(delay => {
    setTimeout(() => {
      const freq = 800 + Math.random() * 600;
      playTone(freq, 0.12, "sine", 0.04);
    }, delay);
  });
};

export const playSubmarineBeepSound = () => {
  if (!getAllSoundsMaster()) return;
  playTone(1200, 0.8, "sine", 0.1);
  setTimeout(() => playTone(1200, 0.6, "sine", 0.07), 1500);
  setTimeout(() => playTone(1200, 0.4, "sine", 0.05), 2500);
};
