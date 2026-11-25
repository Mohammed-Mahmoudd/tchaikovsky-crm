export type SidebarIconKey =
  | "inbox"
  | "operation-inbox"
  | "leads-management"
  | "auditions"
  | "pipeline"
  | "leads"
  | "reports"
  | "team-activities"
  | "follow-ups"
  | "agent"
  | "agent-overview"
  | "agent-leads"
  | "agent-studio"
  | "agent-follow-up"
  | "profile";

export type SidebarBadgeTone = "banner" | "amber" | "green" | "red" | "neutral";

export interface SidebarBadge {
  count: number;
  tone: SidebarBadgeTone;
  title?: string;
}

export interface SidebarBadgeCounts {
  inbox: number;
  operationInbox: number;
  leads: number;
  auditions: number;
  followUps: number;
}

export interface SidebarLeafItem {
  kind: "link";
  id: string;
  href: string;
  label: string;
  icon: SidebarIconKey;
  badge?: SidebarBadge;
  exact?: boolean;
  activePrefixes?: ReadonlyArray<string>;
  separatorBefore?: boolean;
}

export interface SidebarGroupItem {
  kind: "group";
  id: string;
  label: string;
  icon: SidebarIconKey;
  children: SidebarLeafItem[];
  collapsedBadge?: SidebarBadge;
}

export type SidebarNavEntry = SidebarLeafItem | SidebarGroupItem;

export interface SidebarGroupToggleEntry {
  open: boolean;
  /** Route path where an active group was manually collapsed; cleared when arriving at another route. */
  collapsedOnPath: string | null;
}

export type SidebarGroupToggleMap = Record<string, SidebarGroupToggleEntry>;

interface CandidateChild {
  id: string;
  href: string;
  label: string;
  standaloneLabel: string;
  icon: SidebarIconKey;
  badge?: SidebarBadge;
  exact?: boolean;
  activePrefixes?: ReadonlyArray<string>;
  separatorBefore?: boolean;
}

function buildPositiveBadge(
  count: number,
  tone: SidebarBadgeTone,
  title?: string
): SidebarBadge | undefined {
  if (!Number.isFinite(count) || count <= 0) return undefined;
  return { count, tone, title };
}

function formatSummaryTitle(parts: Array<{ count: number; singular: string; plural: string }>): string {
  return parts
    .filter((p) => p.count > 0)
    .map((p) => `${p.count} ${p.count === 1 ? p.singular : p.plural}`)
    .join(" · ");
}

function resolveGroupOrLeaf({
  id,
  label,
  icon,
  candidates,
  canAccess,
  collapsedBadge,
}: {
  id: string;
  label: string;
  icon: SidebarIconKey;
  candidates: CandidateChild[];
  canAccess: (href: string) => boolean;
  collapsedBadge?: SidebarBadge;
}): SidebarNavEntry | null {
  const accessible = candidates.filter((item) => canAccess(item.href));
  if (accessible.length === 0) return null;

  if (accessible.length === 1) {
    const single = accessible[0];
    return {
      kind: "link",
      id: single.id,
      href: single.href,
      label: single.standaloneLabel,
      icon: single.icon,
      badge: single.badge,
      exact: single.exact,
      activePrefixes: single.activePrefixes,
    };
  }

  return {
    kind: "group",
    id,
    label,
    icon,
    children: accessible.map((child) => ({
      kind: "link",
      id: child.id,
      href: child.href,
      label: child.label,
      icon: child.icon,
      badge: child.badge,
      exact: child.exact,
      activePrefixes: child.activePrefixes,
      separatorBefore: child.separatorBefore,
    })),
    collapsedBadge,
  };
}

/** Returns true if the given pathname matches a sidebar route or nested sub-route. */
export function isSidebarRouteActive(
  pathname: string,
  href: string,
  options?: { exact?: boolean; activePrefixes?: ReadonlyArray<string> }
): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";

  const matchesExactOrNested = options?.exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  if (matchesExactOrNested) return true;

  if (options?.activePrefixes?.length) {
    return options.activePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  }
  return false;
}

/** Returns true if any child inside a sidebar group matches the active pathname. */
export function isSidebarGroupActive(group: SidebarGroupItem, pathname: string): boolean {
  return group.children.some((child) =>
    isSidebarRouteActive(pathname, child.href, {
      exact: child.exact,
      activePrefixes: child.activePrefixes,
    })
  );
}

/**
 * Computes whether a dropdown group should render expanded.
 * Active groups open automatically when entering a route inside them while still
 * allowing the user to collapse them on the current route.
 */
export function isSidebarGroupExpanded({
  group,
  pathname,
  toggles,
}: {
  group: SidebarGroupItem;
  pathname: string;
  toggles: SidebarGroupToggleMap;
}): boolean {
  const hasActiveChild = isSidebarGroupActive(group, pathname);
  const override = toggles[group.id];

  if (hasActiveChild) {
    if (override && override.collapsedOnPath === pathname) {
      return override.open;
    }
    return true;
  }

  return override ? override.open : false;
}

/** Returns the updated group toggle map when a user clicks a dropdown group header. */
export function getNextSidebarGroupToggles({
  prev,
  groupId,
  currentlyOpen,
  hasActiveChild,
  pathname,
}: {
  prev: SidebarGroupToggleMap;
  groupId: string;
  currentlyOpen: boolean;
  hasActiveChild: boolean;
  pathname: string;
}): SidebarGroupToggleMap {
  const nextOpen = !currentlyOpen;
  return {
    ...prev,
    [groupId]: {
      open: nextOpen,
      collapsedOnPath: !nextOpen && hasActiveChild ? pathname : null,
    },
  };
}

/**
 * Builds the ordered sidebar navigation tree for the current user role.
 * Groups with 2+ accessible routes render as dropdown groups; single-route groups
 * collapse cleanly into direct top-level links.
 */
export function buildSidebarNav({
  canAccess,
  isChairman,
  badgeCounts,
}: {
  canAccess: (href: string) => boolean;
  isChairman: boolean;
  badgeCounts: SidebarBadgeCounts;
}): SidebarNavEntry[] {
  const entries: SidebarNavEntry[] = [];

  const inboxTotal = Math.max(0, badgeCounts.inbox) + Math.max(0, badgeCounts.operationInbox);
  const inboxEntry = resolveGroupOrLeaf({
    id: "inbox",
    label: "Inbox",
    icon: "inbox",
    canAccess,
    candidates: [
      {
        id: "inbox-admission",
        href: "/",
        label: "Admission",
        standaloneLabel: "Inbox",
        icon: "inbox",
        badge: buildPositiveBadge(badgeCounts.inbox, "banner"),
      },
      {
        id: "inbox-operation",
        href: "/operation-inbox",
        label: "Operation",
        standaloneLabel: "Operation Inbox",
        icon: "operation-inbox",
        badge: buildPositiveBadge(badgeCounts.operationInbox, "banner"),
      },
    ],
    collapsedBadge: buildPositiveBadge(
      inboxTotal,
      "banner",
      formatSummaryTitle([
        { count: badgeCounts.inbox, singular: "admission unread", plural: "admission unread" },
        { count: badgeCounts.operationInbox, singular: "operation unread", plural: "operation unread" },
      ])
    ),
  });
  if (inboxEntry) entries.push(inboxEntry);

  const leadsTotal =
    Math.max(0, badgeCounts.auditions) +
    Math.max(0, badgeCounts.leads) +
    Math.max(0, badgeCounts.followUps);
  const leadsManagementEntry = resolveGroupOrLeaf({
    id: "leads-management",
    label: "Leads Management",
    icon: "leads-management",
    canAccess,
    candidates: [
      {
        id: "auditions",
        href: "/auditions",
        label: "Auditions",
        standaloneLabel: "Auditions",
        icon: "auditions",
        badge: buildPositiveBadge(badgeCounts.auditions, "green"),
      },
      {
        id: "pipeline",
        href: "/pipeline",
        label: "Pipeline",
        standaloneLabel: "Pipeline",
        icon: "pipeline",
      },
      {
        id: "leads",
        href: "/leads",
        label: "Leads",
        standaloneLabel: "Leads",
        icon: "leads",
        badge: buildPositiveBadge(badgeCounts.leads, "amber"),
      },
      {
        id: "follow-ups",
        href: "/follow-ups",
        label: "Follow-ups",
        standaloneLabel: "Follow-ups",
        icon: "follow-ups",
        badge: buildPositiveBadge(badgeCounts.followUps, "red"),
      },
    ],
    collapsedBadge: buildPositiveBadge(
      leadsTotal,
      "neutral",
      formatSummaryTitle([
        { count: badgeCounts.auditions, singular: "booked audition", plural: "booked auditions" },
        { count: badgeCounts.leads, singular: "new lead", plural: "new leads" },
        { count: badgeCounts.followUps, singular: "follow-up", plural: "follow-ups" },
      ])
    ),
  });
  if (leadsManagementEntry) entries.push(leadsManagementEntry);

  const reportsEntry = resolveGroupOrLeaf({
    id: "reports",
    label: "Reports",
    icon: "reports",
    canAccess,
    candidates: [
      {
        id: "reports-overview",
        href: "/reports",
        label: "Report",
        standaloneLabel: "Reports",
        icon: "reports",
      },
      {
        id: "team-performance",
        href: "/team-performance",
        label: "Team Activities",
        standaloneLabel: "Team Activities",
        icon: "team-activities",
      },
    ],
  });
  if (reportsEntry) entries.push(reportsEntry);

  const agentEntry = resolveGroupOrLeaf({
    id: "agent",
    label: "Agent",
    icon: "agent",
    canAccess,
    candidates: [
      {
        id: "agent-overview",
        href: "/agent",
        label: "Overview",
        standaloneLabel: "Agent",
        icon: "agent-overview",
        exact: true,
        activePrefixes: ["/agent/activity", "/agent/sandbox"],
      },
      {
        id: "agent-leads",
        href: "/agent/leads",
        label: "Leads",
        standaloneLabel: "Agent Leads",
        icon: "agent-leads",
        activePrefixes: ["/claude-leads"],
      },
      {
        id: "agent-studio",
        href: "/agent/studio",
        label: "Studio",
        standaloneLabel: "Agent Studio",
        icon: "agent-studio",
        activePrefixes: ["/agent/skills"],
      },
      {
        id: "agent-follow-up",
        href: "/agent/follow-up",
        label: "Follow-up",
        standaloneLabel: "Agent Follow-up",
        icon: "agent-follow-up",
        separatorBefore: true,
      },
    ],
  });
  if (agentEntry) entries.push(agentEntry);

  if (!isChairman && canAccess("/profile")) {
    entries.push({
      kind: "link",
      id: "profile",
      href: "/profile",
      label: "Profile",
      icon: "profile",
    });
  }

  return entries;
}

