const NUMERIC_CASH_RE = /^-?\d+(?:\.\d+)?$/;
const NON_ACTOR_NAMES = new Set([
  "unassigned",
  "staff",
  "system",
  "legacy",
  "unattributed",
  "you",
  "bot",
  "auto",
  "automated",
]);

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseTs(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) && val > 0 ? val : 0;
  const t = Date.parse(String(val));
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/** Returns true when `name` represents a real staff member who recorded cash. */
export function isRealCashActor(name) {
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) return false;
  return !NON_ACTOR_NAMES.has(clean.toLowerCase());
}

/** Validates and normalizes a raw Cash In input string into a non-negative amount. */
export function parseLeadCashInput(raw) {
  const cleaned = String(raw || "").trim().replace(/,/g, "");
  if (!cleaned) {
    return { ok: true, value: 0 };
  }

  if (!NUMERIC_CASH_RE.test(cleaned)) {
    return { ok: false, error: "Enter a valid cash amount" };
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "Enter a valid cash amount" };
  }

  if (parsed < 0) {
    return { ok: false, error: "Enter a positive amount or 0" };
  }

  return { ok: true, value: roundCurrency(parsed) };
}

/** Validates a new multi-cash payment amount (> 0). */
export function parseAddCashInput(raw) {
  const cleaned = String(raw || "").trim().replace(/,/g, "");
  if (!cleaned) {
    return { ok: false, error: "Enter an amount greater than 0" };
  }

  if (!NUMERIC_CASH_RE.test(cleaned)) {
    return { ok: false, error: "Enter a valid cash amount" };
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "Enter a valid cash amount" };
  }

  const rounded = roundCurrency(parsed);
  if (rounded <= 0) {
    return { ok: false, error: "Enter an amount greater than 0" };
  }

  if (rounded > 10_000_000) {
    return { ok: false, error: "Cash amount exceeds allowed maximum" };
  }

  return { ok: true, value: rounded };
}

/** Formats stored Cash In for the editable input (returns empty string when 0 or unset). */
export function formatLeadCashInputValue(cashIn) {
  if (typeof cashIn !== "number" || !Number.isFinite(cashIn) || cashIn <= 0) {
    return "";
  }
  return String(cashIn);
}

/** Formats stored Cash In as a currency label when a positive payment is recorded. */
export function formatLeadCashLabel(cashIn) {
  if (typeof cashIn !== "number" || !Number.isFinite(cashIn) || cashIn <= 0) {
    return null;
  }
  return `${cashIn.toLocaleString("en-US")} SAR`;
}

function getSourceObject(c) {
  return typeof c?.source === "object" && c.source !== null ? c.source : null;
}

function findLatestCashRecordedLog(c) {
  const src = getSourceObject(c);
  const logs = [c?.activityLog, src?.activityLog];
  let latestEntry = null;
  let latestTs = -1;
  for (let l = 0; l < logs.length; l++) {
    const list = logs[l];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || entry.type !== "cash_recorded") continue;
      const ts = parseTs(entry.timestamp);
      if (ts >= latestTs) {
        latestTs = ts;
        latestEntry = entry;
      }
    }
  }
  return latestEntry;
}

function resolveLegacyActorAndSource(c) {
  const src = getSourceObject(c);
  if (isRealCashActor(c?.cashRecordedBy)) {
    return { actor: String(c.cashRecordedBy).trim(), attributionSource: "cash_recorded_by" };
  }
  if (isRealCashActor(src?.cashRecordedBy)) {
    return { actor: String(src.cashRecordedBy).trim(), attributionSource: "cash_recorded_by" };
  }

  const latestLog = findLatestCashRecordedLog(c);
  if (latestLog && isRealCashActor(latestLog.actor)) {
    return { actor: String(latestLog.actor).trim(), attributionSource: "activity_log" };
  }

  if (isRealCashActor(c?.enrolledBy)) {
    return { actor: String(c.enrolledBy).trim(), attributionSource: "enrolled_by" };
  }
  if (isRealCashActor(src?.enrolledBy)) {
    return { actor: String(src.enrolledBy).trim(), attributionSource: "enrolled_by" };
  }

  // Never fall back to assigned lead owner (`c.agent`).
  return { actor: "", attributionSource: "unattributed" };
}

function resolveLegacyTimestamp(c) {
  const src = getSourceObject(c);
  const paidTs = parseTs(c?.paidAt) || parseTs(src?.paidAt);
  if (paidTs > 0) return paidTs;

  const latestLog = findLatestCashRecordedLog(c);
  const logTs = latestLog ? parseTs(latestLog.timestamp) : 0;
  if (logTs > 0) return logTs;

  const enrolledTs = parseTs(c?.enrolledAt) || parseTs(src?.enrolledAt);
  if (enrolledTs > 0) return enrolledTs;

  const updatedTs = parseTs(c?.updatedAt);
  if (updatedTs > 0) return updatedTs;

  const createdTs = parseTs(c?.createdAt);
  if (createdTs > 0) return createdTs;

  return parseTs(c?.lastMessageAt);
}

/**
 * Resolves all active cash payments on a conversation in chronological order.
 * Supports multi-entry `cashEntries[]` and backward-compatible legacy `cashIn` fallback
 * (cashRecordedBy -> activityLog -> enrolledBy, never assigned owner `c.agent`).
 */
export function resolveConversationCashPayments(c) {
  if (!c || typeof c !== "object") return [];

  if (Array.isArray(c.cashEntries) && c.cashEntries.length > 0) {
    const active = [];
    for (let i = 0; i < c.cashEntries.length; i++) {
      const entry = c.cashEntries[i];
      if (!entry || entry.isVoided) continue;
      const amount = roundCurrency(entry.amount);
      if (amount <= 0) continue;

      const isLegacy = Boolean(entry.isLegacy);
      let actor = "";
      let attributionSource = "unattributed";

      if (isRealCashActor(entry.recordedBy)) {
        actor = String(entry.recordedBy).trim();
        attributionSource = "entry";
      } else if (isLegacy) {
        const legacyRes = resolveLegacyActorAndSource(c);
        actor = legacyRes.actor;
        attributionSource = legacyRes.attributionSource;
      }

      const timestamp = parseTs(entry.recordedAt) || resolveLegacyTimestamp(c);

      active.push({
        id: String(entry.id || `entry_${i}`),
        amount,
        actor,
        recordedByUserId: entry.recordedByUserId ? String(entry.recordedByUserId) : undefined,
        timestamp,
        note: typeof entry.note === "string" ? entry.note.trim() : "",
        isLegacy,
        attributionSource,
      });
    }

    active.sort((a, b) => a.timestamp - b.timestamp);
    return active;
  }

  const legacyCash = roundCurrency(c.cashIn);
  if (legacyCash <= 0) return [];

  const { actor, attributionSource } = resolveLegacyActorAndSource(c);
  const timestamp = resolveLegacyTimestamp(c);

  return [
    {
      id: "legacy",
      amount: legacyCash,
      actor,
      timestamp,
      note: "",
      isLegacy: true,
      attributionSource,
    },
  ];
}

/** Returns the active cash total across resolved payments (or 0). */
export function computeActiveCashTotal(c) {
  const payments = resolveConversationCashPayments(c);
  if (payments.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < payments.length; i++) {
    total += payments[i].amount;
  }
  return roundCurrency(total);
}

/** Returns a lightweight signature string for change detection in state diffs. */
export function getCashEntriesSignature(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  let activeCount = 0;
  let voidedCount = 0;
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    if (e.isVoided) {
      voidedCount += 1;
    } else {
      activeCount += 1;
      total += roundCurrency(e.amount);
    }
  }
  const lastId = entries[entries.length - 1]?.id || "";
  return `${entries.length}:${activeCount}:${voidedCount}:${roundCurrency(total)}:${lastId}`;
}

