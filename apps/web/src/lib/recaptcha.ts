const SCRIPT_ID = 'google-recaptcha-v2';
const SCRIPT_TIMEOUT_MS = 10_000;
/** Ô tick cỡ normal rộng cố định 304px; hẹp hơn thì dùng compact (164px). */
export const RECAPTCHA_NORMAL_WIDTH = 304;

interface Grecaptcha {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, params: Record<string, unknown>) => number;
  reset: (widgetId?: number) => void;
}

/** Script Google không tải được (mạng, trình chặn quảng cáo). */
export class RecaptchaUnavailableError extends Error {
  constructor() {
    super(
      'Không tải được reCAPTCHA của Google. Kiểm tra kết nối mạng hoặc tắt trình chặn quảng cáo rồi tải lại trang.',
    );
    this.name = 'RecaptchaUnavailableError';
  }
}

export interface RecaptchaHandlers {
  onToken: (token: string) => void;
  /** Tick quá 2 phút chưa gửi → token hết hạn, phải tick lại. */
  onExpired: () => void;
}

export interface RecaptchaClient {
  enabled: boolean;
  /** Vẽ ô tick vào `container`; tắt → null. Trả widgetId để reset sau. */
  mount: (
    container: HTMLElement,
    availableWidth: number,
    handlers: RecaptchaHandlers,
  ) => Promise<number | null>;
  /** Token chỉ dùng một lần — gửi xong (dù lỗi) phải bỏ tick để người dùng tick lại. */
  reset: (widgetId: number) => void;
}

export function isLocalhostDomain(hostOrUrl?: string | null): boolean {
  if (hostOrUrl) {
    const trimmed = hostOrUrl.trim().toLowerCase();
    if (trimmed === 'localhost' || trimmed === '127.0.0.1' || trimmed === '::1') return true;
    try {
      const url =
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? new URL(trimmed)
          : new URL(`http://${trimmed}`);
      const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
      const clean = trimmed
        .replace(/^https?:\/\//, '')
        .replace(/^\[/, '')
        .split(/[\]:/]/)[0];
      return clean === 'localhost' || clean === '127.0.0.1' || clean === '::1';
    }
  }
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

interface RecaptchaDeps {
  siteKey: string;
  loadScript: (src: string) => Promise<void>;
  getGrecaptcha: () => Grecaptcha | undefined;
  isLocalhost?: (hostOrUrl?: string | null) => boolean;
}

export function createRecaptchaClient({
  siteKey,
  loadScript,
  getGrecaptcha,
  isLocalhost = isLocalhostDomain,
}: RecaptchaDeps): RecaptchaClient {
  let loading: Promise<void> | null = null;

  function load(): Promise<void> {
    loading ??= loadScript('https://www.google.com/recaptcha/api.js?render=explicit&hl=vi').catch(
      (error: unknown) => {
        loading = null; // cho phép thử lại khi trang vẽ lại ô tick
        throw error;
      },
    );
    return loading;
  }

  async function mount(
    container: HTMLElement,
    availableWidth: number,
    handlers: RecaptchaHandlers,
  ): Promise<number | null> {
    if (!siteKey || isLocalhost()) return null;
    try {
      await load();
      const grecaptcha = getGrecaptcha();
      if (!grecaptcha) throw new Error('grecaptcha chưa sẵn sàng');
      await new Promise<void>((resolve) => grecaptcha.ready(resolve));
      return grecaptcha.render(container, {
        sitekey: siteKey,
        size: availableWidth < RECAPTCHA_NORMAL_WIDTH ? 'compact' : 'normal',
        callback: handlers.onToken,
        'expired-callback': handlers.onExpired,
        'error-callback': handlers.onExpired,
      });
    } catch {
      throw new RecaptchaUnavailableError();
    }
  }

  return {
    get enabled() {
      if (isLocalhost()) return false;
      return siteKey.length > 0;
    },
    mount,
    reset: (widgetId) => getGrecaptcha()?.reset(widgetId),
  };
}

function loadScriptTag(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    document.getElementById(SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    const timer = window.setTimeout(() => reject(new Error('timeout')), SCRIPT_TIMEOUT_MS);
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('script error'));
    };
    document.head.appendChild(script);
  });
}

export const recaptcha = createRecaptchaClient({
  siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '',
  loadScript: loadScriptTag,
  getGrecaptcha: () => (window as unknown as { grecaptcha?: Grecaptcha }).grecaptcha,
});
