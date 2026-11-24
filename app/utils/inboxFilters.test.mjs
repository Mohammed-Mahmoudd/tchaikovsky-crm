import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_FILTERS,
  OPERATION_INBOX_FILTERS,
  buildArchivePatch,
  buildMarkAsDonePatch,
  buildReopenDonePatch,
  buildUnarchivePatch,
  computeInboxUnreadBadge,
  filterConversationsByInbox,
  getFilterBucketTotal,
  getGroupConversationCount,
  getInboxFilters,
  getSavedConversationCount,
  getUnreadConversationCount,
  getInboxBucketCounts,
  isConversationArchived,
  isConversationDone,
  isConversationInMainInbox,
  isGroupConversation,
  matchesInboxFilter,
  resolveConvInboxMode,
} from "./inboxFilters.ts";

describe("inboxFilters", () => {
  const activeWa = {
    agent: "Sara",
    status: "Open",
    channel: "WA",
    isDone: false,
    isArchived: false,
    unreadCount: 3,
  };
  const activeUnassignedFb = {
    agent: "Unassigned",
    status: "Resolved",
    channel: "FB",
    isDone: false,
    isArchived: false,
    unreadCount: 2,
  };
  const doneConv = {
    agent: "Sara",
    status: "Open",
    channel: "IG",
    isDone: true,
    isArchived: false,
    unreadCount: 5,
  };
  const archivedConv = {
    agent: "Unassigned",
    status: "Resolved",
    channel: "WA",
    metaChannel: "FB",
    isDone: false,
    isArchived: true,
    unreadCount: 4,
  };
  const bothFlaggedLegacy = {
    agent: "Sara",
    status: "Open",
    channel: "WA",
    isDone: true,
    isArchived: true,
    unreadCount: 1,
  };

  it("includes DONE and Archived in INBOX_FILTERS while keeping existing filters", () => {
    assert.deepEqual(INBOX_FILTERS, [
      "All",
      "Mine",
      "Unassigned",
      "Open",
      "Resolved",
      "WA",
      "IG",
      "FB",
      "DONE",
      "Archived",
    ]);
  });

  it("classifies main, DONE, and Archived conversations mutually exclusively", () => {
    assert.equal(isConversationInMainInbox(activeWa), true);
    assert.equal(isConversationDone(activeWa), false);
    assert.equal(isConversationArchived(activeWa), false);

    assert.equal(isConversationInMainInbox(doneConv), false);
    assert.equal(isConversationDone(doneConv), true);
    assert.equal(isConversationArchived(doneConv), false);

    assert.equal(isConversationInMainInbox(archivedConv), false);
    assert.equal(isConversationDone(archivedConv), false);
    assert.equal(isConversationArchived(archivedConv), true);

    // Archived takes precedence if both booleans happen to be true
    assert.equal(isConversationArchived(bothFlaggedLegacy), true);
    assert.equal(isConversationDone(bothFlaggedLegacy), false);
    assert.equal(isConversationInMainInbox(bothFlaggedLegacy), false);
  });

  it("hides DONE and Archived conversations from all main Inbox tabs and surfaces them in DONE and Archived", () => {
    const mainFilters = ["All", "Mine", "Unassigned", "Open", "Resolved", "WA", "IG", "FB"];
    for (const f of mainFilters) {
      assert.equal(matchesInboxFilter(doneConv, f, "Sara"), false, `DONE must not appear in ${f}`);
      assert.equal(matchesInboxFilter(archivedConv, f, "Sara"), false, `Archived must not appear in ${f}`);
    }

    assert.equal(matchesInboxFilter(activeWa, "All", "Sara"), true);
    assert.equal(matchesInboxFilter(activeWa, "Mine", "Sara"), true);
    assert.equal(matchesInboxFilter(activeWa, "Open", "Sara"), true);
    assert.equal(matchesInboxFilter(activeWa, "WA", "Sara"), true);
    assert.equal(matchesInboxFilter(activeUnassignedFb, "Unassigned", "Sara"), true);
    assert.equal(matchesInboxFilter(activeUnassignedFb, "Resolved", "Sara"), true);
    assert.equal(matchesInboxFilter(activeUnassignedFb, "FB", "Sara"), true);

    assert.equal(matchesInboxFilter(doneConv, "DONE", "Sara"), true);
    assert.equal(matchesInboxFilter(activeWa, "DONE", "Sara"), false);
    assert.equal(matchesInboxFilter(archivedConv, "DONE", "Sara"), false);

    assert.equal(matchesInboxFilter(archivedConv, "Archived", "Sara"), true);
    assert.equal(matchesInboxFilter(doneConv, "Archived", "Sara"), false);
    assert.equal(matchesInboxFilter(activeWa, "Archived", "Sara"), false);
  });

  it("computes bucket counts and excludes DONE & Archived from the Inbox unread badge", () => {
    const list = [activeWa, activeUnassignedFb, doneConv, archivedConv];
    const counts = getInboxBucketCounts(list);
    assert.deepEqual(counts, { main: 2, done: 1, archived: 1 });
    assert.equal(getFilterBucketTotal(counts, "All"), 2);
    assert.equal(getFilterBucketTotal(counts, "DONE"), 1);
    assert.equal(getFilterBucketTotal(counts, "Archived"), 1);
    assert.equal(computeInboxUnreadBadge(list), 5);
  });

  it("builds mutually exclusive patch payloads for Done, Reopen, Archive, and Unarchive", () => {
    assert.deepEqual(buildMarkAsDonePatch(" Sara ", "2026-11-16T10:00:00.000Z"), {
      isDone: true,
      doneAt: "2026-11-16T10:00:00.000Z",
      doneBy: "Sara",
      isArchived: false,
      archivedAt: null,
      archivedBy: "",
    });
    assert.deepEqual(buildReopenDonePatch(), {
      isDone: false,
      doneAt: null,
      doneBy: "",
    });
    assert.deepEqual(buildArchivePatch("Omar", "2026-11-16T11:00:00.000Z"), {
      isArchived: true,
      archivedAt: "2026-11-16T11:00:00.000Z",
      archivedBy: "Omar",
      isDone: false,
      doneAt: null,
      doneBy: "",
    });
    assert.deepEqual(buildUnarchivePatch(), {
      isArchived: false,
      archivedAt: null,
      archivedBy: "",
    });
  });

  it("partitions conversations and filters cleanly between admissions and operation inboxes", () => {
    assert.deepEqual(OPERATION_INBOX_FILTERS, [
      "All",
      "Unread",
      "Mine",
      "Unassigned",
      "Open",
      "Resolved",
      "Groups",
      "DONE",
      "Archived",
    ]);
    assert.equal(INBOX_FILTERS.includes("Unread"), false);

    const mixed = [
      { id: "201001234567", channel: "WA", unreadCount: 2, isDone: false, isArchived: false },
      { id: "op_201001234567", channel: "WA", inbox: "operation", unreadCount: 4, isDone: false, isArchived: false },
    ];
    assert.equal(resolveConvInboxMode(mixed[0]), "admissions");
    assert.equal(resolveConvInboxMode(mixed[1]), "operation");
    assert.equal(resolveConvInboxMode("op_201009998888"), "operation");

    const adm = filterConversationsByInbox(mixed, "admissions");
    const op = filterConversationsByInbox(mixed, "operation");
    assert.equal(adm.length, 1);
    assert.equal(op.length, 1);
    assert.equal(computeInboxUnreadBadge(adm), 2);
    assert.equal(computeInboxUnreadBadge(op), 4);
  });

  it("routes WhatsApp groups exclusively into operation inbox and excludes them from admissions", () => {
    const groupConv = {
      id: "op_grp_120363012345678901",
      channel: "WA",
      isGroup: true,
      unreadCount: 3,
      isDone: false,
      isArchived: false,
    };
    const admLead = {
      id: "201001234567",
      channel: "WA",
      unreadCount: 1,
      isDone: false,
      isArchived: false,
    };

    assert.equal(isGroupConversation(groupConv), true);
    assert.equal(isGroupConversation(admLead), false);
    assert.equal(isGroupConversation("120363012345678901@g.us"), true);
    assert.equal(resolveConvInboxMode(groupConv), "operation");
    assert.equal(resolveConvInboxMode({ id: "grp_999", inbox: "admissions", isGroup: true }), "operation");

    const list = [groupConv, admLead];
    assert.deepEqual(
      filterConversationsByInbox(list, "admissions").map((c) => c.id),
      ["201001234567"]
    );
    assert.deepEqual(
      filterConversationsByInbox(list, "operation").map((c) => c.id),
      ["op_grp_120363012345678901"]
    );

    const opMixed = [
      { id: "op_grp_120363012345678901", channel: "WA", isGroup: true, isDone: false, isArchived: false },
      { id: "op_201001234567", channel: "WA", isGroup: false, isDone: false, isArchived: false },
      { id: "op_grp_999888777", channel: "WA", isGroup: true, isDone: true, isArchived: false },
    ];
    assert.deepEqual(
      opMixed.filter((c) => matchesInboxFilter(c, "Groups", "Omar")).map((c) => c.id),
      ["op_grp_120363012345678901"]
    );
    assert.equal(getGroupConversationCount(opMixed), 1);
  });

  it("filters and counts Unread conversations strictly in main inbox", () => {
    const opList = [
      { id: "op_20101", unreadCount: 3, isDone: false, isArchived: false },
      { id: "op_20102", unreadCount: 0, isDone: false, isArchived: false },
      { id: "op_grp_1", isGroup: true, unreadCount: 2, isDone: false, isArchived: false },
      { id: "op_20103", unreadCount: 5, isDone: true, isArchived: false },
      { id: "op_20104", unreadCount: 4, isDone: false, isArchived: true },
    ];
    assert.deepEqual(
      opList.filter((c) => matchesInboxFilter(c, "Unread", "Omar")).map((c) => c.id),
      ["op_20101", "op_grp_1"]
    );
    assert.equal(getUnreadConversationCount(opList), 2);
  });

  it("exposes Saved tab only when authorized and matches saved conversations across all buckets", () => {
    assert.equal(getInboxFilters("admissions", false).includes("Saved"), false);
    assert.equal(getInboxFilters("operation", false).includes("Saved"), false);

    const admSaved = getInboxFilters("admissions", true);
    assert.equal(admSaved.includes("Saved"), true);
    assert.ok(admSaved.indexOf("Saved") < admSaved.indexOf("DONE"));

    const savedInMain = { ...activeWa, savedForAgent: true };
    const savedInDone = { ...doneConv, savedForAgent: true };
    const savedInArchive = { ...archivedConv, savedForAgent: true };
    const unsaved = { ...activeUnassignedFb, savedForAgent: false };

    const list = [savedInMain, savedInDone, savedInArchive, unsaved];
    assert.equal(matchesInboxFilter(savedInMain, "Saved", "Chairman"), true);
    assert.equal(matchesInboxFilter(savedInDone, "Saved", "Chairman"), true);
    assert.equal(matchesInboxFilter(savedInArchive, "Saved", "Chairman"), true);
    assert.equal(matchesInboxFilter(unsaved, "Saved", "Chairman"), false);
    assert.equal(getSavedConversationCount(list), 3);
    assert.equal(getFilterBucketTotal(getInboxBucketCounts(list), "Saved", 3), 3);
  });
});

