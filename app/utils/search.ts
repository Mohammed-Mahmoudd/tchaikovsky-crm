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
  metaSenderId?: string;
  name?: string;
  profileName?: string;
  leadName?: string;
  phone?: string;
  formPhone?: string;
  agent?: string;
  channel?: string;
  labels?: ReadonlyArray<string>;
}

/**
 * Builds a fast ID -> label name lookup map for `matchLeadSearch`.
 */
export function buildLabelNameMap(
  catalog: ReadonlyArray<{ id: string; name: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < catalog.length; i += 1) {
    const item = catalog[i];
    if (!item || !item.id || !item.name) continue;
    map.set(item.id, item.name);
  }
  return map;
}

/**
 * Checks if a conversation / lead matches a search query by:
 * 1. Exact or partial Lead ID (conv.id, conv._id, or conv.metaSenderId)
 * 2. Lead Name, Profile Name, Form Lead Name, or assigned Label names (case-insensitive & Arabic normalized, word-by-word matching)
 * 3. Lead Phone Number (raw, E.164, or local format with leading 0)
 * Runs in microseconds for 0ms client-side response time.
 */
export function matchLeadSearch(
  conv: LeadSearchable,
  query: string,
  labelNameMap?: ReadonlyMap<string, string>
): boolean {
  if (!query) return true;
  const cleanQ = query.trim();
  if (!cleanQ) return true;

  const rawLower = cleanQ.toLowerCase();
  const idStr = String(conv.id || "").toLowerCase();
  const mongoId = conv._id ? String(conv._id).toLowerCase() : "";
  const metaId = conv.metaSenderId ? String(conv.metaSenderId).toLowerCase() : "";

  // 1. Fast match on lead ID / senderId / Mongo ID / unified Meta PSID
  if (
    idStr.includes(rawLower) ||
    (mongoId && mongoId.includes(rawLower)) ||
    (metaId && metaId.includes(rawLower))
  ) {
    return true;
  }

  // 2. Normalized Name & Label match across display name, WA profileName, Meta form leadName, and assigned labels
  const normQ = normalizeSearchText(cleanQ);
  const combinedNames = [conv.name, conv.profileName, conv.leadName]
    .filter(Boolean)
    .map((n) => normalizeSearchText(n as string))
    .join(" ");

  if (combinedNames.includes(normQ)) {
    return true;
  }

  const labelNames: string[] = [];
  if (labelNameMap && Array.isArray(conv.labels) && conv.labels.length > 0) {
    for (let i = 0; i < conv.labels.length; i += 1) {
      const labelName = labelNameMap.get(conv.labels[i]);
      if (!labelName) continue;
      const normLabel = normalizeSearchText(labelName);
      if (!normLabel) continue;
      if (normLabel.includes(normQ)) {
        return true;
      }
      labelNames.push(normLabel);
    }
  }

  // Multi-token match across name + assigned labels (e.g. "mohammed ali" or "vip ahmed")
  const tokens = normQ.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const combinedNamesAndLabels =
      labelNames.length > 0 ? `${combinedNames} ${labelNames.join(" ")}`.trim() : combinedNames;
    if (tokens.every((token) => combinedNamesAndLabels.includes(token))) {
      return true;
    }
  }

  // 3. Phone number match (digits-only comparison + local leading-zero normalization)
  const qDigits = cleanQ.replace(/[^\d]/g, "");
  if (qDigits.length >= 3) {
    const pDigits = (conv.phone || "").replace(/[^\d]/g, "");
    const fDigits = (conv.formPhone || "").replace(/[^\d]/g, "");
    if (pDigits.includes(qDigits) || (fDigits && fDigits.includes(qDigits))) {
      return true;
    }
    // Support local numbers with leading 0 (e.g. "011 51426156" -> "1151426156" matching "+201151426156",
    // or "055 381 2736" -> "553812736" matching "+966553812736")
    if (qDigits.startsWith("0") && qDigits.length >= 4) {
      const strippedZero = qDigits.replace(/^0+/, "");
      if (
        strippedZero.length >= 3 &&
        (pDigits.includes(strippedZero) || (fDigits && fDigits.includes(strippedZero)))
      ) {
        return true;
      }
    }
  }

  return false;
}
