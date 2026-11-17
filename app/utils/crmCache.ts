export const CRM_CONVERSATION_CACHE_KEYS = [
  "crm_conversations_cache_v3",
  "crm_conversations_cache_v2",
  "crm_conversations_cache",
  "crm_manual_leads_v1",
] as const;

export const CRM_STATIC_LOCAL_STORAGE_KEYS = [
  ...CRM_CONVERSATION_CACHE_KEYS,
  "crm_branches_cache",
  "crm_labels_cache_v1",
  "tchaikovsky_quick_replies_v1",
  "crm_team_metrics_cache_v1",
] as const;

export const CRM_LOCAL_STORAGE_PREFIXES = ["crm_cash_", "crm_team_metrics_"] as const;

export const CRM_SESSION_STORAGE_KEYS = ["tchaikovsky_dismiss_avatar_modal"] as const;

export const CRM_IDB_NAME = "tchaikovsky_crm_cache_db";

export interface StorageLike {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export interface ClearCachesOptions {
  localStorage?: StorageLike | null;
  sessionStorage?: StorageLike | null;
  deleteDatabase?: (name: string) => unknown;
}

function removeKeysByExactAndPrefix(
  store: StorageLike | null | undefined,
  exactKeys: readonly string[],
  prefixes: readonly string[]
): void {
  if (!store) return;

  for (const key of exactKeys) {
    try {
      store.removeItem(key);
    } catch {}
  }

  if (prefixes.length === 0) return;

  try {
    const matchingKeys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        matchingKeys.push(key);
      }
    }
    for (const key of matchingKeys) {
      store.removeItem(key);
    }
  } catch {}
}

/**
 * Clears all cached CRM data from browser storage upon sign-out or session revocation,
 * leaving non-sensitive UI preferences such as `tchaikovsky-theme` intact.
 */
export function clearAllCrmClientCaches(options?: ClearCachesOptions): void {
  const local =
    options?.localStorage !== undefined
      ? options.localStorage
      : typeof window !== "undefined"
        ? window.localStorage
        : null;

  const session =
    options?.sessionStorage !== undefined
      ? options.sessionStorage
      : typeof window !== "undefined"
        ? window.sessionStorage
        : null;

  removeKeysByExactAndPrefix(local, CRM_STATIC_LOCAL_STORAGE_KEYS, CRM_LOCAL_STORAGE_PREFIXES);
  removeKeysByExactAndPrefix(session, CRM_SESSION_STORAGE_KEYS, ["crm_", "tchaikovsky_"]);

  const deleteDb =
    options?.deleteDatabase !== undefined
      ? options.deleteDatabase
      : typeof window !== "undefined" && typeof indexedDB !== "undefined"
        ? (name: string) => indexedDB.deleteDatabase(name)
        : null;

  if (deleteDb) {
    try {
      deleteDb(CRM_IDB_NAME);
    } catch {}
  }
}

