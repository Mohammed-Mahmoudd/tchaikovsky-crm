import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAssignedLeadsAgentPool,
  buildFunnelAuditReport,
  buildSettingsStaffLookup,
  clampRatePct,
  collectLoggedMessageKeys,
  computeTeamFunnelSummary,
  getAttendedTime,
  getBookedTime,
  getConvertedTime,
  getCreatedTimeSource,
  isAttendedLead,
  isBookedLead,
  isConvertedLead,
  isMessageAlreadyInActivityLog,
  isRealAssignedAgent,
  matchesAssignedLeadAgentFilter,
} from "./teamMetrics.ts";

describe("teamMetrics", () => {
  it("excludes no-show and joining-later from attended leads", () => {
    assert.equal(isAttendedLead({ pipeline: "Lost", auditionDate: "2026-11-01", auditionOutcome: "no-show" }), false);
    assert.equal(isAttendedLead({ pipeline: "Joining Later", auditionOutcome: "joining-later" }), false);
    assert.equal(isAttendedLead({ pipeline: "Audition Booked", auditionOutcome: "booked" }), false);

    assert.equal(isAttendedLead({ pipeline: "Attended", auditionOutcome: "schedule-followup" }), true);
    assert.equal(isAttendedLead({ pipeline: "Audition Booked", auditionOutcome: "paid-trial" }), true);
    assert.equal(isAttendedLead({ pipeline: "Enrolled", auditionOutcome: "registered", cashIn: 2500 }), true);
  });

  it("recognizes booked and converted leads consistently", () => {
    // No-show with auditionDate still counts as having booked an audition, not attended
    const noShow = { pipeline: "Lost", auditionDate: "2026-11-05", auditionOutcome: "no-show" };
    assert.equal(isBookedLead(noShow), true);
    assert.equal(isAttendedLead(noShow), false);
    assert.equal(isConvertedLead(noShow), false);

    // Joining Later without auditionDate is neither booked nor attended
    const later = { pipeline: "Joining Later", auditionOutcome: "joining-later" };
    assert.equal(isBookedLead(later), false);
    assert.equal(isAttendedLead(later), false);

    // Walk-in / direct tuition payment
    const paidDirect = { pipeline: "Contacted", cashIn: 1800 };
    assert.equal(isConvertedLead(paidDirect), true);
  });

  it("uses explicit or activityLog timestamps before updatedAt fallbacks", () => {
    const bookedAt = new Date("2026-11-02T10:00:00Z").getTime();
    const convAt = new Date("2026-11-04T15:00:00Z").getTime();
    const laterEdit = "2026-11-12T12:00:00Z";

    const conv = {
      pipeline: "Enrolled",
      auditionOutcome: "registered",
      cashIn: 2000,
      createdAt: "2026-11-01T09:00:00Z",
      updatedAt: laterEdit,
      activityLog: [
        { id: "a1", type: "audition_booked", timestamp: bookedAt },
        { id: "a2", type: "audition_outcome", toValue: "registered", timestamp: convAt },
        { id: "a3", type: "cash_recorded", toValue: "2000", timestamp: convAt + 5000 },
      ],
    };

    assert.equal(getBookedTime(conv), bookedAt);
    assert.equal(getAttendedTime(conv), convAt);
    assert.equal(getConvertedTime(conv), convAt);
  });

  it("clamps funnel rates between 0 and 100 and returns 0 on zero denominator", () => {
    assert.equal(clampRatePct(2, 0), 0);
    assert.equal(clampRatePct(0, 10), 0);
    assert.equal(clampRatePct(5, 2), 100);
    assert.equal(clampRatePct(3, 6), 50);
  });

  it("deduplicates loaded messages against activityLog without dropping same-ms attachments", () => {
    const logged = collectLoggedMessageKeys([
      { id: "msg_wamid.1", type: "message_sent", timestamp: 1000 },
      { id: "msg_2000", type: "message_sent", timestamp: 2000 },
      { id: "msg_local_1", type: "message_sent", timestamp: 3000 },
    ]);

    assert.equal(isMessageAlreadyInActivityLog({ id: "wamid.1", timestamp: 1000 }, logged), true);
    // Second attachment in the same 3000ms batch with a distinct local ID is NOT treated as duplicate
    assert.equal(isMessageAlreadyInActivityLog({ id: "local_1", timestamp: 3000 }, logged), true);
    assert.equal(isMessageAlreadyInActivityLog({ id: "local_2", timestamp: 3000 }, logged), false);
    // Numeric timestamp-only fallback still matches matching timestamp
    assert.equal(isMessageAlreadyInActivityLog({ id: "unmatched", timestamp: 2000 }, logged), true);
    assert.equal(isMessageAlreadyInActivityLog({ id: "older_id", timestamp: 500 }, logged), false);
  });

  it("identifies real assigned agents and createdAt fallback sources", () => {
    assert.equal(isRealAssignedAgent("Mariam"), true);
    assert.equal(isRealAssignedAgent("Unassigned"), false);
    assert.equal(isRealAssignedAgent("Staff"), false);
    assert.equal(isRealAssignedAgent("System"), false);
    assert.equal(isRealAssignedAgent(""), false);

    assert.equal(getCreatedTimeSource({ createdAt: "2026-11-10T10:00:00Z" }), "createdAt");
    assert.equal(getCreatedTimeSource({ lastMessageAt: 1700000000000 }), "lastMessageAt");
    assert.equal(getCreatedTimeSource({ updatedAt: "2026-11-10T10:00:00Z" }), "updatedAt");
    assert.equal(getCreatedTimeSource({}), "unknown");
  });

  it("reconciles booked, attended, enrolled, and cash audits with mutually exclusive reason buckets", () => {
    const startMs = new Date("2026-11-07T00:00:00Z").getTime();
    const endMs = new Date("2026-11-13T23:59:59Z").getTime();

    const sampleConversations = [
      // 1. Currently Audition Booked (Mariam)
      {
        id: "c1",
        name: "Lead Booked",
        agent: "Mariam",
        channel: "WA",
        pipeline: "Audition Booked",
        auditionDate: "2026-11-12",
        createdAt: "2026-11-08T10:00:00Z",
        auditionBookedAt: "2026-11-09T11:00:00Z",
      },
      // 2. Progressed to Attended via outcome (Mariam)
      {
        id: "c2",
        name: "Lead Attended Trial",
        agent: "Mariam",
        channel: "IG",
        pipeline: "Audition Booked",
        auditionDate: "2026-11-10",
        auditionOutcome: "paid-trial",
        createdAt: "2026-11-08T12:00:00Z",
      },
      // 3. Direct payment walk-in without audition date (Youssef) -> rolls up into enrolled, attended, booked
      {
        id: "c3",
        name: "Walk-in Paid",
        agent: "Youssef",
        enrolledBy: "Youssef",
        channel: "WA",
        pipeline: "Contacted",
        cashIn: 2500,
        createdAt: "2026-11-09T09:00:00Z",
        paidAt: "2026-11-10T14:00:00Z",
      },
      // 4. No-show with auditionDate -> counted in booked, excluded from attended/enrolled (Youssef)
      {
        id: "c4",
        name: "No Show Lead",
        agent: "Youssef",
        channel: "FB",
        pipeline: "Lost",
        auditionDate: "2026-11-11",
        auditionOutcome: "no-show",
        createdAt: "2026-11-09T15:00:00Z",
      },
      // 5. Enrolled with 0 SAR recorded (Mariam)
      {
        id: "c5",
        name: "Enrolled Unpaid",
        agent: "Mariam",
        channel: "WA",
        pipeline: "Enrolled",
        auditionDate: "2026-11-10",
        cashIn: 0,
        createdAt: "2026-11-10T08:00:00Z",
      },
      // 6. Plain New lead (not booked) (Mariam)
      {
        id: "c6",
        name: "New Inquiry",
        agent: "Mariam",
        channel: "WA",
        pipeline: "New",
        unreadCount: 2,
        createdAt: "2026-11-10T09:00:00Z",
      },
      // 7. Excluded: Unassigned booked lead in period
      {
        id: "c7",
        name: "Unassigned Booked",
        agent: "Unassigned",
        channel: "WA",
        pipeline: "Audition Booked",
        auditionDate: "2026-11-12",
        createdAt: "2026-11-10T10:00:00Z",
        auditionBookedAt: "2026-11-10T11:00:00Z",
      },
      // 8. Created before period, booked during period by Youssef (assigned to Mariam)
      {
        id: "c8",
        name: "Older Lead Booked Now",
        agent: "Mariam",
        bookedBy: "Youssef",
        channel: "WA",
        pipeline: "Audition Booked",
        auditionDate: "2026-11-12",
        createdAt: "2026-10-20T10:00:00Z",
        auditionBookedAt: "2026-11-11T10:00:00Z",
      },
      // 9. Unassigned lead booked by Mariam during period -> credited to Mariam
      {
        id: "c9",
        name: "Unassigned Owner Booked By Staff",
        agent: "Unassigned",
        bookedBy: "Mariam",
        channel: "WA",
        pipeline: "Audition Booked",
        auditionDate: "2026-11-12",
        createdAt: "2026-10-25T10:00:00Z",
        auditionBookedAt: "2026-11-11T12:00:00Z",
      },
    ];

    const summary = computeTeamFunnelSummary(sampleConversations, {
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
    });

    const bookedReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "booked" },
      selectedAgent: "__all__",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });

    // Leads: c1..c6 = 6 assigned leads created in period
    // Booked: c1..c5 + c8 (older lead booked in period) + c9 (booked by Mariam) = 7 booked
    assert.equal(bookedReport.cohortLeadsCount, 6);
    assert.equal(bookedReport.totalCount, 7);
    assert.equal(summary.team.leads, bookedReport.cohortLeadsCount);
    assert.equal(summary.team.booked, bookedReport.totalCount);
    assert.equal(
      bookedReport.reasonBuckets.reduce((sum, b) => sum + b.count, 0),
      bookedReport.totalCount
    );
    assert.equal(
      bookedReport.agentBreakdown.reduce((sum, a) => sum + a.count, 0),
      bookedReport.totalCount
    );

    const bucketByKey = Object.fromEntries(bookedReport.reasonBuckets.map((b) => [b.key, b]));
    assert.equal(bucketByKey.stage_booked.count, 3); // c1, c8, c9
    assert.equal(bucketByKey.progressed_attended.count, 1); // c2
    assert.equal(bucketByKey.progressed_enrolled.count, 2); // c3, c5
    assert.equal(bucketByKey.audition_date_other.count, 1); // c4

    // Excluded cross-checks: c7 (unassigned lead with no bookedBy actor)
    assert.equal(bookedReport.excludedRows.length, 1);
    assert.equal(bookedReport.excludedRows[0].id, "c7");
    assert.equal(bookedReport.excludedRows[0].excludedReason, "unassigned");

    // Youssef booked c3, c4, and c8 (which is assigned to Mariam) -> 3 booked for Youssef
    assert.equal(summary.byAgent.get("youssef")?.booked, 3);
    assert.equal(summary.byAgent.get("mariam")?.booked, 4); // c1, c2, c5, c9

    // Attended audit catches direct payment roll-up on c3
    const attendedReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "attended" },
      selectedAgent: "__all__",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });
    assert.equal(attendedReport.totalCount, 3); // c2, c3, c5
    assert.equal(summary.team.attended, attendedReport.totalCount);
    const attBuckets = Object.fromEntries(attendedReport.reasonBuckets.map((b) => [b.key, b]));
    assert.equal(attBuckets.outcome_attended.count, 1); // c2
    assert.equal(attBuckets.enrolled_rollup.count, 1); // c3 direct payment in Contacted
    assert.equal(attBuckets.progressed_enrolled.count, 1); // c5

    // Cash audit reconciles totalCash and highlights 0 SAR enrolled leads
    const cashReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "cash" },
      selectedAgent: "__all__",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });
    assert.equal(cashReport.totalCash, 2500);
    assert.equal(summary.team.cash, cashReport.totalCash);
    assert.equal(cashReport.totalCount, 1);
    assert.equal(cashReport.paidCount, 1);
    assert.equal(cashReport.unpaidEnrolledCount, 1);
    assert.equal(
      cashReport.reasonBuckets.reduce((sum, b) => sum + b.cashTotal, 0),
      cashReport.totalCash
    );

    // Stage and Channel audits match exact cohort subset
    const waReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "channel", channel: "WhatsApp" },
      selectedAgent: "__all__",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });
    assert.equal(waReport.totalCount, 4); // c1, c3, c5, c6

    const waitingReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "awaiting_reply" },
      selectedAgent: "Mariam",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });
    assert.equal(waitingReport.totalCount, 1); // c6
  });

  it("credits acting staff member and surfaces reassigned_actor cross-check on assigned owner", () => {
    const convs = [
      {
        id: "r1",
        name: "Reassigned Lead",
        agent: "Youssef",
        bookedBy: "Mariam",
        pipeline: "Audition Booked",
        auditionDate: "2026-11-12",
        createdAt: "2026-11-10T10:00:00Z",
        auditionBookedAt: "2026-11-11T10:00:00Z",
      },
    ];

    const mariamReport = buildFunnelAuditReport(convs, {
      target: { metric: "booked" },
      selectedAgent: "Mariam",
      filterMode: "all",
      periodStartMs: 0,
      periodEndMs: 0,
      periodDescription: "All Time",
    });
    assert.equal(mariamReport.totalCount, 1);
    assert.equal(mariamReport.rows[0].attributedAgent, "Mariam");
    assert.equal(mariamReport.rows[0].assignedAgent, "Youssef");

    const youssefReport = buildFunnelAuditReport(convs, {
      target: { metric: "booked" },
      selectedAgent: "Youssef",
      filterMode: "all",
      periodStartMs: 0,
      periodEndMs: 0,
      periodDescription: "All Time",
    });
    assert.equal(youssefReport.totalCount, 0);
    assert.equal(youssefReport.excludedRows.length, 1);
    assert.equal(youssefReport.excludedRows[0].excludedReason, "reassigned_actor");
    assert.equal(youssefReport.excludedRows[0].assignedAgent, "Youssef");
    assert.equal(youssefReport.excludedRows[0].actorName, "Mariam");
  });

  it("uses milestone timestamps for walk-in conversions without audition dates", () => {
    const enrolledAt = "2026-11-17T12:00:00Z";
    const walkIn = {
      id: "w1",
      name: "Walk-in Enrolled",
      agent: "Nourhan",
      enrolledBy: "Nourhan",
      pipeline: "Enrolled",
      cashIn: 3000,
      createdAt: "2026-11-01T10:00:00Z",
      enrolledAt,
    };
    assert.equal(getBookedTime(walkIn), new Date(enrolledAt).getTime());

    const startToday = new Date("2026-11-17T00:00:00Z").getTime();
    const endToday = new Date("2026-11-17T23:59:59Z").getTime();
    const summary = computeTeamFunnelSummary([walkIn], {
      filterMode: "day",
      periodStartMs: startToday,
      periodEndMs: endToday,
    });
    assert.equal(summary.team.leads, 0);
    assert.equal(summary.team.booked, 1);
    assert.equal(summary.team.attended, 1);
    assert.equal(summary.team.enrolled, 1);
    assert.equal(summary.team.cash, 3000);
  });

  it("builds sorted Assigned Leads agent dropdown options from Settings agents only and filters by agent", () => {
    const pool = buildAssignedLeadsAgentPool(
      ["mariam", "Unassigned", "Youssef", "Staff", "Mariam", "System", "Meta Account (Test)", "Sara"],
      ["Mai", "Mariam", "Youssef"]
    );

    assert.equal(pool.total, 5);
    assert.deepEqual(pool.options, [
      { name: "Mariam", count: 2 },
      { name: "Youssef", count: 1 },
      { name: "Mai", count: 0 },
    ]);

    // Matching excludes placeholder owners and compares real agents case-insensitively
    assert.equal(matchesAssignedLeadAgentFilter("Unassigned", "all"), false);
    assert.equal(matchesAssignedLeadAgentFilter("Staff", "all"), false);
    assert.equal(matchesAssignedLeadAgentFilter("System", "all"), false);
    assert.equal(matchesAssignedLeadAgentFilter("Mariam", "all"), true);
    assert.equal(matchesAssignedLeadAgentFilter(" mariam ", "Mariam"), true);
    assert.equal(matchesAssignedLeadAgentFilter("Youssef", "Mariam"), false);

    const settingsLookup = buildSettingsStaffLookup([
      { name: " Mariam ", role: "admission_officer" },
      { name: "Inactive", role: "admission_officer", active: false },
      { name: "Staff", role: "admission_officer" },
    ]);
    assert.equal(settingsLookup.has("mariam"), true);
    assert.equal(settingsLookup.get("mariam")?.name, "Mariam");
    assert.equal(settingsLookup.has("sara"), false);
    assert.equal(settingsLookup.has("inactive"), false);

    const withDeactivated = buildSettingsStaffLookup(
      [
        { name: " Mariam ", role: "admission_officer" },
        { name: "Old Agent", role: "admission_officer", active: false },
      ],
      { includeInactive: true }
    );
    assert.equal(withDeactivated.has("old agent"), true);
    assert.equal(withDeactivated.get("old agent")?.active, false);
    assert.equal(withDeactivated.has("sara"), false);
  });

  it("credits multiple cash payments per lead to each recording agent in their payment period, never assigned owner", () => {
    const startMs = new Date("2026-11-10T00:00:00Z").getTime();
    const endMs = new Date("2026-11-20T23:59:59Z").getTime();

    const leads = [
      // Lead owned by Mariam, enrolled by Youssef, with 2 payments by Youssef & Nourhan (plus 1 voided & 1 out-of-period)
      {
        id: "m1",
        name: "Multi Cash Lead",
        agent: "Mariam",
        enrolledBy: "Youssef",
        pipeline: "Enrolled",
        createdAt: "2026-11-01T10:00:00Z",
        enrolledAt: "2026-11-12T10:00:00Z",
        cashIn: 2500,
        cashEntries: [
          {
            id: "ce1",
            amount: 1000,
            recordedBy: "Youssef",
            recordedAt: new Date("2026-11-11T10:00:00Z").getTime(),
            note: "Deposit",
            isVoided: false,
          },
          {
            id: "ce2",
            amount: 1500,
            recordedBy: "Nourhan",
            recordedAt: new Date("2026-11-15T10:00:00Z").getTime(),
            note: "Remaining balance",
            isVoided: false,
          },
          {
            id: "ce_void",
            amount: 999,
            recordedBy: "Mariam",
            recordedAt: new Date("2026-11-16T10:00:00Z").getTime(),
            isVoided: true,
          },
          {
            id: "ce_old",
            amount: 400,
            recordedBy: "Mariam",
            recordedAt: new Date("2026-11-02T10:00:00Z").getTime(),
            isVoided: false,
          },
        ],
      },
      // Legacy lead with enrolledBy fallback -> credits Omar, not Mariam
      {
        id: "m2",
        name: "Legacy EnrolledBy Lead",
        agent: "Mariam",
        enrolledBy: "Omar",
        pipeline: "Enrolled",
        createdAt: "2026-11-01T10:00:00Z",
        paidAt: "2026-11-13T10:00:00Z",
        cashIn: 800,
      },
      // Legacy lead with NO cashRecordedBy, NO activityLog, NO enrolledBy -> excluded as unattributed, NOT credited to Mariam
      {
        id: "m3",
        name: "Unattributed Legacy Cash",
        agent: "Mariam",
        pipeline: "Enrolled",
        createdAt: "2026-11-01T10:00:00Z",
        paidAt: "2026-11-14T10:00:00Z",
        cashIn: 600,
      },
    ];

    const summary = computeTeamFunnelSummary(leads, {
      filterMode: "range",
      periodStartMs: startMs,
      periodEndMs: endMs,
    });

    assert.equal(summary.team.enrolled, 3); // m1 (Youssef), m2 (Omar), m3 (fallback Mariam for enrolled)
    assert.equal(summary.team.cash, 3300); // 1000 + 1500 + 800 (m3 cash unattributed -> excluded!)
    assert.equal(summary.byAgent.get("youssef")?.cash, 1000);
    assert.equal(summary.byAgent.get("nourhan")?.cash, 1500);
    assert.equal(summary.byAgent.get("omar")?.cash, 800);
    assert.equal(summary.byAgent.get("mariam")?.cash || 0, 0);

    const allCashAudit = buildFunnelAuditReport(leads, {
      target: { metric: "cash" },
      selectedAgent: "__all__",
      filterMode: "range",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 10 – Nov 20, 2026",
    });
    assert.equal(allCashAudit.totalCount, 3);
    assert.equal(allCashAudit.totalCash, 3300);
    assert.equal(allCashAudit.excludedRows.length, 1);
    assert.equal(allCashAudit.excludedRows[0].id, "m3");
    assert.equal(allCashAudit.excludedRows[0].excludedReason, "unassigned");

    // Viewing Mariam (lead owner) shows reassigned_actor exclusions for Youssef, Nourhan, Omar
    const mariamAudit = buildFunnelAuditReport(leads, {
      target: { metric: "cash" },
      selectedAgent: "Mariam",
      filterMode: "range",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 10 – Nov 20, 2026",
    });
    assert.equal(mariamAudit.totalCount, 0);
    assert.equal(mariamAudit.totalCash, 0);
    assert.equal(mariamAudit.excludedRows.length, 3);
    assert.ok(mariamAudit.excludedRows.every((r) => r.excludedReason === "reassigned_actor"));
  });
});

