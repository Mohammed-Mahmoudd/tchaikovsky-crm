import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFunnelAuditReport,
  clampRatePct,
  collectLoggedMessageKeys,
  getAttendedTime,
  getBookedTime,
  getConvertedTime,
  getCreatedTimeSource,
  isAttendedLead,
  isBookedLead,
  isConvertedLead,
  isMessageAlreadyInActivityLog,
  isRealAssignedAgent,
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
      // 5. Enrolled with 0 EGP recorded (Mariam)
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
      // 8. Excluded: Created before period, booked during period (Mariam)
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
    ];

    const bookedReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "booked" },
      selectedAgent: "__all__",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });

    // Cohort: c1..c6 = 6 assigned leads in period; c1..c5 = 5 booked
    assert.equal(bookedReport.cohortLeadsCount, 6);
    assert.equal(bookedReport.totalCount, 5);
    assert.equal(
      bookedReport.reasonBuckets.reduce((sum, b) => sum + b.count, 0),
      bookedReport.totalCount
    );
    assert.equal(
      bookedReport.agentBreakdown.reduce((sum, a) => sum + a.count, 0),
      bookedReport.totalCount
    );

    const bucketByKey = Object.fromEntries(bookedReport.reasonBuckets.map((b) => [b.key, b]));
    assert.equal(bucketByKey.stage_booked.count, 1); // c1
    assert.equal(bucketByKey.progressed_attended.count, 1); // c2
    assert.equal(bucketByKey.progressed_enrolled.count, 2); // c3, c5
    assert.equal(bucketByKey.audition_date_other.count, 1); // c4

    // Excluded cross-checks: c7 (unassigned) + c8 (created before period, booked in period)
    assert.equal(bookedReport.excludedRows.length, 2);
    assert.deepEqual(
      bookedReport.excludedRows.map((r) => r.excludedReason).sort(),
      ["outside_period_created", "unassigned"]
    );

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
    const attBuckets = Object.fromEntries(attendedReport.reasonBuckets.map((b) => [b.key, b]));
    assert.equal(attBuckets.outcome_attended.count, 1); // c2
    assert.equal(attBuckets.enrolled_rollup.count, 1); // c3 direct payment in Contacted
    assert.equal(attBuckets.progressed_enrolled.count, 1); // c5

    // Cash audit reconciles totalCash and highlights 0 EGP enrolled leads
    const cashReport = buildFunnelAuditReport(sampleConversations, {
      target: { metric: "cash" },
      selectedAgent: "__all__",
      filterMode: "week",
      periodStartMs: startMs,
      periodEndMs: endMs,
      periodDescription: "Nov 7 – Nov 13, 2026",
    });
    assert.equal(cashReport.totalCash, 2500);
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

  it("surfaces reassigned_actor cross-checks when auditing a single agent", () => {
    const report = buildFunnelAuditReport(
      [
        {
          id: "r1",
          name: "Reassigned Lead",
          agent: "Youssef",
          bookedBy: "Mariam",
          pipeline: "Audition Booked",
          auditionDate: "2026-11-12",
          createdAt: "2026-11-10T10:00:00Z",
        },
      ],
      {
        target: { metric: "booked" },
        selectedAgent: "Mariam",
        filterMode: "all",
        periodStartMs: 0,
        periodEndMs: 0,
        periodDescription: "All Time",
      }
    );

    assert.equal(report.totalCount, 0);
    assert.equal(report.excludedRows.length, 1);
    assert.equal(report.excludedRows[0].excludedReason, "reassigned_actor");
    assert.equal(report.excludedRows[0].assignedAgent, "Youssef");
    assert.equal(report.excludedRows[0].actorName, "Mariam");
  });
});

