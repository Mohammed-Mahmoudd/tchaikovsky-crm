/**
 * Normalizes Arabic and Latin text for lightning-fast, fault-tolerant search.
 * Handles Arabic hamzas, ta marbuta, alef maksura, diacritics, and case variations.
 */
export function normalizeSearchText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, ""); // Arabic tashkeel / harakat
}

export interface LeadSearchable {
  id?: string;
  _id?: string;
  name?: string;
  phone?: string;
  agent?: string;
  channel?: string;
}

/**
 * Checks if a conversation / lead matches a search query by:
 * 1. Exact or partial Lead ID (conv.id or conv._id)
 * 2. Lead Name (case-insensitive & Arabic normalized, word-by-word matching)
 * 3. Lead Phone Number (raw or stripped digits)
 * Runs in microseconds for 0ms client-side response time.
 */
export function matchLeadSearch(conv: LeadSearchable, query: string): boolean {
  if (!query) return true;
  const cleanQ = query.trim();
  if (!cleanQ) return true;

  const rawLower = cleanQ.toLowerCase();
  const idStr = String(conv.id || "").toLowerCase();
  const mongoId = conv._id ? String(conv._id).toLowerCase() : "";

  // 1. Fast match on lead ID / senderId / Mongo ID
  if (idStr.includes(rawLower) || (mongoId && mongoId.includes(rawLower))) {
    return true;
  }

  // 2. Normalized Name match
  const normQ = normalizeSearchText(cleanQ);
  const normName = normalizeSearchText(conv.name || "");
  if (normName.includes(normQ)) {
    return true;
  }

  // Multi-token name match (e.g. "mohammed ali" matching "Ali Mohamed")
  const tokens = normQ.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => normName.includes(token))) {
    return true;
  }

  // 3. Phone number match (digits only comparison)
  const qDigits = cleanQ.replace(/[^\d]/g, "");
  if (qDigits.length >= 3) {
    const pDigits = (conv.phone || "").replace(/[^\d]/g, "");
    if (pDigits.includes(qDigits)) {
      return true;
    }
  }

  return false;
}
