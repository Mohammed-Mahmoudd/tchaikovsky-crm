import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCadenceDaysInput,
  formatChannelName,
  formatFollowUpReason,
  formatRiyadhHourLabel,
  getChannelWindowMeta,
  getEnrollmentStatusMeta,
  parseCadenceDaysInput,
  resolveCadencePresetId,
  resolveFollowUpSection,
  resolveLeadAgentScopeForPath,
} from "./followupAgent.ts";

describe("followupAgent utils", () => {
  it("normalizes follow-up section query params cleanly", () => {
    assert.equal(resolveFollowUpSection(null), "followups");
    assert.equal(resolveFollowUpSection("queue"), "followups");
    assert.equal(resolveFollowUpSection("activity"), "followups");
    assert.equal(resolveFollowUpSection("role"), "instructions");
    assert.equal(resolveFollowUpSection("playbook"), "instructions");
    assert.equal(resolveFollowUpSection("instructions"), "instructions");
    assert.equal(resolveFollowUpSection("skills"), "skills");
    assert.equal(resolveFollowUpSection("cadence"), "schedule");
    assert.equal(resolveFollowUpSection("rules"), "schedule");
    assert.equal(resolveFollowUpSection("schedule"), "schedule");
    assert.equal(resolveLeadAgentScopeForPath("/agent/follow-up"), "followup");
    assert.equal(resolveLeadAgentScopeForPath("/agent"), "admissions");
    assert.equal(resolveLeadAgentScopeForPath("/agent/leads"), "admissions");
    assert.equal(resolveLeadAgentScopeForPath("/"), "both");
    assert.equal(resolveLeadAgentScopeForPath("/pipeline"), "both");
  });

  it("maps internal codes to plain-English copy and theme pills", () => {
    assert.equal(
      formatFollowUpReason("admissions_adham_active"),
      "Another assistant is already active on this chat."
    );
    assert.equal(
      formatFollowUpReason("window_meta_expired"),
      "Messaging window closed on Messenger or Instagram."
    );
    assert.equal(formatChannelName("FB"), "Messenger");
    assert.equal(formatChannelName("IG"), "Instagram");
    assert.equal(formatChannelName("WA"), "WhatsApp");

    assert.equal(
      getChannelWindowMeta({
        channel: "WA",
        tier: "wa_open",
        autoSendable: true,
        approvalSendable: true,
        hoursRemaining: null,
        lastIncomingAt: null,
        hasPhone: true,
      }).label,
      "Ready"
    );

    assert.equal(
      getChannelWindowMeta({
        channel: "IG",
        tier: "meta_7d",
        autoSendable: false,
        approvalSendable: true,
        hoursRemaining: 48,
        lastIncomingAt: 1,
        hasPhone: false,
      }).label,
      "Review to send"
    );

    assert.equal(
      getChannelWindowMeta({
        channel: "FB",
        tier: "meta_expired",
        autoSendable: false,
        approvalSendable: false,
        hoursRemaining: 0,
        lastIncomingAt: 1,
        hasPhone: true,
      }).label,
      "Call or WhatsApp only"
    );

    assert.equal(getEnrollmentStatusMeta(null).label, "Not assigned");
    assert.equal(
      getEnrollmentStatusMeta({
        status: "scheduled",
        attemptCount: 0,
        nextAttemptAt: null,
        lastSentAt: null,
        lastDraftedAt: null,
        draftText: "",
        draftAttemptNumber: 0,
        draftSkillsUsed: [],
        stopReason: "",
        lastError: "",
        repliedAt: null,
        history: [],
      }).label,
      "Assigned"
    );
  });

  it("resolves cadence presets, working hours, and cadence inputs cleanly", () => {
    assert.equal(resolveCadencePresetId({ cadenceDays: [1, 3, 7], maxAttempts: 3 }), "gentle");
    assert.equal(resolveCadencePresetId({ cadenceDays: [1, 2, 5], maxAttempts: 3 }), "standard");
    assert.equal(resolveCadencePresetId({ cadenceDays: [1, 4], maxAttempts: 2 }), "light");
    assert.equal(formatRiyadhHourLabel(10), "10:00 AM");
    assert.equal(formatRiyadhHourLabel(21), "9:00 PM");
    assert.deepEqual(parseCadenceDaysInput("2, 5, 10"), [2, 5, 10]);
    assert.deepEqual(parseCadenceDaysInput("0, invalid, 999"), [1, 3, 7]);
    assert.equal(formatCadenceDaysInput([1, 4, 8]), "1, 4, 8");
  });
});
