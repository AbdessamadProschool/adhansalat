/**
 * Notifications and the bridge to the native Android scheduler.
 *
 * The web build must never imply that a browser can schedule a system alarm.
 * `nativeBridge()` is the only path to guaranteed background delivery, and it is
 * absent unless the page is hosted inside the Android WebView wrapper.
 */

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): NotifyPermission {
  // Inside the Android wrapper the page's Notification API reports "denied" even
  // when the system notification permission is granted: WebView does not
  // implement it. The native side is then the only truthful source.
  const native = nativeBridge()?.notificationPermission?.();
  if (native === 'granted' || native === 'denied' || native === 'default') return native;
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotifyPermission;
}

export async function requestNotificationPermission(): Promise<NotifyPermission> {
  const bridge = nativeBridge();
  if (bridge?.requestNotificationPermission) {
    bridge.requestNotificationPermission();
    return notificationPermission();
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    return result as NotifyPermission;
  } catch {
    return 'denied';
  }
}

let registration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  if (import.meta.env.DEV) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        await r.unregister();
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch {
    return null;
  }
}

export function serviceWorkerRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

export interface ShowOptions {
  tag?: string;
  silent?: boolean;
  vibrate?: number[];
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

/**
 * Shows a notification and reports whether it was actually displayed.
 * A missing permission is a failure, not a silent no-op.
 */
export async function showNotification(
  title: string,
  body: string,
  options: ShowOptions = {},
): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  const init: NotificationOptions & { vibrate?: number[] } = {
    body,
    tag: options.tag ?? 'azan',
    silent: options.silent ?? false,
    requireInteraction: options.requireInteraction ?? true,
    data: options.data ?? {},
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  };
  if (options.vibrate) init.vibrate = options.vibrate;

  try {
    if (registration?.showNotification) {
      await registration.showNotification(title, init);
      return true;
    }
    const n = new Notification(title, init);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export interface NativeBridge {
  /**
   * Stores the plan durably, cancels the alarms of the previous plan that are
   * obsolete, and arms the future events. Returns an `ArmResult` JSON string
   * (`{armed, skipped, deferred, reason}`) so the web layer can log what the OS
   * really did; older bridges may return nothing, which is reported as unknown.
   */
  schedule(payload: string): string | undefined;
  /** Cancels every armed alarm and clears the stored plan. The fired ledger is kept. */
  cancelAll(): void;
  /** Last reconciliation result recorded by the native side, as JSON, if any. */
  lastSyncResult?(): string | undefined;
  canScheduleExactAlarms?(): boolean;
  requestExactAlarmPermission?(): void;
  isIgnoringBatteryOptimizations?(): boolean;
  openNotificationSettings?(): void;
  platform?(): string;
  /** "granted" | "denied" | "default" as reported by the Android side. */
  notificationPermission?(): string;
  requestNotificationPermission?(): void;
  openNativeDiagnostics?(): void;
  isAdhanPlaying?(): boolean;
  stopAdhan?(): void;
  getNativeCompassHeading?(): number;
  getGeomagneticDeclination?(latitude: number, longitude: number, altitude: number): number;
  setMosqueMode?(durationMinutes: number): void;
  getMosqueMode?(): number;
  /**
   * Copies the audio file just picked through the Android file chooser into the
   * app's private storage so the native player can use it. Returns a JSON
   * `{ok, id?, bytes?, mime?, reason?}`. Only available inside the wrapper.
   */
  importSound?(id: string, name: string): string | undefined;
  deleteImportedSound?(id: string): void;
}

export function nativeBridge(): NativeBridge | null {
  const w = window as unknown as { AzanNative?: NativeBridge };
  const bridge = w.AzanNative;
  return bridge && typeof bridge.schedule === 'function' ? bridge : null;
}

export function vibrate(pattern: number[] = [180, 90, 180]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration is a nicety, never a failure path */
  }
}
