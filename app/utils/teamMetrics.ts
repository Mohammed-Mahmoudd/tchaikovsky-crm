export interface ActivityLogEntryLike {
  id: string;
  type: string;
  actor?: string;
  toValue?: string;
  timestamp: number;
}

export interface ConversationSourceLike {
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  paidAt?: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  activityLog?: ReadonlyArray<ActivityLogEntryLike>;
}

export interface TeamConversationLike {
  pipeline?: string;
  auditionDate?: string;
  auditionOutcome?: string;
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  paidAt?: string;
  cashIn?: number;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: number;
  source?: ConversationSourceLike | string;
  activityLog?: ReadonlyArray<ActivityLogEntryLike>;
}

export interface LoggedMessageKeys {
  ids: Set<string>;
  fallbackTimestamps: Set<number>;
}

export const ATTENDED_OUTCOMES = new Set([
  "registered",
  "paid-trial",
  "schedule-followup",
  "attended",
  "passed",
]);

const BOOKED_PIPELINES = new Set([
  "audition booked",
  "attended",
  "enrolled",
  "audition confirmed",
  "audition attended",
  "audition passed",
  "payment pending",
  "registered",
]);

const ATTENDED_PIPELINES = new Set([
  "attended",
  "enrolled",
  "audition attended",
  "audition passed",
  "payment pending",
  "registered",
]);

/** Parses an ISO date string or epoch millisecond value into a finite epoch timestamp, or 0. */
export function parseValidTs(val?: string | number | null): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

/** Returns the best creation timestamp for a conversation. */
export function getCreatedTime(c: TeamConversationLike): number {
  const created = parseValidTs(c.createdAt);
  if (created > 0) return created;
  if (c.lastMessageAt && Number.isFinite(c.lastMessageAt)) return c.lastMessageAt;
  return parseValidTs(c.updatedAt);
}

/** Returns the best last-updated timestamp for a conversation, falling back to creation time. */
export function getUpdatedTime(c: TeamConversationLike): number {
  const updated = parseValidTs(c.updatedAt);
  if (updated > 0) return updated;
  return getCreatedTime(c);
}

function getSourceObject(c: TeamConversationLike): ConversationSourceLike | null {
  return typeof c.source === "object" && c.source !== null ? c.source : null;
}

function findEarliestActivityTs(
  c: TeamConversationLike,
  predicate: (entry: ActivityLogEntryLike) => boolean
): number | null {
  const src = getSourceObject(c);
  const logs = [c.activityLog, src?.activityLog];
  let earliest: number | null = null;
  for (let l = 0; l < logs.length; l++) {
    const list = logs[l];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || !entry.timestamp || !Number.isFinite(entry.timestamp) || entry.timestamp <= 0) continue;
      if (!predicate(entry)) continue;
      if (earliest === null || entry.timestamp < earliest) {
        earliest = entry.timestamp;
      }
    }
  }
  return earliest;
}

/**
 * Returns true if the lead actually attended an audition (or progressed past it),
 * explicitly excluding non-attendance outcomes such as "no-show" and "joining-later".
 */
export function isAttendedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  const out = (c.auditionOutcome || "").toLowerCase().trim();
  const cash = Number(c.cashIn) || 0;
  if (out === "no-show" && p !== "enrolled" && cash <= 0) {
    return false;
  }
  if (ATTENDED_PIPELINES.has(p)) return true;
  return ATTENDED_OUTCOMES.has(out);
}

/** Returns true if an audition was booked for the lead (including past/no-show bookings). */
export function isBookedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  if (BOOKED_PIPELINES.has(p)) return true;
  if (c.auditionDate && String(c.auditionDate).trim()) return true;
  return isAttendedLead(c);
}

/** Returns true if the lead enrolled or recorded tuition cash. */
export function isConvertedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  const out = (c.auditionOutcome || "").toLowerCase().trim();
  return p === "enrolled" || p.includes("registered") || out === "registered" || (Number(c.cashIn) || 0) > 0;
}

/** Resolves the canonical booking timestamp for period filtering. */
export function getBookedTime(c: TeamConversationLike): number | null {
  if (!isBookedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.auditionBookedAt || src?.auditionBookedAt);
  if (explicit > 0) return explicit;

  const logTs = findEarliestActivityTs(c, (e) => e.type === "audition_booked");
  if (logTs !== null) return logTs;

  if (c.pipeline === "Audition Booked") {
    const upd = getUpdatedTime(c);
    if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
      const [y, m, d] = c.auditionDate.split("-").map(Number);
      if (y >= 2020) {
        const auditionDayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        if (upd > auditionDayEnd) {
          return Math.min(getCreatedTime(c), auditionDayEnd);
        }
      }
    }
    return upd;
  }

  return getCreatedTime(c);
}

/** Resolves the canonical attendance timestamp for period filtering. */
export function getAttendedTime(c: TeamConversationLike): number | null {
  if (!isAttendedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.attendedAt || src?.attendedAt);
  if (explicit > 0) return explicit;

  if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
    const [y, m, d] = c.auditionDate.split("-").map(Number);
    if (y >= 2020) {
      return new Date(y, m - 1, d, 14, 0, 0, 0).getTime();
    }
  }

  const logTs = findEarliestActivityTs(
    c,
    (e) =>
      (e.type === "audition_outcome" && ATTENDED_OUTCOMES.has((e.toValue || "").toLowerCase().trim())) ||
      (e.type === "stage_changed" && ATTENDED_PIPELINES.has((e.toValue || "").toLowerCase().trim()))
  );
  if (logTs !== null) return logTs;

  return getUpdatedTime(c);
}

/** Resolves the canonical enrollment / payment timestamp for period filtering. */
export function getConvertedTime(c: TeamConversationLike): number | null {
  if (!isConvertedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.enrolledAt || c.paidAt || src?.enrolledAt || src?.paidAt);
  if (explicit > 0) return explicit;

  const logTs = findEarliestActivityTs(
    c,
    (e) =>
      e.type === "cash_recorded" ||
      (e.type === "audition_outcome" && (e.toValue || "").toLowerCase().trim() === "registered") ||
      (e.type === "stage_changed" && (e.toValue || "").toLowerCase().trim() === "enrolled")
  );
  if (logTs !== null) return logTs;

  return getUpdatedTime(c);
}

/** Computes a percentage clamped to [0, 100], returning 0 when denominator <= 0. */
export function clampRatePct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0 || !numerator || numerator <= 0) return 0;
  return Math.min(100, Math.max(0, (numerator / denominator) * 100));
}

/**
 * Collects message IDs (and timestamp-only fallbacks) already represented as `message_sent`
 * entries in `activityLog` so loaded `messages[]` can backfill older/uncapped replies without duplicates.
 */
export function collectLoggedMessageKeys(
  activityLog?: ReadonlyArray<ActivityLogEntryLike>
): LoggedMessageKeys {
  const ids = new Set<string>();
  const fallbackTimestamps = new Set<number>();
  if (!Array.isArray(activityLog)) return { ids, fallbackTimestamps };

  for (let i = 0; i < activityLog.length; i++) {
    const entry = activityLog[i];
    if (!entry || entry.type !== "message_sent") continue;
    const rawId = String(entry.id || "");
    if (rawId.startsWith("msg_")) {
      const msgPart = rawId.slice(4);
      if (msgPart) ids.add(msgPart);
      // Only use timestamp matching when the logged ID fell back to a raw timestamp (no platform messageId).
      if (/^\d+$/.test(msgPart) && entry.timestamp > 0) {
        fallbackTimestamps.add(entry.timestamp);
      }
    } else if (entry.timestamp > 0) {
      fallbackTimestamps.add(entry.timestamp);
    }
  }
  return { ids, fallbackTimestamps };
}

/** Returns true if a loaded message is already accounted for by an `activityLog` `message_sent` entry. */
export function isMessageAlreadyInActivityLog(
  msg: { id?: string; timestamp?: number },
  logged: LoggedMessageKeys
): boolean {
  if (msg.id && logged.ids.has(String(msg.id))) return true;
  if (msg.timestamp && logged.fallbackTimestamps.has(msg.timestamp)) return true;
  return false;
}

