export const PUSH_PREF_KEY = "tchaikovsky-push-enabled";

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

export interface StorageReadWriteLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EnablePushResult {
  ok: boolean;
  permission: BrowserNotificationPermission;
  endpoint?: string;
  error?: string;
}

export interface TestPushResult {
  ok: boolean;
  error?: string;
}

export type AuthFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const PUSH_API_BASE = "/api/push";

function resolveBrowserStorage(): StorageReadWriteLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (err) {
    console.warn("Unable to access localStorage for push preference:", err);
    return null;
  }
}

export function readPushOptInPreference(
  storage: StorageReadWriteLike | null = resolveBrowserStorage()
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PUSH_PREF_KEY) === "true";
  } catch (err) {
    console.warn("Failed to read push opt-in preference:", err);
    return false;
  }
}

export function writePushOptInPreference(
  enabled: boolean,
  storage: StorageReadWriteLike | null = resolveBrowserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(PUSH_PREF_KEY, enabled ? "true" : "false");
  } catch (err) {
    console.warn("Failed to persist push opt-in preference:", err);
  }
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    (window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  if (typeof atob === "function") {
    const rawData = atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const output = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i += 1) {
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  }

  const decoded = Buffer.from(base64, "base64");
  const buffer = new ArrayBuffer(decoded.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < decoded.length; i += 1) {
    output[i] = decoded[i];
  }
  return output;
}

export function serializePushSubscription(
  subscription: PushSubscription
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const json = subscription.toJSON();
  const endpoint = typeof json.endpoint === "string" ? json.endpoint.trim() : subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn("Failed to inspect existing push subscription:", err);
    return null;
  }
}

async function fetchVapidPublicKey(authFetch: AuthFetchFn): Promise<string | null> {
  const res = await authFetch(`${PUSH_API_BASE}/public-key`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || typeof data.publicKey !== "string" || !data.publicKey.trim()) {
    return null;
  }
  return data.publicKey.trim();
}

async function savePushSubscriptionOnServer(
  authFetch: AuthFetchFn,
  subscription: PushSubscription
): Promise<boolean> {
  const payload = serializePushSubscription(subscription);
  if (!payload) return false;
  const res = await authFetch(`${PUSH_API_BASE}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: payload }),
  });
  const data = await res.json().catch(() => null);
  return Boolean(res.ok && data?.success);
}

/**
 * Silently ensures an active PushSubscription is synced with the backend when the user
 * already opted in and browser notification permission is granted.
 */
export async function syncActivePushSubscription(authFetch: AuthFetchFn): Promise<string | null> {
  if (!isPushSupported()) return null;
  if (Notification.permission !== "granted") return null;
  if (!readPushOptInPreference()) return null;

  try {
    const registration = await registerNotificationServiceWorker();
    if (!registration) return null;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await fetchVapidPublicKey(authFetch);
      if (!publicKey) return null;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const saved = await savePushSubscriptionOnServer(authFetch, subscription);
    return saved ? subscription.endpoint : null;
  } catch (err) {
    console.warn("Failed to sync active push subscription:", err);
    return null;
  }
}

export async function enableDevicePushNotifications(
  authFetch: AuthFetchFn
): Promise<EnablePushResult> {
  if (!isPushSupported()) {
    return {
      ok: false,
      permission: getBrowserNotificationPermission(),
      error: "Device notifications require HTTPS and a browser with Web Push support.",
    };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch (err) {
      console.warn("Notification permission request failed:", err);
      return {
        ok: false,
        permission: Notification.permission,
        error: "Unable to request notification permission in this browser.",
      };
    }
  }

  if (permission === "denied") {
    writePushOptInPreference(false);
    return {
      ok: false,
      permission: "denied",
      error: "Notifications are blocked in browser site settings. Allow notifications for this site to turn them on.",
    };
  }

  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      error: "Notification permission was dismissed. Click again to allow notifications.",
    };
  }

  try {
    const registration = await registerNotificationServiceWorker();
    if (!registration) {
      return {
        ok: false,
        permission: "granted",
        error: "Could not register the notification service worker.",
      };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await fetchVapidPublicKey(authFetch);
      if (!publicKey) {
        return {
          ok: false,
          permission: "granted",
          error: "Push server is not configured yet. Deploy the latest backend update and try again.",
        };
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const saved = await savePushSubscriptionOnServer(authFetch, subscription);
    if (!saved) {
      return {
        ok: false,
        permission: "granted",
        error: "Could not save this device subscription on the server.",
      };
    }

    writePushOptInPreference(true);
    return {
      ok: true,
      permission: "granted",
      endpoint: subscription.endpoint,
    };
  } catch (err) {
    console.warn("Failed to enable device push notifications:", err);
    return {
      ok: false,
      permission: getBrowserNotificationPermission(),
      error: "Failed to enable device notifications on this browser.",
    };
  }
}

export async function disableDevicePushNotifications(authFetch: AuthFetchFn): Promise<void> {
  writePushOptInPreference(false);
  const existing = await getExistingPushSubscription();
  if (!existing) return;

  try {
    await authFetch(`${PUSH_API_BASE}/unsubscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: existing.endpoint }),
    });
  } catch (err) {
    console.warn("Failed to remove push subscription from server:", err);
  }

  try {
    await existing.unsubscribe();
  } catch (err) {
    console.warn("Failed to unsubscribe browser push manager:", err);
  }
}

export async function sendTestDevicePush(
  authFetch: AuthFetchFn,
  endpoint?: string | null
): Promise<TestPushResult> {
  try {
    const res = await authFetch(`${PUSH_API_BASE}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || "Could not send test device notification.",
      };
    }
    return { ok: true };
  } catch (err) {
    console.warn("Failed to send test device push:", err);
    return { ok: false, error: "Network error while sending test notification." };
  }
}

/**
 * Unlinks the current browser push subscription when signing out so a shared
 * device never receives lead notifications after logout.
 */
export async function cleanupPushOnLogout(token: string | null): Promise<void> {
  const existing = await getExistingPushSubscription();
  if (!existing) return;

  if (token && typeof fetch === "function") {
    try {
      await fetch(`${PUSH_API_BASE}/unsubscribe`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: existing.endpoint }),
        keepalive: true,
      });
    } catch (err) {
      console.warn("Failed to unlink push subscription on logout:", err);
    }
  }

  try {
    await existing.unsubscribe();
  } catch (err) {
    console.warn("Failed to unsubscribe push manager on logout:", err);
  }
}

