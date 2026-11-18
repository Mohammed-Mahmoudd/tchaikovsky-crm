export const AUDITION_LOCKED_DATES_KEY = "audition_locked_dates";
export const AUDITION_STATUS_OVERRIDES_KEY = "audition_status_overrides";
export const AUDITION_CLOSED_SLOTS_KEY = "audition_closed_slots";
export const AUDITION_CACHE_UPDATED_EVENT = "crm:audition-cache-updated";

export const STANDARD_AUDITION_TIME_SLOTS = [
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
  "06:00 PM",
  "06:30 PM",
  "07:00 PM",
  "07:30 PM",
  "08:00 PM",
  "08:30 PM",
  "09:00 PM",
] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_12H_RE = /\b(0?[1-9]|1[0-2]):([0-5][0-9])\s*(AM|PM)\b/i;
const TIME_24H_RE = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/;
const LEADING_TIME_PREFIX_RE =
  /^(?:(?:0?[1-9]|1[0-2]):[0-5][0-9]\s*(?:AM|PM)|(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\s*(?:[·\-|,]\s*)?/i;

export interface AuditionScheduleConversationLike {
  id: string;
  pipeline?: string;
  auditionDate?: string | null;
  auditionOutcome?: string | null;
  followUpDate?: string | null;
  followUpNote?: string | null;
  followUpCompleted?: boolean;
  notes?: string | null;
  branch?: string | null;
  lastMessageAt?: number | null;
  createdAt?: string | null;
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
  };
}

export interface StorageReadWriteLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BookingModalDefaults {
  date: string;
  time: string;
  notes: string;
  branch: string;
}

export interface AuditionBookingInput {
  date: string;
  time: string;
  notes?: string;
  branch: string;
}

export interface AuditionBookingPatch {
  pipeline: "Audition Booked";
  auditionDate: string;
  followUpDate: string;
  followUpNote: string;
  branch: string;
  auditionOutcome: "";
  followUpCompleted: false;
  followUpCompletedAt: null;
  notes?: string;
}

export interface SyncAuditionSlotCacheOptions {
  auditionDate?: string;
  clearStatusOverride?: boolean;
  clearClosedSlot?: boolean;
  storage?: StorageReadWriteLike | null;
  dispatchEvent?: ((event: Event) => boolean) | null;
}

export interface ReconcileAuditionCachesResult<TStatus extends string = string> {
  auditionDates: Record<string, string>;
  statusOverrides: Record<string, TStatus>;
  changed: boolean;
}

/** Formats a Date as a local calendar YYYY-MM-DD string. */
export function getLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns true when a value is a YYYY-MM-DD calendar date string. */
export function isIsoDateString(value?: string | null): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value.trim());
}

/** Normalizes 12-hour or 24-hour time strings into canonical `HH:MM AM/PM` format. */
export function normalizeAuditionTimeLabel(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const m12 = trimmed.match(TIME_12H_RE);
  if (m12) {
    const hour = String(Number(m12[1])).padStart(2, "0");
    const mins = m12[2];
    const period = m12[3].toUpperCase();
    return `${hour}:${mins} ${period}`;
  }

  const m24 = trimmed.match(TIME_24H_RE);
  if (m24) {
    const hour24 = Number(m24[1]);
    const mins = m24[2];
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${String(hour12).padStart(2, "0")}:${mins} ${period}`;
  }

  return "";
}

function parseMinutesSinceMidnight(timeLabel: string): number {
  const normalized = normalizeAuditionTimeLabel(timeLabel);
  const m12 = normalized.match(TIME_12H_RE);
  if (!m12) return Number.MAX_SAFE_INTEGER;
  let hour = Number(m12[1]) % 12;
  if (m12[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(m12[2]);
}

/** Extracts an explicitly stored audition time from followUpNote (first) or notes. */
export function extractExplicitAuditionTime(
  conv?: Pick<AuditionScheduleConversationLike, "followUpNote" | "notes"> | null
): string {
  if (!conv) return "";
  const fromFollowUp = normalizeAuditionTimeLabel(conv.followUpNote);
  if (fromFollowUp) return fromFollowUp;
  return normalizeAuditionTimeLabel(conv.notes);
}

/** Resolves the display time for an audition calendar slot with message-time fallback. */
export function resolveAuditionTimeForCalendar(
  conv?: Pick<AuditionScheduleConversationLike, "followUpNote" | "notes" | "lastMessageAt"> | null
): string {
  const explicit = extractExplicitAuditionTime(conv);
  if (explicit) return explicit;

  if (conv?.lastMessageAt) {
    try {
      const formatted = new Date(conv.lastMessageAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const normalized = normalizeAuditionTimeLabel(formatted);
      if (normalized) return normalized;
    } catch {}
  }

  return "05:00 PM";
}

/** Extracts the note suffix after a leading time prefix in followUpNote, or falls back to instrument. */
export function extractAuditionNoteSuffix(
  followUpNote?: string | null,
  fallbackInstrument?: string | null
): string {
  const fallback = (fallbackInstrument || "").trim();
  const rawNote = (followUpNote || "").trim();
  if (!rawNote) return fallback;

  if (TIME_12H_RE.test(rawNote) || TIME_24H_RE.test(rawNote)) {
    const stripped = rawNote.replace(LEADING_TIME_PREFIX_RE, "").trim();
    if (stripped) return stripped;
  }

  return fallback;
}

/** Returns selectable time options, preserving any custom/non-standard booked time in chronological order. */
export function getAuditionTimeSelectOptions(currentTime?: string | null): string[] {
  const normalized = normalizeAuditionTimeLabel(currentTime);
  const base: string[] = [...STANDARD_AUDITION_TIME_SLOTS];
  if (!normalized || base.includes(normalized)) {
    return base;
  }
  return [normalized, ...base].sort(
    (a, b) => parseMinutesSinceMidnight(a) - parseMinutesSinceMidnight(b)
  );
}

/** Computes initial form values for the Book/Reschedule Audition modal from the stored conversation. */
export function buildBookingModalDefaults(
  conv: AuditionScheduleConversationLike,
  todayIso = getLocalIsoDate()
): BookingModalDefaults {
  const storedAuditionDate = isIsoDateString(conv.auditionDate) ? conv.auditionDate.trim() : "";
  const storedFollowUpDate = isIsoDateString(conv.followUpDate) ? conv.followUpDate.trim() : "";
  return {
    date: storedAuditionDate || storedFollowUpDate || todayIso,
    time: extractExplicitAuditionTime(conv) || "05:00 PM",
    notes: extractAuditionNoteSuffix(conv.followUpNote, conv.formAnswers?.instrument),
    branch: (conv.branch || "").trim(),
  };
}

function cleanNoShowTagsForReschedule(notes?: string | null): string | undefined {
  if (!notes) return undefined;
  const raw = notes.trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/\[no[- ]?show\]/gi, "").trim();
  const normalized = cleaned.toLowerCase() === "no-show" ? "" : cleaned;
  return normalized !== raw ? normalized : undefined;
}

/** Builds the PATCH payload for booking or rescheduling an audition so stale outcome/follow-up flags reset. */
export function buildAuditionBookingPatch(
  conv: Pick<AuditionScheduleConversationLike, "notes"> | null | undefined,
  input: AuditionBookingInput
): AuditionBookingPatch {
  const normalizedDate = input.date.trim();
  const normalizedTime = normalizeAuditionTimeLabel(input.time) || input.time.trim() || "05:00 PM";
  const cleanNotes = (input.notes || "").trim();
  const formattedNote = cleanNotes ? `${normalizedTime} · ${cleanNotes}` : normalizedTime;
  const cleanedLeadNotes = cleanNoShowTagsForReschedule(conv?.notes);

  const patch: AuditionBookingPatch = {
    pipeline: "Audition Booked",
    auditionDate: normalizedDate,
    followUpDate: normalizedDate,
    followUpNote: formattedNote,
    branch: input.branch.trim(),
    auditionOutcome: "",
    followUpCompleted: false,
    followUpCompletedAt: null,
  };

  if (cleanedLeadNotes !== undefined) {
    patch.notes = cleanedLeadNotes;
  }

  return patch;
}

/** Safely reads a JSON dictionary from Storage. */
export function readAuditionJsonRecord<T>(
  storage: StorageReadWriteLike | null | undefined,
  key: string
): Record<string, T> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

/** Safely writes (or removes when empty) a JSON dictionary in Storage. */
export function writeAuditionJsonRecord<T>(
  storage: StorageReadWriteLike | null | undefined,
  key: string,
  record: Record<string, T>
): void {
  if (!storage) return;
  try {
    if (Object.keys(record).length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(record));
    }
  } catch {}
}

/** Synchronizes Auditions localStorage caches when an audition is booked, rescheduled, or updated from Inbox/Pipeline. */
export function syncAuditionSlotCacheOnUpdate(
  conversationId: string,
  options: SyncAuditionSlotCacheOptions = {}
): void {
  if (!conversationId) return;
  const storage =
    options.storage !== undefined
      ? options.storage
      : typeof window !== "undefined"
        ? window.localStorage
        : null;
  if (!storage) return;

  const keys = [conversationId, `crm-${conversationId}`];

  if (options.auditionDate !== undefined) {
    const dates = readAuditionJsonRecord<string>(storage, AUDITION_LOCKED_DATES_KEY);
    let changed = false;
    if (isIsoDateString(options.auditionDate)) {
      const targetDate = options.auditionDate.trim();
      for (const k of keys) {
        if (dates[k] !== targetDate) {
          dates[k] = targetDate;
          changed = true;
        }
      }
    } else {
      for (const k of keys) {
        if (k in dates) {
          delete dates[k];
          changed = true;
        }
      }
    }
    if (changed) {
      writeAuditionJsonRecord(storage, AUDITION_LOCKED_DATES_KEY, dates);
    }
  }

  if (options.clearStatusOverride) {
    const overrides = readAuditionJsonRecord<string>(storage, AUDITION_STATUS_OVERRIDES_KEY);
    let changed = false;
    for (const k of keys) {
      if (k in overrides) {
        delete overrides[k];
        changed = true;
      }
    }
    if (changed) {
      writeAuditionJsonRecord(storage, AUDITION_STATUS_OVERRIDES_KEY, overrides);
    }
  }

  if (options.clearClosedSlot) {
    const closed = readAuditionJsonRecord<boolean>(storage, AUDITION_CLOSED_SLOTS_KEY);
    let changed = false;
    for (const k of keys) {
      if (k in closed) {
        delete closed[k];
        changed = true;
      }
    }
    if (changed) {
      writeAuditionJsonRecord(storage, AUDITION_CLOSED_SLOTS_KEY, closed);
    }
  }

  const dispatch =
    options.dispatchEvent !== undefined
      ? options.dispatchEvent
      : typeof window !== "undefined" && typeof CustomEvent !== "undefined"
        ? (evt: Event) => window.dispatchEvent(evt)
        : null;
  if (dispatch) {
    try {
      dispatch(new CustomEvent(AUDITION_CACHE_UPDATED_EVENT, { detail: { conversationId } }));
    } catch {}
  }
}

/** Resolves the calendar date key, always prioritizing the real stored `auditionDate` over stale local cache. */
export function resolveCalendarSlotDateKey(
  conv: AuditionScheduleConversationLike,
  auditionDates: Readonly<Record<string, string>>,
  todayIso: string
): string {
  if (isIsoDateString(conv.auditionDate)) {
    return conv.auditionDate.trim();
  }

  const localLocked = auditionDates[conv.id] || auditionDates[`crm-${conv.id}`];
  if (isIsoDateString(localLocked)) {
    return localLocked.trim();
  }

  if (isIsoDateString(conv.followUpDate)) {
    return conv.followUpDate.trim();
  }

  if (conv.createdAt) {
    try {
      const created = new Date(conv.createdAt);
      if (!Number.isNaN(created.getTime())) {
        return getLocalIsoDate(created);
      }
    } catch {}
  }

  return todayIso;
}

/** Resolves slot status, prioritizing real stored `auditionOutcome` / `Audition Booked` pipeline over stale overrides. */
export function resolveCalendarSlotStatus<TStatus extends string>(
  conv: AuditionScheduleConversationLike,
  statusOverrides: Readonly<Record<string, TStatus>>,
  closedSlots: Readonly<Record<string, boolean>>,
  parseOutcome: (val: unknown) => TStatus | null
): TStatus | "booked" | "closed" {
  if (closedSlots[`crm-${conv.id}`] || closedSlots[conv.id]) {
    return "closed";
  }

  if (conv.auditionOutcome) {
    const parsed = parseOutcome(conv.auditionOutcome);
    if (parsed) return parsed;
  }

  if (conv.pipeline === "Audition Booked") {
    return "booked";
  }

  const override = statusOverrides[conv.id] || statusOverrides[`crm-${conv.id}`];
  if (override) {
    return override;
  }

  if (conv.pipeline === "Enrolled") {
    return "registered" as TStatus;
  }
  if (conv.pipeline === "Attended") {
    return "schedule-followup" as TStatus;
  }
  if (conv.pipeline === "Lost" || (conv.notes && conv.notes.toLowerCase().includes("no-show"))) {
    return "no-show" as TStatus;
  }

  return "booked";
}

function extractConversationIdFromCacheKey(key: string): string {
  return key.startsWith("crm-") ? key.slice(4) : key;
}

/** Reconciles cached audition dates and status overrides against live CRM conversations so stale entries never linger. */
export function reconcileAuditionLocalCaches<
  TConv extends AuditionScheduleConversationLike,
  TStatus extends string,
>(
  conversations: ReadonlyArray<TConv>,
  caches: {
    auditionDates: Readonly<Record<string, string>>;
    statusOverrides: Readonly<Record<string, TStatus>>;
  },
  parseOutcome: (val: unknown) => TStatus | null,
  isLiveServerAudition: (conv: TConv) => boolean
): ReconcileAuditionCachesResult<TStatus> {
  const byId = new Map<string, TConv>();
  for (const conv of conversations) {
    if (conv && conv.id) {
      byId.set(conv.id, conv);
    }
  }

  const nextDates: Record<string, string> = {};
  const nextOverrides: Record<string, TStatus> = {};
  let changed = false;

  for (const [key, cachedDate] of Object.entries(caches.auditionDates)) {
    const convId = extractConversationIdFromCacheKey(key);
    const conv = byId.get(convId);
    if (!conv) {
      nextDates[key] = cachedDate;
      continue;
    }
    if (!isLiveServerAudition(conv)) {
      changed = true;
      continue;
    }
    if (isIsoDateString(conv.auditionDate)) {
      const realDate = conv.auditionDate.trim();
      nextDates[key] = realDate;
      if (realDate !== cachedDate) {
        changed = true;
      }
    } else {
      nextDates[key] = cachedDate;
    }
  }

  for (const [key, cachedStatus] of Object.entries(caches.statusOverrides)) {
    const convId = extractConversationIdFromCacheKey(key);
    const conv = byId.get(convId);
    if (!conv) {
      nextOverrides[key] = cachedStatus;
      continue;
    }
    if (!isLiveServerAudition(conv)) {
      changed = true;
      continue;
    }
    if (conv.auditionOutcome) {
      const parsed = parseOutcome(conv.auditionOutcome);
      if (parsed) {
        if (parsed !== cachedStatus) {
          changed = true;
          continue;
        }
        nextOverrides[key] = cachedStatus;
        continue;
      }
    }
    if (conv.pipeline === "Audition Booked") {
      if (cachedStatus !== "booked") {
        changed = true;
        continue;
      }
    }
    nextOverrides[key] = cachedStatus;
  }

  return {
    auditionDates: nextDates,
    statusOverrides: nextOverrides,
    changed,
  };
}
