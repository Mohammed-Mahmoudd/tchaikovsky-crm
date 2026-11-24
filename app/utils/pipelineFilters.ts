/**
 * Pure, framework-free filtering, faceted counting, time-range resolution,
 * and sorting utilities for the Pipeline board and Table view.
 */

export const PIPELINE_STAGE_LIST = [
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

export type PipelineStage = (typeof PIPELINE_STAGE_LIST)[number];

export const PIPELINE_STAGE_ORDER: Record<PipelineStage, number> = {
  New: 0,
  Contacted: 1,
  Qualified: 2,
  "Audition Booked": 3,
  Attended: 4,
  Enrolled: 5,
  "Joining Later": 6,
  Unqualified: 7,
  Lost: 8,
};

export interface StageThemeTokenSet {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

/** Semantic CSS variables from `app/globals.css` (automatically light + dark mode aware). */
export const PIPELINE_STAGE_THEME_TOKENS: Record<PipelineStage, StageThemeTokenSet> = {
  New: {
    bg: "var(--label-blue-bg)",
    border: "var(--label-blue-border)",
    text: "var(--label-blue-text)",
    dot: "var(--label-blue-dot)",
  },
  Contacted: {
    bg: "var(--label-indigo-bg)",
    border: "var(--label-indigo-border)",
    text: "var(--label-indigo-text)",
    dot: "var(--label-indigo-dot)",
  },
  Qualified: {
    bg: "var(--label-teal-bg)",
    border: "var(--label-teal-border)",
    text: "var(--label-teal-text)",
    dot: "var(--label-teal-dot)",
  },
  "Audition Booked": {
    bg: "var(--label-orange-bg)",
    border: "var(--label-orange-border)",
    text: "var(--label-orange-text)",
    dot: "var(--label-orange-dot)",
  },
  Attended: {
    bg: "var(--label-green-bg)",
    border: "var(--label-green-border)",
    text: "var(--label-green-text)",
    dot: "var(--label-green-dot)",
  },
  Enrolled: {
    bg: "var(--label-green-bg)",
    border: "var(--label-green-border)",
    text: "var(--label-green-text)",
    dot: "var(--label-green-dot)",
  },
  "Joining Later": {
    bg: "var(--label-amber-bg)",
    border: "var(--label-amber-border)",
    text: "var(--label-amber-text)",
    dot: "var(--label-amber-dot)",
  },
  Unqualified: {
    bg: "var(--label-slate-bg)",
    border: "var(--label-slate-border)",
    text: "var(--label-slate-text)",
    dot: "var(--label-slate-dot)",
  },
  Lost: {
    bg: "var(--label-red-bg)",
    border: "var(--label-red-border)",
    text: "var(--label-red-text)",
    dot: "var(--label-red-dot)",
  },
};

export type PipelineTimePreset =
  | "any"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "last_30_days"
  | "custom";

export interface PipelineTimePresetOption {
  id: PipelineTimePreset;
  label: string;
}

export const PIPELINE_TIME_PRESETS: ReadonlyArray<PipelineTimePresetOption> = [
  { id: "any", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "custom", label: "Custom range" },
];

const TIME_PRESET_LABELS: Record<PipelineTimePreset, string> = {
  any: "Any time",
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  last_7_days: "Last 7 days",
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  custom: "Custom range",
};

export interface PipelineTimeFilter {
  preset: PipelineTimePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const DEFAULT_PIPELINE_TIME_FILTER: PipelineTimeFilter = {
  preset: "any",
  startDate: "",
  endDate: "",
};

export interface PipelineFilterState {
  time: PipelineTimeFilter;
  campaigns: ReadonlyArray<string>;
  stages: ReadonlyArray<PipelineStage>;
  agent: string;
  source: string;
}

export const DEFAULT_PIPELINE_FILTER_STATE: PipelineFilterState = {
  time: DEFAULT_PIPELINE_TIME_FILTER,
  campaigns: [],
  stages: [],
  agent: "Everyone",
  source: "All sources",
};

export type PipelineTableSortField =
  | "default"
  | "received"
  | "name"
  | "campaign"
  | "stage"
  | "agent";

export type PipelineTableSortDir = "asc" | "desc";

export interface PipelineTableSort {
  field: PipelineTableSortField;
  dir: PipelineTableSortDir;
}

export const DEFAULT_PIPELINE_TABLE_SORT: PipelineTableSort = {
  field: "default",
  dir: "desc",
};

export interface PipelineFilterableLead {
  id: string;
  name: string;
  campaignKey: string;
  campaignLabel: string;
  campaignFull: string;
  sourceChannel: string;
  stage: PipelineStage;
  agent: string;
  rawCreatedAt: number;
}

export interface PipelineCampaignOption {
  value: string;
  label: string;
  fullValue: string;
  count: number;
}

export interface PipelineFacetOption {
  value: string;
  label: string;
  count: number;
}

export interface PipelineFilterEvaluation<T extends PipelineFilterableLead> {
  boardLeads: T[];
  tableLeads: T[];
  groupedByStage: Record<PipelineStage, T[]>;
  stageCounts: Record<PipelineStage, number>;
  stageTotal: number;
  campaignOptions: PipelineCampaignOption[];
  campaignTotal: number;
  agentOptions: PipelineFacetOption[];
  agentTotal: number;
  sourceOptions: PipelineFacetOption[];
  sourceTotal: number;
}

export interface TimeBounds {
  startMs: number | null;
  endMs: number | null;
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const SHORT_DATE_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(iso: string): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function getLocalDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function getLocalDayEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Saudi / Cairo school week starts on Saturday (Sat–Fri). */
function getSaudiWeekStart(date: Date): Date {
  const start = getLocalDayStart(date);
  const day = start.getDay(); // 0=Sun .. 6=Sat
  const diffToSat = day === 6 ? 0 : day + 1;
  start.setDate(start.getDate() - diffToSat);
  return start;
}

export function getDefaultCustomDateRange(nowMs: number = Date.now()): {
  startDate: string;
  endDate: string;
} {
  const today = getLocalDayStart(new Date(nowMs));
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  return {
    startDate: toLocalIsoDate(start),
    endDate: toLocalIsoDate(today),
  };
}

/**
 * Resolves a `PipelineTimeFilter` into inclusive local-time epoch millisecond bounds.
 * Returns `{ startMs: null, endMs: null }` when no time constraint is active.
 */
export function resolveTimeBounds(
  filter: PipelineTimeFilter,
  nowMs: number = Date.now()
): TimeBounds {
  const now = new Date(nowMs);
  const todayStart = getLocalDayStart(now);
  const todayEnd = getLocalDayEnd(now);

  switch (filter.preset) {
    case "any":
      return { startMs: null, endMs: null };

    case "today":
      return { startMs: todayStart.getTime(), endMs: todayEnd.getTime() };

    case "yesterday": {
      const yStart = new Date(todayStart);
      yStart.setDate(yStart.getDate() - 1);
      return { startMs: yStart.getTime(), endMs: getLocalDayEnd(yStart).getTime() };
    }

    case "this_week": {
      const weekStart = getSaudiWeekStart(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return { startMs: weekStart.getTime(), endMs: getLocalDayEnd(weekEnd).getTime() };
    }

    case "last_week": {
      const thisWeekStart = getSaudiWeekStart(now);
      const prevWeekStart = new Date(thisWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(thisWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      return {
        startMs: prevWeekStart.getTime(),
        endMs: getLocalDayEnd(prevWeekEnd).getTime(),
      };
    }

    case "last_7_days": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 6);
      return { startMs: start.getTime(), endMs: todayEnd.getTime() };
    }

    case "this_month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { startMs: monthStart.getTime(), endMs: monthEnd.getTime() };
    }

    case "last_month": {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { startMs: prevMonthStart.getTime(), endMs: prevMonthEnd.getTime() };
    }

    case "last_30_days": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return { startMs: start.getTime(), endMs: todayEnd.getTime() };
    }

    case "custom": {
      const parsedStart = parseLocalIsoDate(filter.startDate);
      const parsedEnd = parseLocalIsoDate(filter.endDate);
      if (parsedStart && parsedEnd) {
        const start =
          parsedStart.getTime() <= parsedEnd.getTime() ? parsedStart : parsedEnd;
        const end =
          parsedStart.getTime() <= parsedEnd.getTime() ? parsedEnd : parsedStart;
        return {
          startMs: getLocalDayStart(start).getTime(),
          endMs: getLocalDayEnd(end).getTime(),
        };
      }
      if (parsedStart) {
        return { startMs: getLocalDayStart(parsedStart).getTime(), endMs: null };
      }
      if (parsedEnd) {
        return { startMs: null, endMs: getLocalDayEnd(parsedEnd).getTime() };
      }
      return { startMs: null, endMs: null };
    }
  }
}

export function isTimeFilterActive(filter: PipelineTimeFilter): boolean {
  if (filter.preset === "any") return false;
  if (filter.preset === "custom") {
    return Boolean(
      parseLocalIsoDate(filter.startDate) || parseLocalIsoDate(filter.endDate)
    );
  }
  return true;
}

export function getTimeFilterSummary(
  filter: PipelineTimeFilter,
  nowMs: number = Date.now()
): { label: string; title: string; active: boolean } {
  if (filter.preset === "any") {
    return { label: "Any time", title: "Any time", active: false };
  }

  if (filter.preset !== "custom") {
    const label = TIME_PRESET_LABELS[filter.preset] || "Any time";
    return { label, title: label, active: true };
  }

  const parsedStart = parseLocalIsoDate(filter.startDate);
  const parsedEnd = parseLocalIsoDate(filter.endDate);
  const currentYear = new Date(nowMs).getFullYear();

  const fmt = (d: Date, forceYear = false) =>
    forceYear || d.getFullYear() !== currentYear
      ? SHORT_DATE_WITH_YEAR_FORMATTER.format(d)
      : SHORT_DATE_FORMATTER.format(d);

  if (parsedStart && parsedEnd) {
    const start =
      parsedStart.getTime() <= parsedEnd.getTime() ? parsedStart : parsedEnd;
    const end =
      parsedStart.getTime() <= parsedEnd.getTime() ? parsedEnd : parsedStart;
    if (start.getTime() === end.getTime()) {
      const label = fmt(start);
      return { label, title: fmt(start, true), active: true };
    }
    const crossYear = start.getFullYear() !== end.getFullYear();
    return {
      label: `${fmt(start, crossYear)} – ${fmt(end, crossYear)}`,
      title: `${fmt(start, true)} – ${fmt(end, true)}`,
      active: true,
    };
  }

  if (parsedStart) {
    const label = `From ${fmt(parsedStart)}`;
    return { label, title: `From ${fmt(parsedStart, true)}`, active: true };
  }

  if (parsedEnd) {
    const label = `Until ${fmt(parsedEnd)}`;
    return { label, title: `Until ${fmt(parsedEnd, true)}`, active: true };
  }

  return { label: "Custom range", title: "Select custom date range", active: false };
}

export function toggleMultiSelection<T extends string>(
  current: ReadonlyArray<T>,
  value: T
): T[] {
  const exists = current.includes(value);
  if (exists) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}

export function getCampaignsFilterSummary(
  selected: ReadonlyArray<string>,
  options: ReadonlyArray<PipelineCampaignOption>,
  totalCount: number
): { label: string; title: string; active: boolean } {
  if (selected.length === 0) {
    const text = `All campaigns (${totalCount})`;
    return { label: text, title: text, active: false };
  }

  if (selected.length === 1) {
    const target = selected[0];
    const match = options.find((opt) => opt.value === target);
    if (match) {
      return {
        label: `${match.label} (${match.count})`,
        title: `${match.fullValue} (${match.count})`,
        active: true,
      };
    }
    return { label: target, title: target, active: true };
  }

  const labelMap = new Map<string, string>();
  for (let i = 0; i < options.length; i += 1) {
    labelMap.set(options[i].value, options[i].label);
  }
  const names = selected.map((val) => labelMap.get(val) || val);
  return {
    label: `${selected.length} campaigns`,
    title: names.join(", "),
    active: true,
  };
}

export function getStagesFilterSummary(
  selected: ReadonlyArray<PipelineStage>,
  stageCounts: Record<PipelineStage, number>,
  totalCount: number
): { label: string; title: string; active: boolean } {
  if (selected.length === 0) {
    const text = `All stages (${totalCount})`;
    return { label: text, title: text, active: false };
  }

  if (selected.length === 1) {
    const stage = selected[0];
    const count = stageCounts[stage] ?? 0;
    const text = `${stage} (${count})`;
    return { label: text, title: text, active: true };
  }

  return {
    label: `${selected.length} stages`,
    title: selected.join(", "),
    active: true,
  };
}

export function countActivePipelineFilters(
  state: PipelineFilterState,
  includeStages: boolean
): number {
  let count = 0;
  if (isTimeFilterActive(state.time)) count += 1;
  if (state.campaigns.length > 0) count += 1;
  if (includeStages && state.stages.length > 0) count += 1;
  if (state.agent !== "Everyone") count += 1;
  if (state.source !== "All sources") count += 1;
  return count;
}

function matchesTimeBounds(rawCreatedAt: number, bounds: TimeBounds): boolean {
  if (bounds.startMs === null && bounds.endMs === null) return true;
  if (!rawCreatedAt || !Number.isFinite(rawCreatedAt)) return false;
  if (bounds.startMs !== null && rawCreatedAt < bounds.startMs) return false;
  if (bounds.endMs !== null && rawCreatedAt > bounds.endMs) return false;
  return true;
}

function createEmptyStageGroups<T>(): Record<PipelineStage, T[]> {
  return {
    New: [],
    Contacted: [],
    Qualified: [],
    "Audition Booked": [],
    Attended: [],
    Enrolled: [],
    "Joining Later": [],
    Unqualified: [],
    Lost: [],
  };
}

function createEmptyStageCounts(): Record<PipelineStage, number> {
  return {
    New: 0,
    Contacted: 0,
    Qualified: 0,
    "Audition Booked": 0,
    Attended: 0,
    Enrolled: 0,
    "Joining Later": 0,
    Unqualified: 0,
    Lost: 0,
  };
}

/**
 * Single-pass O(N) filter + faceted count evaluator for the Pipeline board and Table view.
 * Computes `boardLeads`, `tableLeads`, `groupedByStage`, and cross-filtered option counts
 * in one linear iteration with O(1) Set lookups.
 */
export function evaluatePipelineFilters<T extends PipelineFilterableLead>(
  leads: ReadonlyArray<T>,
  state: PipelineFilterState,
  options?: {
    assignableAgentNames?: ReadonlyArray<string>;
    nowMs?: number;
    applyStageFilterToFacets?: boolean;
  }
): PipelineFilterEvaluation<T> {
  const nowMs = options?.nowMs ?? Date.now();
  const applyStageFilterToFacets = options?.applyStageFilterToFacets ?? true;
  const bounds = resolveTimeBounds(state.time, nowMs);

  const campaignSet =
    state.campaigns.length > 0 ? new Set<string>(state.campaigns) : null;
  const stageSet =
    state.stages.length > 0 ? new Set<PipelineStage>(state.stages) : null;
  const filterAgent = state.agent;
  const filterSource = state.source;
  const agentAll = filterAgent === "Everyone";
  const sourceAll = filterSource === "All sources";

  const boardLeads: T[] = [];
  const tableLeads: T[] = [];
  const groupedByStage = createEmptyStageGroups<T>();
  const stageCounts = createEmptyStageCounts();
  let stageTotal = 0;

  const campaignMeta = new Map<string, { label: string; fullValue: string }>();
  const campaignCounts = new Map<string, number>();
  let campaignTotal = 0;

  const agentCounts = new Map<string, number>();
  let agentTotal = 0;

  const sourceCounts = new Map<string, number>();
  let sourceTotal = 0;

  for (let i = 0; i < leads.length; i += 1) {
    const lead = leads[i];
    const campKey = lead.campaignKey || "Direct";
    if (!campaignMeta.has(campKey)) {
      campaignMeta.set(campKey, {
        label: lead.campaignLabel || campKey,
        fullValue: lead.campaignFull || campKey,
      });
    }

    const mTime = matchesTimeBounds(lead.rawCreatedAt, bounds);
    if (!mTime) continue;

    const mCampaign = campaignSet === null || campaignSet.has(campKey);
    const mStage = stageSet === null || stageSet.has(lead.stage);
    const mStageForFacets = applyStageFilterToFacets ? mStage : true;
    const mAgent = agentAll || lead.agent === filterAgent;
    const mSource = sourceAll || lead.sourceChannel === filterSource;

    if (mCampaign && mAgent && mSource) {
      boardLeads.push(lead);
      if (groupedByStage[lead.stage]) {
        groupedByStage[lead.stage].push(lead);
        stageCounts[lead.stage] += 1;
      }
      stageTotal += 1;
      if (mStage) {
        tableLeads.push(lead);
      }
    }

    if (mStageForFacets && mAgent && mSource) {
      campaignCounts.set(campKey, (campaignCounts.get(campKey) || 0) + 1);
      campaignTotal += 1;
    }

    if (mCampaign && mStageForFacets && mSource) {
      const ag = lead.agent || "Unassigned";
      agentCounts.set(ag, (agentCounts.get(ag) || 0) + 1);
      agentTotal += 1;
    }

    if (mCampaign && mStageForFacets && mAgent) {
      const src = lead.sourceChannel || "Direct";
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
      sourceTotal += 1;
    }
  }

  // Keep currently selected campaigns visible (with count 0 if needed) so users can uncheck them.
  for (let i = 0; i < state.campaigns.length; i += 1) {
    const selectedCamp = state.campaigns[i];
    if (!campaignCounts.has(selectedCamp)) {
      campaignCounts.set(selectedCamp, 0);
    }
  }

  const campaignOptions: PipelineCampaignOption[] = [];
  const directCount = campaignCounts.get("Direct");
  if (directCount !== undefined) {
    campaignOptions.push({
      value: "Direct",
      label: "Direct",
      fullValue: "Direct",
      count: directCount,
    });
  }

  const otherCampaigns = Array.from(campaignCounts.entries())
    .filter(([key]) => key !== "Direct")
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const labelA = campaignMeta.get(a[0])?.label || a[0];
      const labelB = campaignMeta.get(b[0])?.label || b[0];
      return labelA.localeCompare(labelB);
    });

  for (let i = 0; i < otherCampaigns.length; i += 1) {
    const [key, count] = otherCampaigns[i];
    const meta = campaignMeta.get(key);
    campaignOptions.push({
      value: key,
      label: meta?.label || key,
      fullValue: meta?.fullValue || key,
      count,
    });
  }

  // Ensure assignable team members and any active selected agent stay available in the Agent dropdown.
  const assignable = options?.assignableAgentNames || [];
  for (let i = 0; i < assignable.length; i += 1) {
    const name = assignable[i];
    if (name && !agentCounts.has(name)) {
      agentCounts.set(name, 0);
    }
  }
  if (!agentAll && !agentCounts.has(filterAgent)) {
    agentCounts.set(filterAgent, 0);
  }

  const sortedAgents = Array.from(agentCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const agentOptions: PipelineFacetOption[] = [
    { value: "Everyone", label: `Everyone (${agentTotal})`, count: agentTotal },
    ...sortedAgents.map(([ag, count]) => ({
      value: ag,
      label: `${ag} (${count})`,
      count,
    })),
  ];

  if (!sourceAll && !sourceCounts.has(filterSource)) {
    sourceCounts.set(filterSource, 0);
  }
  const sortedSources = Array.from(sourceCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const sourceOptions: PipelineFacetOption[] = [
    {
      value: "All sources",
      label: `All sources (${sourceTotal})`,
      count: sourceTotal,
    },
    ...sortedSources.map(([src, count]) => ({
      value: src,
      label: `${src} (${count})`,
      count,
    })),
  ];

  return {
    boardLeads,
    tableLeads,
    groupedByStage,
    stageCounts,
    stageTotal,
    campaignOptions,
    campaignTotal,
    agentOptions,
    agentTotal,
    sourceOptions,
    sourceTotal,
  };
}

/**
 * Sorts filtered Pipeline Table leads when a column sort is active.
 * Returns the original array unchanged when `sort.field === "default"` (0 allocations).
 */
export function sortPipelineTableLeads<T extends PipelineFilterableLead>(
  leads: ReadonlyArray<T>,
  sort: PipelineTableSort
): ReadonlyArray<T> {
  if (sort.field === "default" || leads.length <= 1) {
    return leads;
  }

  const factor = sort.dir === "asc" ? 1 : -1;
  const copy = [...leads];

  copy.sort((a, b) => {
    switch (sort.field) {
      case "received":
        return (a.rawCreatedAt - b.rawCreatedAt) * factor;
      case "stage":
        return (
          ((PIPELINE_STAGE_ORDER[a.stage] ?? 99) -
            (PIPELINE_STAGE_ORDER[b.stage] ?? 99)) *
          factor
        );
      case "name":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * factor;
      case "campaign":
        return (
          a.campaignLabel.localeCompare(b.campaignLabel, undefined, {
            sensitivity: "base",
          }) * factor
        );
      case "agent":
        return a.agent.localeCompare(b.agent, undefined, { sensitivity: "base" }) * factor;
      default:
        return 0;
    }
  });

  return copy;
}

/**
 * Cycles column sort state cleanly: clicking a new column sorts descending for `received`
 * and ascending for text/stage columns; clicking again reverses direction; third click resets to default.
 */
export function getNextTableSort(
  current: PipelineTableSort,
  field: Exclude<PipelineTableSortField, "default">
): PipelineTableSort {
  const defaultDir: PipelineTableSortDir = field === "received" ? "desc" : "asc";
  if (current.field !== field) {
    return { field, dir: defaultDir };
  }
  if (current.dir === defaultDir) {
    return { field, dir: defaultDir === "asc" ? "desc" : "asc" };
  }
  return DEFAULT_PIPELINE_TABLE_SORT;
}

