import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDirectorLeadInsights,
  extractMeaningfulDirectorFollowUpNote,
  formatIsoDateDisplay,
  getFollowUpDateRelativeLabel,
} from "./directorLeadInfo.ts";

describe("directorLeadInfo", () => {
  it("keeps (i) hidden for a freshly booked audition with only booking-mirror fields and time/instrument prefix", () => {
    const bookingTs = 1795780000000;
    const insights = computeDirectorLeadInsights({
      id: "lead_1",
      pipeline: "Audition Booked",
      auditionDate: "2026-12-01",
      followUpDate: "2026-12-01",
      followUpNote: "05:00 PM · Piano",
      notes: "",
      formAnswers: { instrument: "Piano", studentAge: "8" },
      auditionBookedAt: bookingTs,
      activityLog: [
        {
          id: "act_1",
          type: "stage_changed",
          actor: "Jwana",
          actorRole: "admission_officer",
          summary: "Moved stage to Contacted",
          fromValue: "New",
          toValue: "Contacted",
          timestamp: bookingTs - 60_000,
        },
        {
          id: "act_2",
          type: "audition_booked",
          actor: "Jwana",
          actorRole: "admission_officer",
          summary: "Booked Audition",
          fromValue: "Contacted",
          toValue: "Audition Booked",
          timestamp: bookingTs,
        },
        {
          id: "act_3",
          type: "followup_scheduled",
          actor: "Jwana",
          actorRole: "admission_officer",
          summary: "Scheduled follow-up for 2026-12-01",
          detail: "05:00 PM · Piano",
          toValue: "2026-12-01",
          timestamp: bookingTs,
        },
      ],
    });

    assert.equal(insights.hasUpdates, false);
    assert.equal(insights.followUp.hasRequest, false);
    assert.equal(insights.hasStageChange, false);
    assert.equal(insights.hasReschedule, false);
    assert.equal(insights.leadNote, "");
  });

  it("extracts real staff follow-up notes after time prefixes while ignoring bare time or instrument", () => {
    assert.equal(
      extractMeaningfulDirectorFollowUpNote({
        followUpNote: "05:00 PM",
        formAnswers: { instrument: "Piano" },
      }),
      ""
    );
    assert.equal(
      extractMeaningfulDirectorFollowUpNote({
        followUpNote: "05:00 PM · Piano",
        formAnswers: { instrument: "Piano" },
      }),
      ""
    );
    assert.equal(
      extractMeaningfulDirectorFollowUpNote({
        followUpNote: "05:00 PM · Prefers female teacher",
        formAnswers: { instrument: "Piano" },
      }),
      "Prefers female teacher"
    );

    const insights = computeDirectorLeadInsights({
      id: "lead_2",
      pipeline: "Audition Booked",
      auditionDate: "2026-12-01",
      followUpDate: "2026-12-01",
      followUpNote: "05:00 PM · Prefers female teacher",
      formAnswers: { instrument: "Piano" },
    });
    assert.equal(insights.hasUpdates, true);
    assert.equal(insights.followUp.hasRequest, true);
    assert.equal(insights.followUp.note, "Prefers female teacher");
  });

  it("drops message_sent, lead_assigned, cash_recorded, and branch_changed entries and never leaks actor names", () => {
    const bookingTs = 1795780000000;
    const insights = computeDirectorLeadInsights({
      id: "lead_3",
      pipeline: "Audition Booked",
      auditionDate: "2026-12-01",
      followUpDate: "2026-12-01",
      followUpNote: "06:00 PM",
      activityLog: [
        {
          id: "a1",
          type: "message_sent",
          actor: "Jwana",
          summary: "Sent WhatsApp reply",
          detail: "Hello!",
          timestamp: bookingTs + 1000,
        },
        {
          id: "a2",
          type: "lead_assigned",
          actor: "Adham",
          summary: "Assigned to Jwana",
          timestamp: bookingTs + 2000,
        },
        {
          id: "a3",
          type: "cash_recorded",
          actor: "Jwana",
          summary: "Recorded payment: 1,500 SAR",
          timestamp: bookingTs + 3000,
        },
        {
          id: "a4",
          type: "branch_changed",
          actor: "Jwana",
          summary: "Set branch to Riyadh Park Mall",
          timestamp: bookingTs + 4000,
        },
      ],
    });

    assert.equal(insights.hasUpdates, false);
    assert.deepEqual(insights.timeline, []);
  });

  it("shows (i) and stage/lost details when lead moves to Joining Later, Lost, Attended, or Enrolled", () => {
    const baseTs = 1795780000000;

    const joiningLater = computeDirectorLeadInsights({
      id: "lead_4a",
      pipeline: "Joining Later",
      auditionOutcome: "joining-later",
      auditionDate: "2026-11-28",
      followUpDate: "2026-12-12",
      followUpNote: "Call back after finals",
      activityLog: [
        {
          id: "a_stage",
          type: "stage_changed",
          actor: "Sara",
          actorRole: "admission_officer",
          summary: "Moved stage to Joining Later",
          fromValue: "Audition Booked",
          toValue: "Joining Later",
          timestamp: baseTs + 10_000,
        },
      ],
    });
    assert.equal(joiningLater.hasUpdates, true);
    assert.equal(joiningLater.hasStageChange, true);
    assert.equal(joiningLater.followUp.isJoiningLater, true);
    assert.equal(joiningLater.followUp.date, "2026-12-12");
    assert.equal(joiningLater.timeline.length, 1);
    assert.equal("actor" in joiningLater.timeline[0], false);
    assert.equal("actorRole" in joiningLater.timeline[0], false);

    const lostLead = computeDirectorLeadInsights({
      id: "lead_4b",
      pipeline: "Lost",
      lostReason: "price",
      lostReasonNote: "Requested monthly installment option",
    });
    assert.equal(lostLead.hasUpdates, true);
    assert.equal(lostLead.hasStageChange, true);
    assert.equal(lostLead.lostReason, "price");
    assert.equal(lostLead.lostReasonNote, "Requested monthly installment option");

    const attendedLead = computeDirectorLeadInsights({
      id: "lead_4c",
      pipeline: "Attended",
      auditionOutcome: "paid-trial",
    });
    assert.equal(attendedLead.hasUpdates, true);
    assert.equal(attendedLead.auditionOutcomeLabel, "Paid Trial");

    const enrolledLead = computeDirectorLeadInsights({
      id: "lead_4d",
      pipeline: "Enrolled",
      auditionOutcome: "registered",
    });
    assert.equal(enrolledLead.hasUpdates, true);
    assert.equal(enrolledLead.auditionOutcomeLabel, "Registered");
  });

  it("detects distinct follow-up dates, tags, completed follow-ups, and reschedules", () => {
    const ts1 = 1795780000000;
    const ts2 = ts1 + 50_000;

    const tagged = computeDirectorLeadInsights({
      id: "lead_5a",
      pipeline: "Audition Booked",
      auditionDate: "2026-12-01",
      followUpDate: "2026-12-05",
      followUpTags: ["payment-pending", "trial-session"],
      followUpCompleted: true,
      followUpCompletedAt: "2026-12-06",
    });
    assert.equal(tagged.hasUpdates, true);
    assert.equal(tagged.followUp.hasRequest, true);
    assert.equal(tagged.followUp.isPaymentPending, true);
    assert.equal(tagged.followUp.isTrialSession, true);
    assert.equal(tagged.followUp.completed, true);
    assert.equal(tagged.followUp.date, "2026-12-05");

    const rescheduled = computeDirectorLeadInsights({
      id: "lead_5b",
      pipeline: "Audition Booked",
      auditionDate: "2026-12-03",
      followUpDate: "2026-12-03",
      activityLog: [
        {
          id: "b1",
          type: "audition_booked",
          actor: "Sara",
          summary: "Booked Audition",
          toValue: "2026-11-30",
          timestamp: ts1,
        },
        {
          id: "b2",
          type: "audition_booked",
          actor: "Sara",
          summary: "Scheduled audition for 2026-12-03",
          fromValue: "2026-11-30",
          toValue: "2026-12-03",
          timestamp: ts2,
        },
      ],
    });
    assert.equal(rescheduled.hasUpdates, true);
    assert.equal(rescheduled.hasReschedule, true);
    assert.equal(rescheduled.timeline[0].category, "reschedule");
    assert.equal(rescheduled.timeline[0].summary, "Audition rescheduled");
    assert.equal(rescheduled.timeline[0].fromValue, "2026-11-30");
    assert.equal(rescheduled.timeline[0].toValue, "2026-12-03");
  });

  it("strips [No-Show] and bare No-Show markers without creating fake notes", () => {
    const bareNoShow = computeDirectorLeadInsights({
      id: "lead_6a",
      pipeline: "Audition Booked",
      notes: "No-Show",
    });
    assert.equal(bareNoShow.leadNote, "");
    assert.equal(bareNoShow.hasUpdates, false);

    const taggedNote = computeDirectorLeadInsights({
      id: "lead_6b",
      pipeline: "Lost",
      auditionOutcome: "no-show",
      notes: "Parent asked for Saturday afternoon [No-Show]",
    });
    assert.equal(taggedNote.leadNote, "Parent asked for Saturday afternoon");
    assert.equal(taggedNote.hasUpdates, true);
  });

  it("formats calendar dates without UTC shift and computes relative follow-up status", () => {
    assert.equal(formatIsoDateDisplay("2026-12-03"), "Thu, Dec 3, 2026");
    assert.equal(getFollowUpDateRelativeLabel("2026-11-26", "2026-11-27"), "overdue");
    assert.equal(getFollowUpDateRelativeLabel("2026-11-27", "2026-11-27"), "today");
    assert.equal(getFollowUpDateRelativeLabel("2026-12-01", "2026-11-27"), "upcoming");
  });
});

