const CHAT_DATE_DIVIDER_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const CHAT_MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Parses a numeric, string, or Date timestamp into Unix milliseconds.
 * Normalizes 10-digit Unix second timestamps to milliseconds; returns null when invalid.
 */
export function normalizeTimestampMs(timestamp?: number | string | Date | null): number | null {
  if (timestamp === null || timestamp === undefined || timestamp === "") return null;

  let time = 0;
  if (typeof timestamp === "number") {
    time = timestamp;
  } else if (typeof timestamp === "string") {
    const trimmed = timestamp.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    time = Number.isFinite(numeric) ? numeric : new Date(trimmed).getTime();
  } else if (timestamp instanceof Date) {
    time = timestamp.getTime();
  } else {
    return null;
  }

  if (!Number.isFinite(time) || time <= 0) return null;

  // Normalize seconds to milliseconds if necessary (e.g. 10-digit Unix timestamp)
  if (time < 10_000_000_000) {
    time *= 1000;
  }

  return time;
}

function toLocalDateKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveReferenceDate(nowOverride?: number | Date): Date {
  if (nowOverride instanceof Date && !Number.isNaN(nowOverride.getTime())) {
    return nowOverride;
  }
  if (typeof nowOverride === "number" && Number.isFinite(nowOverride)) {
    return new Date(nowOverride);
  }
  return new Date();
}

/**
 * Returns the local calendar date key ("YYYY-MM-DD") for a timestamp, or null when invalid.
 */
export function getLocalDateKey(timestamp?: number | string | Date | null): string | null {
  const timeMs = normalizeTimestampMs(timestamp);
  if (timeMs === null) return null;
  return toLocalDateKeyFromDate(new Date(timeMs));
}

/**
 * Formats a message timestamp into a chat day divider label:
 * "Today", "Yesterday", or e.g. "Thu, Nov 12, 2026".
 */
export function formatChatDateDivider(
  timestamp?: number | string | Date | null,
  nowOverride?: number | Date
): string {
  const timeMs = normalizeTimestampMs(timestamp);
  if (timeMs === null) return "";

  const targetDate = new Date(timeMs);
  const targetKey = toLocalDateKeyFromDate(targetDate);

  const nowDate = resolveReferenceDate(nowOverride);
  const todayKey = toLocalDateKeyFromDate(nowDate);
  if (targetKey === todayKey) {
    return "Today";
  }

  const yesterdayDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1);
  if (targetKey === toLocalDateKeyFromDate(yesterdayDate)) {
    return "Yesterday";
  }

  return CHAT_DATE_DIVIDER_FORMATTER.format(targetDate);
}

/**
 * Formats a full date and time string for message timestamp hover tooltips.
 * Falls back to `fallbackTime` when the numeric timestamp is unavailable.
 */
export function formatChatMessageTooltip(
  timestamp?: number | string | Date | null,
  fallbackTime?: string
): string {
  const timeMs = normalizeTimestampMs(timestamp);
  if (timeMs === null) return fallbackTime?.trim() || "";

  const date = new Date(timeMs);
  const datePart = CHAT_DATE_DIVIDER_FORMATTER.format(date);
  const timePart = fallbackTime?.trim() || CHAT_MESSAGE_TIME_FORMATTER.format(date);
  return `${datePart} · ${timePart}`;
}

/**
 * Computes the date divider label to render above each message in chronological order.
 * Returns null for messages on the same local calendar day as the preceding dated message,
 * or for messages without a valid timestamp.
 */
export function buildChatDateDividerLabels(
  messages: ReadonlyArray<{ timestamp?: number | string | Date | null }>,
  nowOverride?: number | Date
): Array<string | null> {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const labels: Array<string | null> = new Array(messages.length).fill(null);
  let lastDateKey: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateKey = getLocalDateKey(msg?.timestamp);
    if (!dateKey) continue;

    if (dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      labels[i] = formatChatDateDivider(msg.timestamp, nowOverride) || null;
    }
  }

  return labels;
}

/**
 * Formats a timestamp into a friendly, compact relative time string.
 * Examples: "just now", "23m", "2h", "1 day ago", "3 days ago", "1 week ago", "2 months ago".
 */
export function formatLastMessageTime(timestamp?: number | string | Date | null): string {
  const time = normalizeTimestampMs(timestamp);
  if (time === null) return "";

  const now = Date.now();
  const diffMs = now - time;

  // Under 60 seconds (also guards against minor clock drift)
  if (diffMs < 60 * 1000) {
    return "just now";
  }

  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 60) {
    return `${diffMin}m`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour}h`;
  }

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) {
    return "1 day ago";
  }
  if (diffDay < 7) {
    return `${diffDay} days ago`;
  }

  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek === 1) {
    return "1 week ago";
  }
  if (diffWeek < 5) {
    return `${diffWeek} weeks ago`;
  }

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth === 1) {
    return "1 month ago";
  }
  if (diffMonth < 12) {
    return `${diffMonth} months ago`;
  }

  const diffYear = Math.floor(diffDay / 365);
  return diffYear <= 1 ? "1 year ago" : `${diffYear} years ago`;
}
