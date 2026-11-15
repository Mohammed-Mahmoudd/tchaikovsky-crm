import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRemoveAuditionPatch,
  collectSlotLocalKeys,
  isAuditionDerivedFollowUp,
  isLiveAuditionConversation,
  omitRecordKeys,
  sanitizeAuditionActivityLog,
  sanitizeAuditionSource,
  stripAuditionNoShowTag,
} from "./auditionRemoval.ts";
import {
  getAttendedTime,
  getBookedTime,
  isAttendedLead,
  isBookedLead,
  isConvertedLead,
} from "./teamMetrics.ts";

describe("auditionRemoval", () => {
  it("collects deduplicated local cache keys and omits them with rollback snapshot", () => {
    assert.deepEqual(collectSlotLocalKeys("crm-101", "101"), ["crm-101", "101"]);
    assert.deepEqual(collectSlotLocalKeys("custom-7"), ["custom-7"]);

    const overrides = {
      "101": "no-show",
      "crm-101": "booked",
      "202": "registered",
    };
    const res = omitRecordKeys(overrides, collectSlotLocalKeys("crm-101", "101"));
    assert.deepEqual(res.next, { "202": "registered" });
    assert.deepEqual(res.removed, { "101": "no-show", "crm-101": "booked" });
    assert.equal(res.changed, true);
  });

  it("strips [No-Show] tags without deleting real agent notes", () => {
    assert.equal(stripAuditionNoShowTag("No-Show"), "");
    assert.equal(stripAuditionNoShowTag("no-show"), "");
    assert.equal(stripAuditionNoShowTag("Parent asked for Friday [No-Show]"), "Parent asked for Friday");
    assert.equal(stripAuditionNoShowTag("Interested in piano"), "Interested in piano");
  });

  it("detects audition-derived follow-ups while keeping independent callback follow-ups", () => {
    assert.equal(
      isAuditionDerivedFollowUp({
        pipeline: "Audition Booked",
        auditionDate: "2026-11-18",
        followUpDate: "2026-11-18",
        followUpNote: "4:30 PM · Piano",
      }),
      true
    );
    assert.equal(
      isAuditionDerivedFollowUp({
        pipeline: "Joining Later",
        auditionOutcome: "joining-later",
        followUpDate: "2026-12-01",
        followUpNote: "Joining Later - Follow up",
      }),
      true
    );
    assert.equal(
      isAuditionDerivedFollowUp({
        pipeline: "Audition Booked",
        auditionDate: "2026-11-18",
        followUpDate: "2026-11-25",
        followUpNote: "Call mother after 6 PM",
      }),
      false
    );
  });

  it("strips audition_booked and audition_outcome activities while keeping message and cash logs", () => {
    const cleaned = sanitizeAuditionActivityLog([
      { id: "1", type: "audition_booked", actor: "Sara", timestamp: 100 },
      { id: "2", type: "audition_outcome", actor: "Sara", timestamp: 200 },
      { id: "3", type: "message_sent", actor: "Sara", timestamp: 300 },
      { id: "4", type: "cash_recorded", actor: "Sara", timestamp: 400 },
    ]);
    assert.deepEqual(
      cleaned.map((e) => e.id),
      ["3", "4"]
    );
  });

  it("removes audition attribution fields from source object while keeping campaign & leadNameEdited", () => {
    const cleanedSource = sanitizeAuditionSource(
      {
        campaign: "Meta Piano",
        adset: "Cairo Kids",
        auditionBookedAt: "2026-11-10T10:00:00.000Z",
        bookedBy: "Sara",
        attendedAt: "2026-11-12T10:00:00.000Z",
        attendedBy: "Sara",
        enrolledAt: "2026-11-12T11:00:00.000Z",
        enrolledBy: "Sara",
        leadNameEdited: true,
        editedLeadName: "Ali Hassan",
        cashIn: 2500,
        paidAt: "2026-11-12T12:00:00.000Z",
      },
      []
    );
    assert.deepEqual(cleanedSource, {
      campaign: "Meta Piano",
      adset: "Cairo Kids",
      leadNameEdited: true,
      editedLeadName: "Ali Hassan",
      cashIn: 2500,
      paidAt: "2026-11-12T12:00:00.000Z",
    });
  });

  it("builds full-undo patch that removes booked/attended/no-show leads from Auditions and funnel metrics", () => {
    const conv = {
      id: "conv_1",
      pipeline: "Lost",
      auditionDate: "2026-11-18",
      auditionOutcome: "no-show",
      auditionBookedAt: "2026-11-10T10:00:00.000Z",
      bookedBy: "Sara",
      followUpDate: "2026-11-18",
      followUpNote: "4:00 PM · Violin",
      notes: "Reschedule later [No-Show]",
      formAnswers: { instrument: "Violin" },
      source: {
        campaign: "Meta Violin",
        auditionBookedAt: "2026-11-10T10:00:00.000Z",
        bookedBy: "Sara",
      },
      activityLog: [
        { id: "a1", type: "audition_booked", actor: "Sara", timestamp: 1700000000000 },
        { id: "a2", type: "audition_outcome", actor: "Sara", timestamp: 1700001000000 },
        { id: "a3", type: "lead_assigned", actor: "Admin", timestamp: 1699999000000 },
      ],
    };

    const patch = buildRemoveAuditionPatch(conv, {
      actorName: "Nour",
      actorRole: "enrollment_director",
      nowTs: 1700002000000,
    });

    assert.equal(patch.pipeline, "Contacted");
    assert.equal(patch.auditionDate, "");
    assert.equal(patch.auditionOutcome, "");
    assert.equal(patch.auditionBookedAt, null);
    assert.equal(patch.attendedAt, null);
    assert.equal(patch.enrolledAt, null);
    assert.equal(patch.bookedBy, "");
    assert.equal(patch.attendedBy, "");
    assert.equal(patch.enrolledBy, "");
    assert.equal(patch.notes, "Reschedule later");
    assert.equal(patch.followUpDate, "");
    assert.equal(patch.followUpNote, "");
    assert.equal(patch.followUpCompleted, false);
    assert.equal(patch.followUpCompletedAt, null);
    assert.deepEqual(
      patch.activityLog.map((e) => e.id),
      ["a3"]
    );

    const updatedConv = {
      ...conv,
      ...patch,
      auditionBookedAt: undefined,
      attendedAt: undefined,
      enrolledAt: undefined,
    };

    assert.equal(isLiveAuditionConversation(updatedConv, {}, {}), false);
    assert.equal(isBookedLead(updatedConv), false);
    assert.equal(isAttendedLead(updatedConv), false);
    assert.equal(getBookedTime(updatedConv), null);
    assert.equal(getAttendedTime(updatedConv), null);
  });

  it("handles Enrolled leads cleanly while keeping tuition cashIn intact", () => {
    const conv = {
      id: "conv_2",
      pipeline: "Enrolled",
      auditionDate: "2026-11-12",
      auditionOutcome: "registered",
      auditionBookedAt: "2026-11-08T10:00:00.000Z",
      attendedAt: "2026-11-12T14:00:00.000Z",
      enrolledAt: "2026-11-12T15:00:00.000Z",
      cashIn: 3000,
      source: {
        campaign: "Instagram",
        auditionBookedAt: "2026-11-08T10:00:00.000Z",
        attendedAt: "2026-11-12T14:00:00.000Z",
        enrolledAt: "2026-11-12T15:00:00.000Z",
        cashIn: 3000,
        paidAt: "2026-11-12T15:05:00.000Z",
      },
      activityLog: [
        { id: "m1", type: "audition_booked", actor: "Sara", timestamp: 1000 },
        { id: "m2", type: "cash_recorded", actor: "Sara", timestamp: 2000 },
      ],
    };

    const patch = buildRemoveAuditionPatch(conv, { actorName: "Admin", nowTs: 3000 });
    const updatedConv = {
      ...conv,
      ...patch,
      auditionBookedAt: undefined,
      attendedAt: undefined,
      enrolledAt: undefined,
    };

    assert.equal(updatedConv.pipeline, "Contacted");
    assert.equal(isLiveAuditionConversation(updatedConv, {}, {}), false);
    assert.equal(isBookedLead(updatedConv), false);
    assert.equal(isAttendedLead(updatedConv), false);
    assert.equal(isConvertedLead(updatedConv), true);
    assert.equal(updatedConv.cashIn, 3000);
  });

  it("adds an explicit stage_changed entry when Contacted conversation already had an auditionDate", () => {
    const conv = {
      id: "conv_3",
      pipeline: "Contacted",
      auditionDate: "2026-11-19",
      activityLog: [],
    };
    const patch = buildRemoveAuditionPatch(conv, {
      actorName: "Omar",
      actorRole: "admission_officer",
      nowTs: 5000,
    });
    assert.equal(patch.activityLog.length, 1);
    assert.equal(patch.activityLog[0].type, "stage_changed");
    assert.equal(patch.activityLog[0].summary, "Removed audition booking");
    assert.equal(patch.activityLog[0].actor, "Omar");
  });
});

