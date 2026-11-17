export interface ConversationSourceObject {
  adId?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  [key: string]: unknown;
}

export type ConversationSourceInput = ConversationSourceObject | string | null | undefined;

export interface FormattedLeadSource {
  campaign: string;
  adset: string;
  ad: string;
  display: string;
  shortDisplay: string;
  isUnresolvedId: boolean;
}

export interface CampaignFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface CampaignFilterList {
  totalCount: number;
  options: CampaignFilterOption[];
}

const PLACEHOLDER_ADSETS = new Set([
  "Facebook",
  "Facebook Ad",
  "Instagram",
  "Manual Lead",
]);

const PLACEHOLDER_ADS = new Set([
  "OPEN_THREAD",
  "Lead Form → WhatsApp",
  "WhatsApp Manual Lead",
  "Ad",
]);

const BOILERPLATE_SEGMENT_RE =
  /^(?:TCH(?:\s+SAU)?|SAU|KSA|MSG(?:\s+IG\+MSGR\+WA)?|ABO|CBO|ADV\+?\s*PL)$/i;

function cleanStr(val: unknown): string {
  return typeof val === "string" ? val.trim() : "";
}

function isNumericId(val: string): boolean {
  return /^\d{5,}$/.test(val);
}

/**
 * Strips boilerplate media-buyer codes (`TCH`, `SAU`, `MSG`, `ABO`, `ADV+ PL`, `DLY`)
 * from pipe- or dash-delimited Meta names while leaving meaningful campaign/ad info intact.
 */
export function simplifyMetaLabel(raw: string): string {
  const input = raw.trim().replace(/\s{2,}/g, " ");
  if (!input) return "";

  const cleanSubToken = (seg: string): string =>
    seg
      .replace(/^TCH(?:\s+SAU)?\s+/i, "")
      .replace(/\s+DLY$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  if (input.includes("|")) {
    const kept = input
      .split("|")
      .map((s) => cleanSubToken(s.trim()))
      .filter((s) => s && !BOILERPLATE_SEGMENT_RE.test(s));
    if (kept.length > 0) return kept.join(" | ");
  }

  if (input.includes(" - ")) {
    const kept = input
      .split(" - ")
      .map((s) => cleanSubToken(s.trim()))
      .filter((s) => s && !BOILERPLATE_SEGMENT_RE.test(s));
    if (kept.length > 0) return kept.join(" - ");
  }

  return cleanSubToken(input) || input;
}

function stripSharedPipeSuffix(target: string, parent: string): string {
  if (!target || !parent) return target;
  const lastPipeIdx = parent.lastIndexOf("|");
  if (lastPipeIdx < 0) return target;
  const suffix = parent.slice(lastPipeIdx).trim();
  if (suffix.length < 3) return target;
  if (target.toLowerCase().endsWith(suffix.toLowerCase())) {
    const trimmed = target.slice(0, target.length - suffix.length).trim();
    if (trimmed) return trimmed;
  }
  return target;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return Math.abs(m - n);
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function stripRedundantAdPrefix(ad: string, adset: string): string {
  if (!ad || !adset) return ad;
  const cleanAd = ad.trim();
  const cleanAdset = adset.trim();
  const adsetStem = cleanAdset
    .replace(/(?:\s*[-–—]\s*)+Copy$/i, "")
    .replace(/\s*[-–—]+\s*$/, "")
    .trim();

  const candidates = [cleanAdset, adsetStem].filter(Boolean);
  for (const prefix of candidates) {
    for (const sep of [" - ", " — ", " – ", " | ", ": "]) {
      const fullPrefix = prefix + sep;
      if (cleanAd.toLowerCase().startsWith(fullPrefix.toLowerCase())) {
        const rest = cleanAd.slice(fullPrefix.length).trim();
        if (rest) return rest;
      }
    }
    if (prefix.length >= 10 && cleanAd.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
      const rest = cleanAd.slice(prefix.length).trim();
      if (rest) return rest;
    }
  }

  // Handle minor single-typo differences between adset stem and ad stem (e.g. BROAF vs BROAD)
  const lastSepIdx = cleanAd.lastIndexOf(" - ");
  if (lastSepIdx > 0 && adsetStem.length >= 12) {
    const adPrefix = cleanAd.slice(0, lastSepIdx).trim();
    const adTail = cleanAd.slice(lastSepIdx + 3).trim();
    if (adTail && levenshtein(adPrefix.toLowerCase(), adsetStem.toLowerCase()) <= 2) {
      return adTail;
    }
  }

  return cleanAd;
}

/**
 * Normalizes `Conversation.source` for the Leads view, returning both the full
 * unmodified `Campaign Name - Ad set Name - Ad name` (`display`) and a concise,
 * deduplicated label (`shortDisplay`) stripped of repetitive media-buyer boilerplate.
 */
export function formatLeadSource(source: ConversationSourceInput): FormattedLeadSource {
  if (!source || typeof source === "string") {
    const raw = cleanStr(source);
    if (!raw || raw.toLowerCase() === "direct") {
      return {
        campaign: "Direct",
        adset: "",
        ad: "",
        display: "Direct",
        shortDisplay: "Direct",
        isUnresolvedId: false,
      };
    }
    if (isNumericId(raw)) {
      const fallback = `Campaign #${raw}`;
      return {
        campaign: raw,
        adset: "",
        ad: "",
        display: fallback,
        shortDisplay: fallback,
        isUnresolvedId: true,
      };
    }
    return {
      campaign: raw,
      adset: "",
      ad: "",
      display: raw,
      shortDisplay: raw,
      isUnresolvedId: false,
    };
  }

  const rawCampaign = cleanStr(source.campaign);
  const rawAdset = cleanStr(source.adset);
  const rawAd = cleanStr(source.ad);
  const rawAdId = cleanStr(source.adId);

  const campaign = rawCampaign && rawCampaign.toLowerCase() !== "direct" ? rawCampaign : "Direct";

  if (isNumericId(campaign)) {
    const realAdTitle = rawAd && !PLACEHOLDER_ADS.has(rawAd) ? rawAd : "";
    const fallback = realAdTitle ? `Campaign #${campaign} - ${realAdTitle}` : `Campaign #${campaign}`;
    return {
      campaign,
      adset: rawAdset,
      ad: rawAd,
      display: fallback,
      shortDisplay: fallback,
      isUnresolvedId: true,
    };
  }

  if (campaign === "Direct" || campaign === "Organic / Direct") {
    return {
      campaign,
      adset: rawAdset,
      ad: rawAd,
      display: campaign,
      shortDisplay: campaign,
      isUnresolvedId: false,
    };
  }

  const hasResolvedAdId = Boolean(rawAdId);
  const adsetPart =
    rawAdset && (hasResolvedAdId || !PLACEHOLDER_ADSETS.has(rawAdset)) ? rawAdset : "";
  const adPart = rawAd && (hasResolvedAdId || !PLACEHOLDER_ADS.has(rawAd)) ? rawAd : "";

  const display = [campaign, adsetPart, adPart].filter(Boolean).join(" - ");

  const cleanCampaign = hasResolvedAdId || (adsetPart && adPart) ? simplifyMetaLabel(campaign) : campaign;
  const cleanAdsetRaw = adsetPart ? simplifyMetaLabel(stripSharedPipeSuffix(adsetPart, campaign)) : "";
  const cleanAdNoSuffix = adPart ? simplifyMetaLabel(stripSharedPipeSuffix(adPart, campaign)) : "";
  const cleanAd = cleanAdNoSuffix ? stripRedundantAdPrefix(cleanAdNoSuffix, cleanAdsetRaw) : "";
  const cleanAdset = cleanAdsetRaw.replace(/\s+-\s+–\s+Copy$/i, " – Copy");

  const shortDisplay = [cleanCampaign, cleanAdset, cleanAd].filter(Boolean).join(" - ");

  return {
    campaign,
    adset: adsetPart,
    ad: adPart,
    display,
    shortDisplay: shortDisplay || display,
    isUnresolvedId: false,
  };
}

/**
 * Builds a flat, count-sorted list of campaign/source options for the Leads dropdown,
 * using `sourceKey` (full string) as `value` and `sourceLabel` (concise string) as `label`.
 */
export function buildCampaignFilterList(
  leads: ReadonlyArray<{ sourceDisplay: string; sourceLabel?: string }>
): CampaignFilterList {
  const counts = new Map<string, { label: string; count: number }>();
  for (const lead of leads) {
    const value = lead.sourceDisplay || "Direct";
    const label = lead.sourceLabel || value;
    const existing = counts.get(value);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(value, { label, count: 1 });
    }
  }

  const options: CampaignFilterOption[] = [];
  const directEntry = counts.get("Direct");
  if (directEntry) {
    options.push({ value: "Direct", label: directEntry.label, count: directEntry.count });
  }

  const sortedOthers = Array.from(counts.entries())
    .filter(([key]) => key !== "Direct")
    .sort((a, b) => b[1].count - a[1].count);

  for (const [value, info] of sortedOthers) {
    options.push({ value, label: info.label, count: info.count });
  }

  return {
    totalCount: leads.length,
    options,
  };
}

/**
 * Returns the concise trigger label and full tooltip text for the active campaign filter.
 */
export function getSelectedCampaignLabel(
  filterValue: string,
  list: CampaignFilterList
): { label: string; title: string } {
  if (!filterValue || filterValue === "All campaigns") {
    const text = `All campaigns (${list.totalCount})`;
    return { label: text, title: text };
  }
  const match = list.options.find((opt) => opt.value === filterValue);
  if (match) {
    return {
      label: `${match.label} (${match.count})`,
      title: `${match.value} (${match.count})`,
    };
  }
  return { label: filterValue, title: filterValue };
}
