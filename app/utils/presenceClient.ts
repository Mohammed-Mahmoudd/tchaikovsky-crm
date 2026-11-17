export type PresenceHeartbeatEvent = "open" | "ping" | "navigate" | "focus" | "blur" | "leave";

const API_BASE = "/api";
const DIRECT_API_BASE = "https://api.tchaikovskyschool.com/crm-api";

let tabIdSingleton: string | null = null;
let endpointUnsupported = false;

export function getClientTabId(): string {
  if (tabIdSingleton) return tabIdSingleton;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    tabIdSingleton = crypto.randomUUID();
  } else {
    tabIdSingleton = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return tabIdSingleton;
}

export function resetPresenceClientSupportState(): void {
  endpointUnsupported = false;
}

export async function postPresenceHeartbeat({
  token,
  event,
  screen,
  isVisible,
  isActive,
  idleMs,
  keepalive = false,
}: {
  token: string | null | undefined;
  event: PresenceHeartbeatEvent;
  screen?: string | null;
  isVisible: boolean;
  isActive: boolean;
  idleMs: number;
  keepalive?: boolean;
}): Promise<boolean> {
  if (!token || endpointUnsupported) return false;

  const cleanScreen = typeof screen === "string" && screen.trim() ? screen.trim() : undefined;
  const payload = JSON.stringify({
    tabId: getClientTabId(),
    event,
    ...(cleanScreen ? { screen: cleanScreen } : {}),
    isVisible,
    isActive,
    idleMs: Math.max(0, Math.floor(idleMs)),
  });

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: payload,
    keepalive,
    cache: "no-store",
  };

  try {
    let res = await fetch(`${API_BASE}/presence/heartbeat`, requestInit).catch(() => null);
    if (!res || (!res.ok && res.status !== 401 && res.status !== 403 && res.status !== 404)) {
      res = await fetch(`${DIRECT_API_BASE}/presence/heartbeat`, requestInit).catch(() => null);
    }
    if (!res) return false;
    if (res.status === 404) {
      // Backend not yet updated with presence routes; pause gracefully until next page load
      endpointUnsupported = true;
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
}

