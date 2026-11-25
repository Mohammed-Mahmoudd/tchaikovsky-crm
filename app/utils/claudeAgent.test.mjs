import test from "node:test";
import assert from "node:assert/strict";
import {
  formatClaudePausedReason,
  getLeadClaudeStatusMeta,
  parseSlotListInput,
  formatSlotListInput,
  parseClosedDatesInput,
  resolveClaudeSubTabFromHash,
  getHashForClaudeSubTab,
  summarizeClaudeLeadCounts,
  filterClaudeLeadCandidates,
  mergeAssignedClaudeLeads,
  formatToolTraceTitle,
  getActivityOutcomeMeta,
  formatDurationLabel,
  formatClaudeActivationNote,
  splitDisplayReplyChunks,
  filterCachedActivityItems,
  selectAttentionLeads,
  formatSkillDisplayLabel,
} from "./claudeAgent.ts";

test("formatClaudePausedReason returns readable labels for pause codes", () => {
  assert.equal(formatClaudePausedReason("staff_replied"), "Paused after staff reply");
  assert.equal(formatClaudePausedReason("manual_pause"), "Paused manually");
  assert.equal(formatClaudePausedReason("escalated:Discount"), "Escalated (Discount)");
  assert.equal(formatClaudePausedReason(""), "Paused");
});

test("getLeadClaudeStatusMeta maps enabled, paused, global-off, and off states to theme tokens", () => {
  const off = getLeadClaudeStatusMeta({ claudeEnabled: false, claudePaused: false });
  assert.equal(off.state, "off");
  assert.equal(off.dotVar, "var(--label-slate-dot)");

  const paused = getLeadClaudeStatusMeta({
    claudeEnabled: true,
    claudePaused: true,
    claudePausedReason: "staff_replied",
    globalEnabled: true,
  });
  assert.equal(paused.state, "paused");
  assert.equal(paused.description, "Paused after staff reply");
  assert.equal(paused.dotVar, "var(--label-amber-dot)");

  const globalOff = getLeadClaudeStatusMeta({
    claudeEnabled: true,
    claudePaused: false,
    globalEnabled: false,
  });
  assert.equal(globalOff.state, "global_off");

  const active = getLeadClaudeStatusMeta({
    claudeEnabled: true,
    claudePaused: false,
    globalEnabled: true,
  });
  assert.equal(active.state, "active");
  assert.equal(active.dotVar, "var(--label-green-dot)");
});

test("slot and closed-date list helpers parse and format cleanly", () => {
  assert.deepEqual(parseSlotListInput(" 05:30 PM, 06:30 PM , , 07:30 PM "), [
    "05:30 PM",
    "06:30 PM",
    "07:30 PM",
  ]);
  assert.equal(formatSlotListInput(["11:00 AM", "12:00 PM"]), "11:00 AM, 12:00 PM");
  assert.deepEqual(
    parseClosedDatesInput("2026-11-20, invalid-date, 2026-11-21 2026-11-20"),
    ["2026-11-20", "2026-11-21"]
  );
});

test("resolveClaudeSubTabFromHash and getHashForClaudeSubTab round-trip sub-tabs", () => {
  assert.equal(resolveClaudeSubTabFromHash("#claude"), "overview");
  assert.equal(resolveClaudeSubTabFromHash("#claude-activity"), "activity");
  assert.equal(resolveClaudeSubTabFromHash("#claude-skills"), "skills");
  assert.equal(resolveClaudeSubTabFromHash("#claude-sandbox"), "sandbox");
  assert.equal(resolveClaudeSubTabFromHash("#claude-leads"), "leads");
  assert.equal(resolveClaudeSubTabFromHash("#claude-studio"), "studio");
  assert.equal(getHashForClaudeSubTab("overview"), "claude");
  assert.equal(getHashForClaudeSubTab("activity"), "claude-activity");
  assert.equal(getHashForClaudeSubTab("skills"), "claude-skills");
  assert.equal(getHashForClaudeSubTab("sandbox"), "claude-sandbox");
  assert.equal(getHashForClaudeSubTab("leads"), "claude-leads");
  assert.equal(getHashForClaudeSubTab("studio"), "claude-studio");
});

test("filterClaudeLeadCandidates, summarizeClaudeLeadCounts, and mergeAssignedClaudeLeads stay consistent", () => {
  const sample = [
    { id: "1", channel: "WA", pipeline: "New", branch: "Riyadh", claudeEnabled: true, claudePaused: false, lastMessageAt: 300 },
    { id: "2", channel: "IG", pipeline: "Contacted", branch: "Jeddah", claudeEnabled: true, claudePaused: true, claudePausedReason: "staff_replied", lastMessageAt: 500 },
    { id: "3", channel: "FB", pipeline: "New", branch: "", claudeEnabled: false, claudePaused: false, lastMessageAt: 400 },
    { id: "4", channel: "WA", pipeline: "Enrolled", branch: "Riyadh", isDone: true, claudeEnabled: false, lastMessageAt: 600 },
    { id: "5", channel: "WA", pipeline: "New", branch: "Riyadh", claudeEnabled: false, claudeLastError: "timeout", lastMessageAt: 200 },
  ];

  assert.deepEqual(summarizeClaudeLeadCounts(sample), {
    totalAssigned: 2,
    activeCount: 1,
    pausedCount: 1,
    errorCount: 1,
  });

  // Excludes Done/Archived by default
  assert.deepEqual(
    filterClaudeLeadCandidates(sample, { assignmentFilter: "all" }).map((i) => i.id),
    ["2", "3", "1", "5"]
  );
  assert.deepEqual(
    filterClaudeLeadCandidates(sample, { assignmentFilter: "assigned" }).map((i) => i.id),
    ["2", "1"]
  );
  assert.deepEqual(
    filterClaudeLeadCandidates(sample, { assignmentFilter: "unassigned", branchFilter: "__none__" }).map((i) => i.id),
    ["3"]
  );
  assert.deepEqual(
    filterClaudeLeadCandidates(sample, { includeClosedBuckets: true, stageFilter: "Enrolled" }).map((i) => i.id),
    ["4"]
  );

  // Merge reflects live turn-off + newly assigned lead in Settings immediately
  const merged = mergeAssignedClaudeLeads(
    [
      { senderId: "1", channel: "WA", claudeEnabled: true, claudePaused: false, lastMessageAt: 300 },
      { senderId: "2", channel: "IG", claudeEnabled: true, claudePaused: true, lastMessageAt: 500 },
    ],
    [
      { id: "1", channel: "WA", claudeEnabled: false, claudePaused: false, lastMessageAt: 300 },
      { id: "6", name: "Lama", channel: "WA", claudeEnabled: true, claudePaused: false, lastMessageAt: 900 },
    ]
  );
  assert.deepEqual(
    merged.map((m) => m.senderId),
    ["6", "2"]
  );
  assert.equal(formatToolTraceTitle("book_discovery_session"), "Booked discovery session (simulated)");
  assert.equal(formatToolTraceTitle("get_skill_guidance"), "Loaded trained skill guidance");
  assert.deepEqual(getActivityOutcomeMeta("booked"), { label: "Booked session", tone: "green" });
  assert.deepEqual(getActivityOutcomeMeta("error"), { label: "Error", tone: "red" });
  assert.equal(formatDurationLabel(420), "420ms");
  assert.equal(formatDurationLabel(1660), "1.7s");
  assert.deepEqual(splitDisplayReplyChunks("Hello\n\nWorld"), ["Hello\n\nWorld"]);
  assert.deepEqual(splitDisplayReplyChunks("Hi!\n[[SPLIT]]\nHow can I help?"), [
    "Hi!",
    "How can I help?",
  ]);

  assert.deepEqual(
    formatClaudeActivationNote("Enabled", { autoReplyTriggered: true }),
    {
      message: "Enabled. Adham is reading the chat and replying now.",
      tone: "info",
    }
  );
  const expired7dNote = formatClaudeActivationNote("Enabled", {
    autoReplyTriggered: false,
    autoReplySkippedReason: "meta_7d_window_expired",
  });
  assert.equal(expired7dNote.tone, "warning");
  assert.match(expired7dNote.message, /7-day Messenger\/Instagram window expired/);
  const expired24hNote = formatClaudeActivationNote("Enabled", {
    autoReplyTriggered: false,
    autoReplySkippedReason: "meta_24h_window_expired",
  });
  assert.equal(expired24hNote.tone, "warning");
  assert.match(expired24hNote.message, /24-hour Messenger\/Instagram window expired/);
  assert.equal(
    formatClaudeActivationNote("Resumed", {
      autoReplyTriggered: false,
      autoReplySkippedReason: "global_disabled",
    }).tone,
    "warning"
  );
});

test("filterCachedActivityItems, selectAttentionLeads, and formatSkillDisplayLabel support Overview filters", () => {
  const nowMs = Date.UTC(2026, 10, 25, 12, 0, 0);
  const items = [
    {
      _id: "a1",
      senderId: "s1",
      leadName: "Noura",
      channel: "WA",
      branch: "Riyadh Park Mall",
      incomingText: "Book Friday",
      replyText: "Booked!",
      outcome: "booked",
      actionSummary: "Booked Riyadh Park Mall · Fri 5 PM",
      createdAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      _id: "a2",
      senderId: "s2",
      leadName: "Omar",
      channel: "IG",
      branch: "Jeddah",
      incomingText: "Discount please",
      replyText: "Escalating",
      outcome: "escalated",
      createdAt: new Date(nowMs - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      _id: "a3",
      senderId: "s3",
      leadName: "Lama",
      channel: "FB",
      incomingText: "Hi",
      replyText: "",
      outcome: "error",
      errorMessage: "Timeout",
      createdAt: new Date(nowMs - 48 * 60 * 60 * 1000).toISOString(),
    },
  ];

  assert.deepEqual(
    filterCachedActivityItems(items, { outcome: "attention", window: "all", nowMs }).map((i) => i._id),
    ["a2", "a3"]
  );
  assert.deepEqual(
    filterCachedActivityItems(items, { outcome: "attention", window: "24h", nowMs }).map((i) => i._id),
    ["a2"]
  );
  assert.deepEqual(
    filterCachedActivityItems(items, { search: "riyadh", nowMs }).map((i) => i._id),
    ["a1"]
  );

  const attention = selectAttentionLeads([
    { senderId: "1", channel: "WA", claudeEnabled: true, claudePaused: true, claudePausedReason: "staff_replied", lastMessageAt: 900 },
    { senderId: "2", channel: "WA", claudeEnabled: true, claudePaused: true, claudePausedReason: "escalated:Discount", lastMessageAt: 500 },
    { senderId: "3", channel: "IG", claudeEnabled: true, claudePaused: false, claudeLastError: "API timeout", lastMessageAt: 300 },
  ]);
  assert.deepEqual(
    attention.map((l) => l.senderId),
    ["3", "2"]
  );

  assert.equal(formatSkillDisplayLabel("price-first-objection-handling"), "Price first objection handling");
});

