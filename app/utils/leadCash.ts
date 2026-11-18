export type LeadCashValidationResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const NUMERIC_CASH_RE = /^-?\d+(?:\.\d+)?$/;

/** Validates and normalizes a raw Cash In input string into a non-negative amount. */
export function parseLeadCashInput(raw: string): LeadCashValidationResult {
  const cleaned = raw.trim().replace(/,/g, "");
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

  return { ok: true, value: Math.round(parsed * 100) / 100 };
}

/** Formats stored Cash In for the editable input (returns empty string when 0 or unset). */
export function formatLeadCashInputValue(cashIn?: number | null): string {
  if (typeof cashIn !== "number" || !Number.isFinite(cashIn) || cashIn <= 0) {
    return "";
  }
  return String(cashIn);
}

/** Formats stored Cash In as a currency label when a positive payment is recorded. */
export function formatLeadCashLabel(cashIn?: number | null): string | null {
  if (typeof cashIn !== "number" || !Number.isFinite(cashIn) || cashIn <= 0) {
    return null;
  }
  return `${cashIn.toLocaleString("en-US")} SAR`;
}

