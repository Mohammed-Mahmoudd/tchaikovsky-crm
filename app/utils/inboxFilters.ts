export const INBOX_FILTERS = [
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
] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

export interface InboxConversationLike {
  agent?: string | null;
  status?: string | null;
  channel?: string | null;
  metaChannel?: string | null;
  isArchived?: boolean | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  isDone?: boolean | null;
  doneAt?: string | null;
  doneBy?: string | null;
  unreadCount?: number | null;
}

export interface InboxBucketCounts {
  main: number;
  done: number;
  archived: number;
}

export function isConvUnassigned(agent?: string | null): boolean {
  if (!agent) return true;
  const clean = agent.trim().toLowerCase();
  return clean === "unassigned" || clean === "";
}

export function isConvAssignedToUser(agent?: string | null, userName?: string | null): boolean {
  if (!agent || !userName) return false;
  return agent.trim().toLowerCase() === userName.trim().toLowerCase();
}

export function isConversationArchived(conv?: InboxConversationLike | null): boolean {
  return Boolean(conv?.isArchived);
}

export function isConversationDone(conv?: InboxConversationLike | null): boolean {
  return !isConversationArchived(conv) && Boolean(conv?.isDone);
}

export function isConversationInMainInbox(conv?: InboxConversationLike | null): boolean {
  return !isConversationArchived(conv) && !isConversationDone(conv);
}

/**
 * Matches a conversation against the selected Inbox filter tab.
 * Archived and DONE conversations are excluded from all main Inbox tabs
 * (`All`, `Mine`, `Unassigned`, `Open`, `Resolved`, `WA`, `IG`, `FB`).
 */
export function matchesInboxFilter(
  conv: InboxConversationLike,
  filter: InboxFilter,
  userName?: string | null
): boolean {
  if (filter === "DONE") {
    return isConversationDone(conv);
  }
  if (filter === "Archived") {
    return isConversationArchived(conv);
  }

  if (!isConversationInMainInbox(conv)) {
    return false;
  }

  switch (filter) {
    case "Mine":
      return isConvAssignedToUser(conv.agent, userName);
    case "Unassigned":
      return isConvUnassigned(conv.agent);
    case "Open":
      return conv.status === "Open";
    case "Resolved":
      return conv.status === "Resolved";
    case "WA":
      return conv.channel === "WA";
    case "IG":
      return conv.channel === "IG" || conv.metaChannel === "IG";
    case "FB":
      return conv.channel === "FB" || conv.metaChannel === "FB";
    case "All":
    default:
      return true;
  }
}

export function getInboxBucketCounts(
  conversations: ReadonlyArray<InboxConversationLike>
): InboxBucketCounts {
  let main = 0;
  let done = 0;
  let archived = 0;

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    if (isConversationArchived(conv)) {
      archived += 1;
    } else if (isConversationDone(conv)) {
      done += 1;
    } else {
      main += 1;
    }
  }

  return { main, done, archived };
}

export function getFilterBucketTotal(counts: InboxBucketCounts, filter: InboxFilter): number {
  if (filter === "DONE") return counts.done;
  if (filter === "Archived") return counts.archived;
  return counts.main;
}

/**
 * Computes the sidebar Inbox unread badge count, excluding Archived and DONE conversations.
 */
export function computeInboxUnreadBadge(
  conversations: ReadonlyArray<InboxConversationLike>
): number {
  let total = 0;
  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    if (!isConversationInMainInbox(conv)) continue;
    const unread = Number(conv.unreadCount) || 0;
    if (unread > 0) {
      total += unread;
    }
  }
  return total;
}

export function buildMarkAsDonePatch(
  actorName?: string | null,
  nowIso: string = new Date().toISOString()
): Record<string, unknown> {
  return {
    isDone: true,
    doneAt: nowIso,
    doneBy: (actorName || "").trim(),
    isArchived: false,
    archivedAt: null,
    archivedBy: "",
  };
}

export function buildReopenDonePatch(): Record<string, unknown> {
  return {
    isDone: false,
    doneAt: null,
    doneBy: "",
  };
}

export function buildArchivePatch(
  actorName?: string | null,
  nowIso: string = new Date().toISOString()
): Record<string, unknown> {
  return {
    isArchived: true,
    archivedAt: nowIso,
    archivedBy: (actorName || "").trim(),
    isDone: false,
    doneAt: null,
    doneBy: "",
  };
}

export function buildUnarchivePatch(): Record<string, unknown> {
  return {
    isArchived: false,
    archivedAt: null,
    archivedBy: "",
  };
}

