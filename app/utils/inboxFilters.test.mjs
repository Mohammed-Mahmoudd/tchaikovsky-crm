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
  getInboxBucketCounts,
  isConversationArchived,
  isConversationDone,
  isConversationInMainInbox,
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
      "Mine",
      "Unassigned",
      "Open",
      "Resolved",
      "DONE",
      "Archived",
    ]);

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
});

