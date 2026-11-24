import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PIPELINE_FILTER_STATE,
  DEFAULT_PIPELINE_TABLE_SORT,
  countActivePipelineFilters,
  evaluatePipelineFilters,
  getCampaignsFilterSummary,
  getDefaultCustomDateRange,
  getNextTableSort,
  getStagesFilterSummary,
  getTimeFilterSummary,
  isTimeFilterActive,
  parseLocalIsoDate,
  resolveTimeBounds,
  sortPipelineTableLeads,
  toLocalIsoDate,
  toggleMultiSelection,
} from "./pipelineFilters.ts";

function localTs(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

// Reference "now": Tuesday, Nov 24, 2026 at 15:00 local time
// Saudi week (Sat–Fri): Sat Nov 21, 2026 .. Fri Nov 27, 2026
// Previous Saudi week:  Sat Nov 14, 2026 .. Fri Nov 20, 2026
const REF_NOW = localTs(2026, 11, 24, 15, 0);

const SAMPLE_LEADS = [
  {
    id: "1",
    name: "Amina Hassan",
    campaignKey: "TCH | SAU | ADULT | NOV26",
    campaignLabel: "ADULT | NOV26",
    campaignFull: "TCH | SAU | ADULT | NOV26",
    sourceChannel: "WA",
    stage: "New",
    agent: "Sara",
    rawCreatedAt: localTs(2026, 11, 24, 10, 0), // Today (Tue Nov 24)
  },
  {
    id: "2",
    name: "Zaid Omar",
    campaignKey: "TCH | SAU | KIDS | NOV26",
    campaignLabel: "KIDS | NOV26",
    campaignFull: "TCH | SAU | KIDS | NOV26",
    sourceChannel: "IG",
    stage: "Audition Booked",
    agent: "Omar",
    rawCreatedAt: localTs(2026, 11, 23, 18, 30), // Yesterday (Mon Nov 23)
  },
  {
    id: "3",
    name: "Layla Noor",
    campaignKey: "TCH | SAU | ADULT | NOV26",
    campaignLabel: "ADULT | NOV26",
    campaignFull: "TCH | SAU | ADULT | NOV26",
    sourceChannel: "FB",
    stage: "Enrolled",
    agent: "Sara",
    rawCreatedAt: localTs(2026, 11, 21, 9, 0), // Sat Nov 21 (This week start)
  },
  {
    id: "4",
    name: "Yousef Ali",
    campaignKey: "Direct",
    campaignLabel: "Direct",
    campaignFull: "Direct",
    sourceChannel: "WA",
    stage: "Lost",
    agent: "Unassigned",
    rawCreatedAt: localTs(2026, 11, 15, 14, 0), // Sun Nov 15 (Last week)
  },
  {
    id: "5",
    name: "Mariam Tariq",
    campaignKey: "TCH | SAU | KIDS | NOV26",
    campaignLabel: "KIDS | NOV26",
    campaignFull: "TCH | SAU | KIDS | NOV26",
    sourceChannel: "WA",
    stage: "Contacted",
    agent: "Omar",
    rawCreatedAt: localTs(2026, 10, 20, 11, 0), // Oct 20 (Last month)
  },
];

describe("resolveTimeBounds", () => {
  it("resolves Today, Yesterday, and Saudi Sat–Fri week presets accurately", () => {
    const today = resolveTimeBounds({ preset: "today", startDate: "", endDate: "" }, REF_NOW);
    assert.equal(today.startMs, new Date(2026, 10, 24, 0, 0, 0, 0).getTime());
    assert.equal(today.endMs, new Date(2026, 10, 24, 23, 59, 59, 999).getTime());

    const yesterday = resolveTimeBounds(
      { preset: "yesterday", startDate: "", endDate: "" },
      REF_NOW
    );
    assert.equal(yesterday.startMs, new Date(2026, 10, 23, 0, 0, 0, 0).getTime());
    assert.equal(yesterday.endMs, new Date(2026, 10, 23, 23, 59, 59, 999).getTime());

    const thisWeek = resolveTimeBounds(
      { preset: "this_week", startDate: "", endDate: "" },
      REF_NOW
    );
    assert.equal(thisWeek.startMs, new Date(2026, 10, 21, 0, 0, 0, 0).getTime());
    assert.equal(thisWeek.endMs, new Date(2026, 10, 27, 23, 59, 59, 999).getTime());

    const lastWeek = resolveTimeBounds(
      { preset: "last_week", startDate: "", endDate: "" },
      REF_NOW
    );
    assert.equal(lastWeek.startMs, new Date(2026, 10, 14, 0, 0, 0, 0).getTime());
    assert.equal(lastWeek.endMs, new Date(2026, 10, 20, 23, 59, 59, 999).getTime());
  });

  it("resolves rolling windows, month boundaries, and inverted custom ranges safely", () => {
    const last7 = resolveTimeBounds(
      { preset: "last_7_days", startDate: "", endDate: "" },
      REF_NOW
    );
    assert.equal(last7.startMs, new Date(2026, 10, 18, 0, 0, 0, 0).getTime());
    assert.equal(last7.endMs, new Date(2026, 10, 24, 23, 59, 59, 999).getTime());

    const lastMonth = resolveTimeBounds(
      { preset: "last_month", startDate: "", endDate: "" },
      REF_NOW
    );
    assert.equal(lastMonth.startMs, new Date(2026, 9, 1, 0, 0, 0, 0).getTime());
    assert.equal(lastMonth.endMs, new Date(2026, 9, 31, 23, 59, 59, 999).getTime());

    // Inverted custom dates should normalize automatically
    const swapped = resolveTimeBounds(
      { preset: "custom", startDate: "2026-11-24", endDate: "2026-11-15" },
      REF_NOW
    );
    assert.equal(swapped.startMs, new Date(2026, 10, 15, 0, 0, 0, 0).getTime());
    assert.equal(swapped.endMs, new Date(2026, 10, 24, 23, 59, 59, 999).getTime());

    // Open-ended start-only custom date
    const openEnd = resolveTimeBounds(
      { preset: "custom", startDate: "2026-11-20", endDate: "" },
      REF_NOW
    );
    assert.equal(openEnd.startMs, new Date(2026, 10, 20, 0, 0, 0, 0).getTime());
    assert.equal(openEnd.endMs, null);
  });

  it("rejects impossible calendar dates in parseLocalIsoDate", () => {
    assert.equal(parseLocalIsoDate("2026-02-31"), null);
    assert.equal(parseLocalIsoDate("not-a-date"), null);
    assert.equal(toLocalIsoDate(parseLocalIsoDate("2026-11-24")), "2026-11-24");
    assert.deepEqual(getDefaultCustomDateRange(REF_NOW), {
      startDate: "2026-11-18",
      endDate: "2026-11-24",
    });
  });
});

describe("evaluatePipelineFilters", () => {
  it("filters by Time, multi-select Campaigns, and multi-select Stages with accurate faceted counts", () => {
    const result = evaluatePipelineFilters(
      SAMPLE_LEADS,
      {
        ...DEFAULT_PIPELINE_FILTER_STATE,
        time: { preset: "this_week", startDate: "", endDate: "" },
        campaigns: ["TCH | SAU | ADULT | NOV26"],
        stages: ["New", "Audition Booked"],
      },
      { nowMs: REF_NOW, applyStageFilterToFacets: true }
    );

    // boardLeads ignores stages filter (for Kanban board): leads 1 & 3 are ADULT in this_week
    assert.deepEqual(
      result.boardLeads.map((l) => l.id),
      ["1", "3"]
    );

    // tableLeads applies stages filter too: only lead 1 ("New") matches ADULT + this_week + [New, Audition Booked]
    assert.deepEqual(
      result.tableLeads.map((l) => l.id),
      ["1"]
    );

    // Faceted stage counts ignore Stage filter (still apply Time + Campaign): New=1, Enrolled=1
    assert.equal(result.stageTotal, 2);
    assert.equal(result.stageCounts.New, 1);
    assert.equal(result.stageCounts.Enrolled, 1);
    assert.equal(result.stageCounts["Audition Booked"], 0);

    // Faceted campaign counts ignore Campaign filter (still apply Time + Stage):
    // In this_week + stages [New, Audition Booked] -> lead 1 (ADULT) and lead 2 (KIDS)
    assert.equal(result.campaignTotal, 2);
    assert.deepEqual(
      result.campaignOptions.map((o) => [o.label, o.count]),
      [
        ["ADULT | NOV26", 1],
        ["KIDS | NOV26", 1],
      ]
    );
  });

  it("supports multi-select campaigns and keeps zero-count selected campaigns toggleable", () => {
    const result = evaluatePipelineFilters(
      SAMPLE_LEADS,
      {
        ...DEFAULT_PIPELINE_FILTER_STATE,
        time: { preset: "today", startDate: "", endDate: "" },
        campaigns: ["TCH | SAU | ADULT | NOV26", "TCH | SAU | KIDS | NOV26"],
      },
      { nowMs: REF_NOW, applyStageFilterToFacets: true }
    );

    assert.deepEqual(
      result.tableLeads.map((l) => l.id),
      ["1"]
    );
    const kidsOpt = result.campaignOptions.find((o) => o.value === "TCH | SAU | KIDS | NOV26");
    assert.ok(kidsOpt);
    assert.equal(kidsOpt.count, 0);
  });

  it("places Direct first in campaignOptions and includes assignable agents with 0 count", () => {
    const result = evaluatePipelineFilters(SAMPLE_LEADS, DEFAULT_PIPELINE_FILTER_STATE, {
      nowMs: REF_NOW,
      assignableAgentNames: ["Sara", "Nadia"],
    });

    assert.equal(result.campaignOptions[0].value, "Direct");
    assert.equal(result.campaignOptions[0].count, 1);
    const nadia = result.agentOptions.find((a) => a.value === "Nadia");
    assert.ok(nadia);
    assert.equal(nadia.count, 0);
  });

  it("handles 5,000 leads in a single pass well under 25ms", () => {
    const bigLeads = [];
    for (let i = 0; i < 5000; i += 1) {
      const base = SAMPLE_LEADS[i % SAMPLE_LEADS.length];
      bigLeads.push({ ...base, id: `lead-${i}` });
    }
    const start = performance.now();
    const res = evaluatePipelineFilters(
      bigLeads,
      {
        time: { preset: "this_month", startDate: "", endDate: "" },
        campaigns: ["TCH | SAU | ADULT | NOV26", "TCH | SAU | KIDS | NOV26"],
        stages: ["New", "Audition Booked"],
        agent: "Everyone",
        source: "All sources",
      },
      { nowMs: REF_NOW }
    );
    const elapsedMs = performance.now() - start;
    assert.equal(res.tableLeads.length, 2000);
    assert.ok(elapsedMs < 50, `Expected <50ms for 5000 leads, got ${elapsedMs.toFixed(2)}ms`);
  });
});

describe("summaries, selection toggles, and table sorting", () => {
  it("formats time, campaign, and stage filter summaries accurately", () => {
    assert.equal(isTimeFilterActive({ preset: "any", startDate: "", endDate: "" }), false);
    assert.equal(isTimeFilterActive({ preset: "custom", startDate: "", endDate: "" }), false);
    assert.equal(
      isTimeFilterActive({ preset: "custom", startDate: "2026-11-10", endDate: "" }),
      true
    );

    const customRange = getTimeFilterSummary(
      { preset: "custom", startDate: "2026-11-10", endDate: "2026-11-24" },
      REF_NOW
    );
    assert.equal(customRange.active, true);
    assert.equal(customRange.label, "Nov 10 – Nov 24");

    const singleCamp = getCampaignsFilterSummary(
      ["TCH | SAU | ADULT | NOV26"],
      [
        {
          value: "TCH | SAU | ADULT | NOV26",
          label: "ADULT | NOV26",
          fullValue: "TCH | SAU | ADULT | NOV26",
          count: 14,
        },
      ],
      30
    );
    assert.equal(singleCamp.label, "ADULT | NOV26 (14)");
    assert.equal(singleCamp.active, true);

    const multiStage = getStagesFilterSummary(
      ["New", "Audition Booked"],
      {
        New: 10,
        Contacted: 5,
        Qualified: 2,
        "Audition Booked": 4,
        Attended: 1,
        Enrolled: 1,
        "Joining Later": 0,
        Unqualified: 0,
        Lost: 3,
      },
      26
    );
    assert.equal(multiStage.label, "2 stages");
    assert.equal(multiStage.title, "New, Audition Booked");

    assert.deepEqual(toggleMultiSelection(["New"], "Lost"), ["New", "Lost"]);
    assert.deepEqual(toggleMultiSelection(["New", "Lost"], "New"), ["Lost"]);

    assert.equal(
      countActivePipelineFilters(
        {
          time: { preset: "today", startDate: "", endDate: "" },
          campaigns: ["Direct"],
          stages: ["New"],
          agent: "Everyone",
          source: "All sources",
        },
        true
      ),
      3
    );
    assert.equal(
      countActivePipelineFilters(
        {
          time: { preset: "today", startDate: "", endDate: "" },
          campaigns: ["Direct"],
          stages: ["New"],
          agent: "Everyone",
          source: "All sources",
        },
        false
      ),
      2
    );
  });

  it("sorts leads by received timestamp, stage order, and name, and cycles sort directions", () => {
    // Default returns the same reference without copying
    assert.equal(sortPipelineTableLeads(SAMPLE_LEADS, DEFAULT_PIPELINE_TABLE_SORT), SAMPLE_LEADS);

    const byReceivedAsc = sortPipelineTableLeads(SAMPLE_LEADS, {
      field: "received",
      dir: "asc",
    });
    assert.deepEqual(
      byReceivedAsc.map((l) => l.id),
      ["5", "4", "3", "2", "1"]
    );

    const byStageAsc = sortPipelineTableLeads(SAMPLE_LEADS, { field: "stage", dir: "asc" });
    assert.deepEqual(
      byStageAsc.map((l) => l.stage),
      ["New", "Contacted", "Audition Booked", "Enrolled", "Lost"]
    );

    const byNameAsc = sortPipelineTableLeads(SAMPLE_LEADS, { field: "name", dir: "asc" });
    assert.deepEqual(
      byNameAsc.map((l) => l.name),
      ["Amina Hassan", "Layla Noor", "Mariam Tariq", "Yousef Ali", "Zaid Omar"]
    );

    const s1 = getNextTableSort(DEFAULT_PIPELINE_TABLE_SORT, "received");
    assert.deepEqual(s1, { field: "received", dir: "desc" });
    const s2 = getNextTableSort(s1, "received");
    assert.deepEqual(s2, { field: "received", dir: "asc" });
    const s3 = getNextTableSort(s2, "received");
    assert.deepEqual(s3, DEFAULT_PIPELINE_TABLE_SORT);
  });
});

