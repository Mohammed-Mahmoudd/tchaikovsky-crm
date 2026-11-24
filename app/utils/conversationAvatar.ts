export interface AvatarLikeConversation {
  id: string;
  channel?: string;
  isGroup?: boolean;
  profilePic?: string | null;
  groupMeta?: {
    avatarUrl?: string | null;
  } | null;
}

export const AVATAR_BATCH_SIZE = 24;
export const AVATAR_MISS_COOLDOWN_MS = 5 * 60 * 1000;
export const AVATAR_ERROR_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export function isValidAvatarUrl(val: unknown): val is string {
  return typeof val === "string" && /^https?:\/\//i.test(val.trim());
}

/**
 * Resolves the stored avatar URL for either a 1-to-1 chat (`profilePic`)
 * or a WhatsApp group (`groupMeta.avatarUrl`), returning null if missing or invalid.
 */
export function getConversationAvatarUrl(
  conv?: AvatarLikeConversation | null
): string | null {
  if (!conv) return null;
  const raw =
    conv.isGroup && conv.channel === "WA"
      ? conv.groupMeta?.avatarUrl
      : conv.profilePic;
  return isValidAvatarUrl(raw) ? raw.trim() : null;
}

/**
 * Extracts up to 2 uppercase initials for a lead/contact avatar fallback.
 * Returns "" for generic channel placeholders or phone-number-only names.
 */
export function getChatAvatarInitials(name?: string | null): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    lower === "whatsapp contact" ||
    lower === "instagram user" ||
    lower === "facebook lead" ||
    lower === "messenger user" ||
    lower === "unknown" ||
    lower.startsWith("live ")
  ) {
    return "";
  }
  const parts = raw
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((p) => /\p{L}/u.test(p));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export interface PartitionBatchParams {
  normalQueue: Set<string>;
  forceQueue: Set<string>;
  maxBatchSize?: number;
}

/**
 * Drains up to `maxBatchSize` IDs from the force-refresh and normal queues,
 * giving force-refresh IDs priority so broken visible images recover first.
 */
export function drainAvatarBatch({
  normalQueue,
  forceQueue,
  maxBatchSize = AVATAR_BATCH_SIZE,
}: PartitionBatchParams): { ids: string[]; forceIds: string[] } {
  const ids: string[] = [];
  const forceIds: string[] = [];
  const seen = new Set<string>();

  for (const id of Array.from(forceQueue)) {
    if (ids.length >= maxBatchSize) break;
    forceQueue.delete(id);
    normalQueue.delete(id);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
      forceIds.push(id);
    }
  }

  for (const id of Array.from(normalQueue)) {
    if (ids.length >= maxBatchSize) break;
    normalQueue.delete(id);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return { ids, forceIds };
}

