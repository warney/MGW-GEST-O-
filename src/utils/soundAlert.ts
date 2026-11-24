const MGW_NEW_ORDER_AUDIO_SRC = '/sounds/mgw-new-order.wav';
const ALERTED_ORDERS_STORAGE_KEY = 'mgw_alerted_sound_orders_v1';
const MAX_TRACKED_ALERTED_ORDERS = 150;

let sharedAudioCtx: AudioContext | null = null;
let sharedAudioElement: HTMLAudioElement | null = null;
const memoryAlertedOrderIds = new Set<string>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

function getAlertAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!sharedAudioElement) {
    try {
      const audio = new Audio(MGW_NEW_ORDER_AUDIO_SRC);
      audio.preload = 'auto';
      audio.volume = 0.95;
      sharedAudioElement = audio;
    } catch {
      return null;
    }
  }
  return sharedAudioElement;
}

function readPersistedAlertedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(ALERTED_ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function persistAlertedIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      ALERTED_ORDERS_STORAGE_KEY,
      JSON.stringify(ids.slice(-MAX_TRACKED_ALERTED_ORDERS)),
    );
  } catch {
    // Ignora falha de sessionStorage em modo restrito
  }
}

export function hasOrderSoundAlerted(orderId: string): boolean {
  if (!orderId) return false;
  if (memoryAlertedOrderIds.has(orderId)) return true;
  const persisted = readPersistedAlertedIds();
  if (persisted.includes(orderId)) {
    memoryAlertedOrderIds.add(orderId);
    return true;
  }
  return false;
}

export function markOrdersSoundAlerted(orderIds: string[]): void {
  const cleanIds = orderIds.map((id) => id.trim()).filter(Boolean);
  if (cleanIds.length === 0) return;

  const existing = readPersistedAlertedIds();
  const merged = [...existing];
  for (const id of cleanIds) {
    memoryAlertedOrderIds.add(id);
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  persistAlertedIds(merged);
}

export function filterUnalertedOrderIds(orderIds: string[]): string[] {
  return orderIds.filter((id) => Boolean(id) && !hasOrderSoundAlerted(id));
}

export function resetOrderSoundDeduplicationForTests(): void {
  memoryAlertedOrderIds.clear();
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(ALERTED_ORDERS_STORAGE_KEY);
    } catch {
      // Ignora
    }
  }
}

export async function unlockAlertAudio(): Promise<boolean> {
  let unlocked = false;

  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state === 'running') {
        unlocked = true;
      }
    } catch {
      // Continua tentando desbloquear HTMLAudioElement
    }
  }

  const audio = getAlertAudioElement();
  if (audio) {
    try {
      audio.load();
      unlocked = true;
    } catch {
      // Ignora
    }
  }

  return unlocked;
}

async function playSynthFallbackChime(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') {
      return false;
    }

    const now = ctx.currentTime;
    const beats: Array<{
      offset: number;
      duration: number;
      freqs: number[];
      gains: number[];
      type: OscillatorType;
    }> = [
      {
        offset: 0,
        duration: 0.34,
        freqs: [261.63, 392.0, 523.25, 659.25],
        gains: [0.16, 0.16, 0.22, 0.12],
        type: 'triangle',
      },
      {
        offset: 0.2,
        duration: 0.45,
        freqs: [392.0, 587.33, 783.99, 987.77],
        gains: [0.14, 0.16, 0.24, 0.14],
        type: 'sine',
      },
      {
        offset: 0.42,
        duration: 0.55,
        freqs: [523.25, 783.99, 1046.5],
        gains: [0.14, 0.2, 0.2],
        type: 'triangle',
      },
    ];

    beats.forEach((beat) => {
      beat.freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = beat.type;
        osc.frequency.setValueAtTime(freq, now + beat.offset);

        gain.gain.setValueAtTime(0.0001, now + beat.offset);
        gain.gain.exponentialRampToValueAtTime(
          beat.gains[idx],
          now + beat.offset + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + beat.offset + beat.duration,
        );

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + beat.offset);
        osc.stop(now + beat.offset + beat.duration + 0.02);
      });
    });

    return true;
  } catch {
    return false;
  }
}

export async function playNewOrderAlertChime(): Promise<boolean> {
  const audio = getAlertAudioElement();
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch {
      // Se HTMLAudioElement falhar (ex: bloqueio de codec/autoplay ou ambiente sem WAV), tenta Web Audio API
    }
  }

  return playSynthFallbackChime();
}
