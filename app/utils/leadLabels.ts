export type LeadLabelColor =
  | "slate"
  | "blue"
  | "indigo"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "purple";

export interface LeadLabel {
  id: string;
  name: string;
  color: LeadLabelColor;
  order?: number;
  createdBy?: string;
}

export interface LeadLabelColorOption {
  id: LeadLabelColor;
  label: string;
}

export const LEAD_LABEL_COLORS: ReadonlyArray<LeadLabelColor> = [
  "slate",
  "blue",
  "indigo",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "purple",
];

export const LEAD_LABEL_COLOR_OPTIONS: ReadonlyArray<LeadLabelColorOption> = [
  { id: "blue", label: "Blue" },
  { id: "indigo", label: "Indigo" },
  { id: "teal", label: "Teal" },
  { id: "green", label: "Green" },
  { id: "amber", label: "Amber" },
  { id: "orange", label: "Orange" },
  { id: "red", label: "Red" },
  { id: "purple", label: "Purple" },
  { id: "slate", label: "Neutral" },
];

export const DEFAULT_LEAD_LABEL_COLOR: LeadLabelColor = "blue";
export const MAX_LEAD_LABEL_NAME_LENGTH = 40;
export const LABELS_CACHE_KEY = "crm_labels_cache_v1";

export type LeadLabelValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function isLeadLabelColor(value: unknown): value is LeadLabelColor {
  return typeof value === "string" && (LEAD_LABEL_COLORS as ReadonlyArray<string>).includes(value);
}

/**
 * Resolve CSS custom property references from `globals.css` for a label color.
 */
export function getLeadLabelCssVars(color: unknown): {
  background: string;
  borderColor: string;
  color: string;
  dotColor: string;
} {
  const safeColor: LeadLabelColor = isLeadLabelColor(color) ? color : DEFAULT_LEAD_LABEL_COLOR;
  return {
    background: `var(--label-${safeColor}-bg)`,
    borderColor: `var(--label-${safeColor}-border)`,
    color: `var(--label-${safeColor}-text)`,
    dotColor: `var(--label-${safeColor}-dot)`,
  };
}

/**
 * Validate and normalize a label name before creating or renaming a label.
 */
export function validateLeadLabelName(
  raw: string,
  existingLabels: ReadonlyArray<Pick<LeadLabel, "id" | "name">> = [],
  excludeId?: string
): LeadLabelValidationResult {
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { ok: false, error: "Enter a label name." };
  }
  if (normalized.length > MAX_LEAD_LABEL_NAME_LENGTH) {
    return {
      ok: false,
      error: `Label name must be ${MAX_LEAD_LABEL_NAME_LENGTH} characters or fewer.`,
    };
  }
  const lower = normalized.toLowerCase();
  const duplicate = existingLabels.find(
    (item) => item.id !== excludeId && item.name.trim().toLowerCase() === lower
  );
  if (duplicate) {
    return {
      ok: false,
      error: `A label named "${duplicate.name}" already exists.`,
    };
  }
  return { ok: true, value: normalized };
}

/**
 * Normalize raw label payloads from the backend into strict `LeadLabel` objects.
 */
export function normalizeLeadLabelCatalog(rawList: unknown): LeadLabel[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<string>();
  const out: LeadLabel[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const item = rawList[i] as Record<string, unknown> | null;
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : typeof item._id === "string" ? item._id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      color: isLeadLabelColor(item.color) ? item.color : DEFAULT_LEAD_LABEL_COLOR,
      order: typeof item.order === "number" ? item.order : i,
      createdBy: typeof item.createdBy === "string" ? item.createdBy : undefined,
    });
  }
  return out;
}

/**
 * Deduplicate and sanitize label ID arrays stored on conversations.
 */
export function normalizeConversationLabelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const val = raw[i];
    if (typeof val !== "string") continue;
    const clean = val.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Map a conversation's stored label IDs to resolved `LeadLabel` definitions.
 * Unknown or deleted IDs are omitted so raw IDs never surface in the UI.
 */
export function resolveConversationLabels(
  labelIds: ReadonlyArray<string> | undefined | null,
  catalog: ReadonlyArray<LeadLabel>
): LeadLabel[] {
  if (!Array.isArray(labelIds) || labelIds.length === 0 || catalog.length === 0) {
    return [];
  }
  const byId = new Map<string, LeadLabel>();
  for (let i = 0; i < catalog.length; i += 1) {
    byId.set(catalog[i].id, catalog[i]);
  }
  const seen = new Set<string>();
  const resolved: LeadLabel[] = [];
  for (let i = 0; i < labelIds.length; i += 1) {
    const id = typeof labelIds[i] === "string" ? labelIds[i].trim() : "";
    if (!id || seen.has(id)) continue;
    const label = byId.get(id);
    if (!label) continue;
    seen.add(id);
    resolved.push(label);
  }
  return resolved;
}

export function toggleLeadLabelId(
  currentIds: ReadonlyArray<string> | undefined | null,
  targetId: string
): string[] {
  const clean = normalizeConversationLabelIds(currentIds);
  if (!targetId) return clean;
  if (clean.includes(targetId)) {
    return clean.filter((id) => id !== targetId);
  }
  return [...clean, targetId];
}

export function removeLeadLabelId(
  currentIds: ReadonlyArray<string> | undefined | null,
  targetId: string
): string[] {
  const clean = normalizeConversationLabelIds(currentIds);
  if (!targetId) return clean;
  return clean.filter((id) => id !== targetId);
}

/**
 * Split resolved labels into visible pills and overflow pills for compact list rows.
 */
export function partitionVisibleLabels(
  labels: ReadonlyArray<LeadLabel>,
  maxVisible = 3
): { visible: LeadLabel[]; overflow: LeadLabel[] } {
  if (maxVisible <= 0 || labels.length <= maxVisible) {
    return { visible: [...labels], overflow: [] };
  }
  return {
    visible: labels.slice(0, maxVisible),
    overflow: labels.slice(maxVisible),
  };
}

export function filterLeadLabels(
  catalog: ReadonlyArray<LeadLabel>,
  query: string
): LeadLabel[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [...catalog];
  return catalog.filter((item) => item.name.toLowerCase().includes(clean));
}

export function countLeadsWithLabel(
  conversations: ReadonlyArray<{ labels?: ReadonlyArray<string> }>,
  labelId: string
): number {
  if (!labelId) return 0;
  let count = 0;
  for (let i = 0; i < conversations.length; i += 1) {
    const list = conversations[i]?.labels;
    if (Array.isArray(list) && list.includes(labelId)) {
      count += 1;
    }
  }
  return count;
}

export function areStringArraysEqual(
  a?: ReadonlyArray<string> | null,
  b?: ReadonlyArray<string> | null
): boolean {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i += 1) {
    if (listA[i] !== listB[i]) return false;
  }
  return true;
}

/**
 * Returns true if a conversation matches the active Inbox label filter.
 * When multiple labels are selected, any matching label includes the lead.
 */
export function matchesLabelFilter(
  convLabelIds: ReadonlyArray<string> | undefined | null,
  selectedLabelIds: ReadonlyArray<string>
): boolean {
  if (selectedLabelIds.length === 0) return true;
  if (!Array.isArray(convLabelIds) || convLabelIds.length === 0) return false;
  for (let i = 0; i < selectedLabelIds.length; i += 1) {
    if (convLabelIds.includes(selectedLabelIds[i])) return true;
  }
  return false;
}

/**
 * Counts how many conversations in a list carry each label ID.
 */
export function getLabelConversationCounts(
  conversations: ReadonlyArray<{ labels?: ReadonlyArray<string> }>,
  catalog: ReadonlyArray<Pick<LeadLabel, "id">>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < catalog.length; i += 1) {
    counts.set(catalog[i].id, 0);
  }
  for (let i = 0; i < conversations.length; i += 1) {
    const list = conversations[i]?.labels;
    if (!Array.isArray(list) || list.length === 0) continue;
    for (let j = 0; j < list.length; j += 1) {
      const id = list[j];
      if (counts.has(id)) {
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * Formats the compact trigger label for the Inbox label filter button.
 */
export function getLabelFilterDisplayText(
  selectedLabels: ReadonlyArray<Pick<LeadLabel, "name">>
): string {
  if (selectedLabels.length === 0) return "All Labels";
  if (selectedLabels.length === 1) return selectedLabels[0].name;
  return `${selectedLabels.length} Labels`;
}

