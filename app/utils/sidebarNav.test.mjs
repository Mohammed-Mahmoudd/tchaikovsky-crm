import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canAccessRoute, normalizeRole } from "./roles.ts";
import {
  buildSidebarNav,
  getNextSidebarGroupToggles,
  isSidebarGroupActive,
  isSidebarGroupExpanded,
  isSidebarRouteActive,
} from "./sidebarNav.ts";

const SAMPLE_BADGES = {
  inbox: 3,
  operationInbox: 2,
  leads: 4,
  auditions: 5,
  followUps: 1,
};

function buildForRole(role, badgeCounts = SAMPLE_BADGES) {
  return buildSidebarNav({
    canAccess: (href) => canAccessRoute(role, href),
    isChairman: normalizeRole(role) === "chairman",
    badgeCounts,
  });
}

describe("sidebarNav", () => {
  it("organizes Chairman navigation into Inbox, Leads Management (including Follow-ups last), Reports, and Agent dropdowns", () => {
    const entries = buildForRole("chairman");

    assert.deepEqual(
      entries.map((entry) =>
        entry.kind === "group"
          ? {
              kind: "group",
              id: entry.id,
              label: entry.label,
              children: entry.children.map((c) => ({ label: c.label, href: c.href })),
            }
          : { kind: "link", id: entry.id, label: entry.label, href: entry.href }
      ),
      [
        {
          kind: "group",
          id: "inbox",
          label: "Inbox",
          children: [
            { label: "Admission", href: "/" },
            { label: "Operation", href: "/operation-inbox" },
          ],
        },
        {
          kind: "group",
          id: "leads-management",
          label: "Leads Management",
          children: [
            { label: "Auditions", href: "/auditions" },
            { label: "Pipeline", href: "/pipeline" },
            { label: "Leads", href: "/leads" },
            { label: "Follow-ups", href: "/follow-ups" },
          ],
        },
        {
          kind: "group",
          id: "reports",
          label: "Reports",
          children: [
            { label: "Report", href: "/reports" },
            { label: "Team Activities", href: "/team-performance" },
          ],
        },
        {
          kind: "group",
          id: "agent",
          label: "Agent",
          children: [
            { label: "Overview", href: "/agent" },
            { label: "Leads", href: "/agent/leads" },
            { label: "Studio", href: "/agent/studio" },
          ],
        },
      ]
    );

    // Group collapsed summary badges aggregate child counts accurately
    assert.equal(entries[0].kind === "group" && entries[0].collapsedBadge?.count, 5);
    assert.equal(entries[1].kind === "group" && entries[1].collapsedBadge?.count, 10);
    assert.equal(entries[2].kind === "group" && entries[2].collapsedBadge, undefined);
    assert.equal(entries[3].kind === "group" && entries[3].collapsedBadge, undefined);
  });

  it("organizes Admission Officer with direct Inbox link, Leads Management dropdown, and Profile", () => {
    const entries = buildForRole("admission_officer");

    assert.deepEqual(
      entries.map((entry) =>
        entry.kind === "group"
          ? { group: entry.label, children: entry.children.map((c) => c.label) }
          : { link: entry.label, href: entry.href }
      ),
      [
        { link: "Inbox", href: "/" },
        { group: "Leads Management", children: ["Auditions", "Pipeline", "Leads", "Follow-ups"] },
        { link: "Profile", href: "/profile" },
      ]
    );
  });

  it("organizes Admission (Advanced) and Marketing with Inbox link, Leads Management dropdown, Reports dropdown, and Profile", () => {
    for (const role of ["admission_advanced", "marketing"]) {
      const entries = buildForRole(role);
      assert.deepEqual(
        entries.map((entry) =>
          entry.kind === "group"
            ? { group: entry.label, children: entry.children.map((c) => c.label) }
            : { link: entry.label, href: entry.href }
        ),
        [
          { link: "Inbox", href: "/" },
          { group: "Leads Management", children: ["Auditions", "Pipeline", "Leads", "Follow-ups"] },
          { group: "Reports", children: ["Report", "Team Activities"] },
          { link: "Profile", href: "/profile" },
        ],
        `Unexpected navigation structure for ${role}`
      );
    }
  });

  it("collapses single-item groups cleanly for Operation, Finance, and Enrollment Director", () => {
    assert.deepEqual(
      buildForRole("operation").map((e) => ({ kind: e.kind, label: e.label, href: e.kind === "link" ? e.href : null })),
      [
        { kind: "link", label: "Operation Inbox", href: "/operation-inbox" },
        { kind: "link", label: "Profile", href: "/profile" },
      ]
    );

    assert.deepEqual(
      buildForRole("finance").map((e) => ({ kind: e.kind, label: e.label, href: e.kind === "link" ? e.href : null })),
      [
        { kind: "link", label: "Pipeline", href: "/pipeline" },
        { kind: "link", label: "Reports", href: "/reports" },
        { kind: "link", label: "Profile", href: "/profile" },
      ]
    );

    assert.deepEqual(
      buildForRole("enrollment_director").map((e) => ({ kind: e.kind, label: e.label, href: e.kind === "link" ? e.href : null })),
      [
        { kind: "link", label: "Auditions", href: "/auditions" },
        { kind: "link", label: "Profile", href: "/profile" },
      ]
    );
  });

  it("omits zero-count badges cleanly", () => {
    const entries = buildForRole("chairman", {
      inbox: 0,
      operationInbox: 0,
      leads: 0,
      auditions: 0,
      followUps: 0,
    });
    assert.equal(entries[0].kind === "group" && entries[0].collapsedBadge, undefined);
    assert.equal(entries[1].kind === "group" && entries[1].collapsedBadge, undefined);
  });

  it("auto-expands active groups while allowing manual collapse on the current route and re-opening on navigation", () => {
    const entries = buildForRole("chairman");
    const inboxGroup = entries[0];
    const leadsGroup = entries[1];
    assert.equal(inboxGroup.kind, "group");
    assert.equal(leadsGroup.kind, "group");
    if (inboxGroup.kind !== "group" || leadsGroup.kind !== "group") return;

    assert.equal(isSidebarRouteActive("/", "/"), true);
    assert.equal(isSidebarRouteActive("/pipeline", "/"), false);
    assert.equal(isSidebarRouteActive("/operation-inbox/123", "/operation-inbox"), true);
    assert.equal(isSidebarRouteActive("/agent/activity", "/agent", { exact: true }), false);
    assert.equal(
      isSidebarRouteActive("/agent/activity", "/agent", {
        exact: true,
        activePrefixes: ["/agent/activity", "/agent/sandbox"],
      }),
      true
    );
    assert.equal(
      isSidebarRouteActive("/agent/sandbox", "/agent", {
        exact: true,
        activePrefixes: ["/agent/activity", "/agent/sandbox"],
      }),
      true
    );
    assert.equal(
      isSidebarRouteActive("/agent/leads", "/agent", {
        exact: true,
        activePrefixes: ["/agent/activity", "/agent/sandbox"],
      }),
      false
    );
    assert.equal(
      isSidebarRouteActive("/agent/skills", "/agent/studio", {
        activePrefixes: ["/agent/skills"],
      }),
      true
    );
    assert.equal(isSidebarRouteActive("/agent", "/agent", { exact: true }), true);
    assert.equal(
      isSidebarRouteActive("/claude-leads", "/agent/leads", { activePrefixes: ["/claude-leads"] }),
      true
    );
    assert.equal(isSidebarGroupActive(leadsGroup, "/pipeline"), true);
    assert.equal(isSidebarGroupActive(leadsGroup, "/"), false);

    const agentGroup = entries[3];
    assert.equal(agentGroup.kind, "group");
    if (agentGroup.kind === "group") {
      assert.equal(isSidebarGroupActive(agentGroup, "/claude-leads"), true);
    }

    // Default load on "/": active Inbox group is open, inactive Leads Management is closed
    let toggles = {};
    assert.equal(isSidebarGroupExpanded({ group: inboxGroup, pathname: "/", toggles }), true);
    assert.equal(isSidebarGroupExpanded({ group: leadsGroup, pathname: "/", toggles }), false);

    // User expands Leads Management on "/" and keeps it open
    toggles = getNextSidebarGroupToggles({
      prev: toggles,
      groupId: leadsGroup.id,
      currentlyOpen: false,
      hasActiveChild: false,
      pathname: "/",
    });
    assert.equal(isSidebarGroupExpanded({ group: leadsGroup, pathname: "/", toggles }), true);

    // User navigates to "/pipeline": Leads Management stays open, Inbox (not manually pinned) collapses
    assert.equal(isSidebarGroupExpanded({ group: leadsGroup, pathname: "/pipeline", toggles }), true);
    assert.equal(isSidebarGroupExpanded({ group: inboxGroup, pathname: "/pipeline", toggles }), false);

    // User collapses Leads Management while on "/pipeline"
    toggles = getNextSidebarGroupToggles({
      prev: toggles,
      groupId: leadsGroup.id,
      currentlyOpen: true,
      hasActiveChild: true,
      pathname: "/pipeline",
    });
    assert.equal(isSidebarGroupExpanded({ group: leadsGroup, pathname: "/pipeline", toggles }), false);

    // External navigation to "/auditions" automatically expands Leads Management again
    assert.equal(isSidebarGroupExpanded({ group: leadsGroup, pathname: "/auditions", toggles }), true);
  });
});

