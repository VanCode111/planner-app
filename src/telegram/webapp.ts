/**
 * Тонкая обёртка над window.Telegram.WebApp.
 * Вне Telegram (обычный браузер) всё продолжает работать: tg === undefined, используются запасные варианты.
 */

type Callback<T = void> = (value: T) => void;

export interface TgMainButton {
  setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): TgMainButton;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
}

export interface TgBackButton {
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  show(): void;
  hide(): void;
}

export interface TgCloudStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
  removeItems(keys: string[], cb?: (err: string | null, ok?: boolean) => void): void;
}

export interface TgWebApp {
  initData: string;
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string | undefined>;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  MainButton: TgMainButton;
  BackButton: TgBackButton;
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  CloudStorage: TgCloudStorage;
  showConfirm(message: string, cb: Callback<boolean>): void;
  requestWriteAccess?(cb?: Callback<boolean>): void;
  onEvent(event: string, cb: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const raw = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

/** WebApp, только если приложение действительно открыто внутри Telegram. */
export const tg: TgWebApp | undefined = raw && raw.platform && raw.platform !== 'unknown' ? raw : undefined;

export const supports = (version: string): boolean => !!tg && tg.isVersionAtLeast(version);

function applyScheme(scheme: 'light' | 'dark') {
  document.documentElement.dataset.scheme = scheme;
}

export function initTelegram() {
  if (!tg) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    applyScheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', (e) => applyScheme(e.matches ? 'dark' : 'light'));
    return;
  }
  tg.ready();
  tg.expand();
  applyScheme(tg.colorScheme);
  const paint = () => {
    applyScheme(tg.colorScheme);
    const bg = tg.themeParams.secondary_bg_color;
    if (supports('6.1')) {
      tg.setHeaderColor('secondary_bg_color');
      if (bg) tg.setBackgroundColor(bg);
    }
    if (bg && supports('7.10')) tg.setBottomBarColor?.(bg);
  };
  paint();
  tg.onEvent('themeChanged', paint);
  // Свайп вниз внутри длинных списков не должен сворачивать приложение.
  if (supports('7.7')) tg.disableVerticalSwipes?.();
}

export const haptic = {
  tap: () => supports('6.1') && tg!.HapticFeedback.impactOccurred('light'),
  select: () => supports('6.1') && tg!.HapticFeedback.selectionChanged(),
  success: () => supports('6.1') && tg!.HapticFeedback.notificationOccurred('success'),
  warning: () => supports('6.1') && tg!.HapticFeedback.notificationOccurred('warning'),
};

export function confirmDialog(message: string): Promise<boolean> {
  if (supports('6.2')) return new Promise((resolve) => tg!.showConfirm(message, resolve));
  return Promise.resolve(window.confirm(message));
}

export function requestWriteAccess(): Promise<boolean> {
  if (!supports('6.9') || !tg!.requestWriteAccess) return Promise.resolve(true);
  return new Promise((resolve) => tg!.requestWriteAccess!(resolve));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
