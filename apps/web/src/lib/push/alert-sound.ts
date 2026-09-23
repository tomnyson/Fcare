/**
 * Tiếng báo cảnh báo cấp 3–4 khi tab FCare đang mở. Khi tab đã đóng, trình
 * duyệt không cho phát âm riêng — popup OneSignal dùng âm mặc định của máy.
 */

const ALERT_SOUND_MIN_LEVEL = 3;
export const SOUND_PREFERENCE_KEY = 'fcare.alertSound';

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function shouldPlayAlertSound(
  payload: { alertLevel?: number | null },
  enabled: boolean,
): boolean {
  return enabled && payload.alertLevel != null && payload.alertLevel >= ALERT_SOUND_MIN_LEVEL;
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Tuỳ chọn theo từng máy; không đọc được (chế độ riêng tư, bị chặn) → bật. */
export function readSoundPreference(storage: PreferenceStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(SOUND_PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundPreference(
  enabled: boolean,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(SOUND_PREFERENCE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Không lưu được thì chỉ mất ghi nhớ giữa các lần mở — không ảnh hưởng gì khác.
  }
}

const TONES: ReadonlyArray<{ frequency: number; start: number }> = [
  { frequency: 880, start: 0 },
  { frequency: 660, start: 0.18 },
];
const TONE_DURATION_S = 0.16;

/** Hai nốt ngắn bằng Web Audio — không cần file âm thanh. Bị chặn autoplay → im. */
export function playAlertSound(): void {
  if (typeof window === 'undefined') return;
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  try {
    const context = new AudioCtor();
    void context.resume().catch(() => undefined);
    const now = context.currentTime;
    for (const tone of TONES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.25, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + TONE_DURATION_S);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + TONE_DURATION_S);
    }
    window.setTimeout(() => void context.close().catch(() => undefined), 800);
  } catch {
    // Trình duyệt chặn âm thanh khi chưa có tương tác — bỏ qua.
  }
}
