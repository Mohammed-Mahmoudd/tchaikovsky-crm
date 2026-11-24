export const PIPELINE_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Audition Booked",
  "Attended",
  "Enrolled",
  "Joining Later",
  "Unqualified",
  "Lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_COLORS: Record<string, string> = {
  New: "#007AFF",
  Contacted: "#5856D6",
  Qualified: "#30B0C7",
  "Audition Booked": "#FF9500",
  Attended: "#34C759",
  Enrolled: "#30D158",
  "Joining Later": "#F59E0B",
  Unqualified: "#8E8E93",
  Lost: "#FF3B30",
};

export const LOST_REASON_OPTIONS = [
  { id: "price", label: "Price / Too expensive" },
  { id: "location", label: "Location / Branch too far" },
  { id: "schedule", label: "Schedule / Timing conflict" },
  { id: "no_response", label: "No response / Unreachable" },
  { id: "no_show", label: "No-show (missed audition)" },
  { id: "not_interested", label: "Not interested / Changed mind" },
  { id: "age_under_6", label: "Age under 6 / Program mismatch" },
  { id: "other", label: "Other" },
] as const;

export type LostReasonId = (typeof LOST_REASON_OPTIONS)[number]["id"];

export const MAX_LOST_REASON_NOTE_LENGTH = 500;

const LOST_REASON_LABEL_MAP = new Map<string, string>(
  LOST_REASON_OPTIONS.map((r) => [r.id, r.label])
);

const LOST_REASON_KEY_MAP = new Map<string, LostReasonId>();
for (const r of LOST_REASON_OPTIONS) {
  LOST_REASON_KEY_MAP.set(r.id.toLowerCase(), r.id);
  LOST_REASON_KEY_MAP.set(r.label.toLowerCase(), r.id);
}
LOST_REASON_KEY_MAP.set("no-show", "no_show");
LOST_REASON_KEY_MAP.set("age-under-6", "age_under_6");
LOST_REASON_KEY_MAP.set("no-response", "no_response");
LOST_REASON_KEY_MAP.set("not-interested", "not_interested");

/** Normalizes a lost reason ID or label into its canonical ID (or empty string if unset). */
export function normalizeLostReasonId(raw?: string | null): LostReasonId | "" {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  return (
    LOST_REASON_KEY_MAP.get(lower) ||
    LOST_REASON_KEY_MAP.get(lower.replace(/[\s-]+/g, "_")) ||
    ""
  );
}

/** Returns the human-readable label for a canonical lost reason ID or legacy value. */
export function getLostReasonLabel(reasonId?: string | null): string {
  if (!reasonId || typeof reasonId !== "string") return "";
  const norm = normalizeLostReasonId(reasonId);
  if (norm) return LOST_REASON_LABEL_MAP.get(norm) || "";
  return reasonId.trim();
}

/** Formats a lost reason + optional note into a concise display string. */
export function formatLostReasonDisplay(
  reasonId?: string | null,
  note?: string | null
): string {
  const label = getLostReasonLabel(reasonId);
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (label && cleanNote) return `${label} — ${cleanNote}`;
  if (label) return label;
  return cleanNote;
}

export type LostReasonValidationResult =
  | { ok: true; reason: LostReasonId; note: string }
  | { ok: false; field: "reason" | "note"; error: string };

/** Validates user input before saving a lead as Lost or updating its lost reason. */
export function validateLostReasonSubmission(
  rawReason?: string | null,
  rawNote?: string | null
): LostReasonValidationResult {
  const reason = normalizeLostReasonId(rawReason);
  if (!reason) {
    return {
      ok: false,
      field: "reason",
      error: "Select why this lead was lost",
    };
  }

  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > MAX_LOST_REASON_NOTE_LENGTH) {
    return {
      ok: false,
      field: "note",
      error: `Keep details within ${MAX_LOST_REASON_NOTE_LENGTH} characters`,
    };
  }

  if (reason === "other" && !note) {
    return {
      ok: false,
      field: "note",
      error: "Enter a brief reason when selecting Other",
    };
  }

  return { ok: true, reason, note };
}

