import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  activateTeamAuditRestoreFromDraft,
  formatAuditReturnLabel,
  getAuditTargetKey,
  getMemoryTeamSnapshot,
  markTeamSidebarNavigation,
  resetTeamAuditTestState,
  resolveLeadSourceRoute,
  saveTeamActivitiesSnapshot,
  updateTeamActivitiesDraft,
  wasTeamSidebarNavigation,
} from "./teamAuditNav.ts";

describe("teamAuditNav", () => {
  beforeEach(() => {
    resetTeamAuditTestState();
  });

  it("routes booked and attended leads with audition records to /auditions", () => {
    const bookedWithDate = resolveLeadSourceRoute({
      id: "conv-1",
      metric: "booked",
      pipeline: "Audition Booked",
      auditionDate: "2026-11-10",
    });
    assert.equal(bookedWithDate.target, "auditions");
    assert.equal(
      bookedWithDate.href,
      "/auditions?id=conv-1&date=2026-11-10&from=team-performance"
    );

    const attendedWithoutDate = resolveLeadSourceRoute({
      id: "conv-2",
      metric: "attended",
      pipeline: "Attended",
      auditionOutcome: "schedule-followup",
    });
    assert.equal(attendedWithoutDate.target, "auditions");
    assert.equal(attendedWithoutDate.href, "/auditions?id=conv-2&from=team-performance");
  });

  it("routes non-audition leads, enrolled, cash, and explicit pipeline targets to /pipeline", () => {
    const enrolled = resolveLeadSourceRoute({
      id: "conv-3",
      metric: "enrolled",
      pipeline: "Enrolled",
      auditionDate: "2026-11-05",
    });
    assert.equal(enrolled.target, "pipeline");
    assert.equal(enrolled.href, "/pipeline?id=conv-3&from=team-performance");

    const forcedPipeline = resolveLeadSourceRoute({
      id: "conv-4",
      metric: "booked",
      pipeline: "Audition Booked",
      auditionDate: "2026-11-12",
      preferredTarget: "pipeline",
    });
    assert.equal(forcedPipeline.target, "pipeline");
    assert.equal(forcedPipeline.href, "/pipeline?id=conv-4&from=team-performance");

    const forcedAuditions = resolveLeadSourceRoute({
      id: "conv-5",
      metric: "cash",
      pipeline: "Enrolled",
      auditionDate: "2026-11-02",
      preferredTarget: "auditions",
    });
    assert.equal(forcedAuditions.target, "auditions");
    assert.equal(
      forcedAuditions.href,
      "/auditions?id=conv-5&date=2026-11-02&from=team-performance"
    );
  });

  it("preserves and restores Team Activities + Funnel Audit snapshot synchronously across drilldowns", () => {
    saveTeamActivitiesSnapshot({
      restoreActive: true,
      cameInSameSpaSession: true,
      returnLabel: formatAuditReturnLabel({ metric: "booked" }),
      urlAgentAtSave: "",
      filterMode: "week",
      currentDateIso: "2026-11-14",
      customStartDate: "2026-11-08",
      customEndDate: "2026-11-14",
      userPickedAgent: { agent: "Mai", urlAtPick: "" },
      mainTab: "funnel",
      feedViewStyle: "timeline",
      activitySearch: "",
      agentSearch: "",
      agentRoleFilter: "all",
      visibleTimelineCount: 50,
      visibleLeadsCount: 50,
      scrollTop: 420,
      auditTarget: { metric: "booked", agentName: "Mai" },
      auditModal: {
        targetKey: getAuditTargetKey({ metric: "booked", agentName: "Mai" }),
        viewMode: "included",
        reasonFilter: "progressed_attended",
        agentFilter: "all",
        excludedReasonFilter: "all",
        searchQuery: "salma",
        sortBy: "newest",
        visibleCount: 100,
        showFormula: true,
        mobileBreakdownOpen: false,
        drawerChatId: null,
        showChatDetails: false,
        workspaceScrollTop: 310,
        sidebarScrollTop: 80,
        mobileOuterScrollTop: 0,
      },
    });

    const restored = getMemoryTeamSnapshot("");
    assert.ok(restored);
    assert.equal(restored.mainTab, "funnel");
    assert.equal(restored.scrollTop, 420);
    assert.equal(restored.auditTarget?.metric, "booked");
    assert.equal(restored.auditModal?.reasonFilter, "progressed_attended");
    assert.equal(restored.auditModal?.workspaceScrollTop, 310);

    // Different explicit agent URL param bypasses mismatched agent snapshot
    assert.equal(getMemoryTeamSnapshot("Jwana"), null);

    // Explicit Sidebar navigation clears restore state
    markTeamSidebarNavigation();
    assert.equal(wasTeamSidebarNavigation(), true);
    assert.equal(getMemoryTeamSnapshot(""), null);
  });

  it("can activate restore from live draft when navigating out via drawer links", () => {
    updateTeamActivitiesDraft({
      returnLabel: "Back to Funnel Audit (Cash In)",
      urlAgentAtSave: "",
      filterMode: "all",
      currentDateIso: "2026-11-14",
      customStartDate: "2026-11-08",
      customEndDate: "2026-11-14",
      userPickedAgent: null,
      mainTab: "funnel",
      feedViewStyle: "timeline",
      activitySearch: "",
      agentSearch: "",
      agentRoleFilter: "all",
      visibleTimelineCount: 50,
      visibleLeadsCount: 50,
      scrollTop: 0,
      auditTarget: { metric: "cash" },
      auditModal: null,
      leadsDrawerChatId: "conv-99",
      leadsShowChatDetails: true,
    });

    assert.equal(getMemoryTeamSnapshot(""), null);
    activateTeamAuditRestoreFromDraft();
    const restored = getMemoryTeamSnapshot("");
    assert.ok(restored);
    assert.equal(restored.auditTarget?.metric, "cash");
    assert.equal(restored.leadsDrawerChatId, "conv-99");
    assert.equal(restored.leadsShowChatDetails, true);
  });
});

