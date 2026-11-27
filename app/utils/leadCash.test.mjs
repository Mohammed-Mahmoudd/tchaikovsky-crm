import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeActiveCashTotal,
  formatLeadCashInputValue,
  formatLeadCashLabel,
  getCashEntriesSignature,
  isRealCashActor,
  parseAddCashInput,
  parseLeadCashInput,
  resolveConversationCashPayments,
} from "./leadCash.ts";

describe("leadCash", () => {
  it("parses empty, integer, decimal, and comma-formatted non-negative amounts", () => {
    assert.deepEqual(parseLeadCashInput(""), { ok: true, value: 0 });
    assert.deepEqual(parseLeadCashInput("   "), { ok: true, value: 0 });
    assert.deepEqual(parseLeadCashInput("2500"), { ok: true, value: 2500 });
    assert.deepEqual(parseLeadCashInput("2,500.50"), { ok: true, value: 2500.5 });
    assert.deepEqual(parseLeadCashInput("0"), { ok: true, value: 0 });
  });

  it("rejects negative and non-numeric inputs with clear plain-language errors", () => {
    assert.deepEqual(parseLeadCashInput("-100"), {
      ok: false,
      error: "Enter a positive amount or 0",
    });
    assert.deepEqual(parseLeadCashInput("abc"), {
      ok: false,
      error: "Enter a valid cash amount",
    });
    assert.deepEqual(parseLeadCashInput("120sar"), {
      ok: false,
      error: "Enter a valid cash amount",
    });
  });

  it("validates add-cash amounts strictly (> 0)", () => {
    assert.deepEqual(parseAddCashInput(""), {
      ok: false,
      error: "Enter an amount greater than 0",
    });
    assert.deepEqual(parseAddCashInput("0"), {
      ok: false,
      error: "Enter an amount greater than 0",
    });
    assert.deepEqual(parseAddCashInput("1,250.75"), {
      ok: true,
      value: 1250.75,
    });
  });

  it("formats stored Cash In values for input and display badges", () => {
    assert.equal(formatLeadCashInputValue(undefined), "");
    assert.equal(formatLeadCashInputValue(null), "");
    assert.equal(formatLeadCashInputValue(0), "");
    assert.equal(formatLeadCashInputValue(3500), "3500");

    assert.equal(formatLeadCashLabel(0), null);
    assert.equal(formatLeadCashLabel(null), null);
    assert.equal(formatLeadCashLabel(3500), "3,500 SAR");
  });

  it("resolves multi-entry payments excluding voided rows and preserves chronological order", () => {
    const payments = resolveConversationCashPayments({
      cashIn: 2200,
      cashEntries: [
        {
          id: "cash_2",
          amount: 700,
          recordedBy: "Nourhan",
          recordedAt: 2000,
          note: "Second payment",
          isVoided: false,
        },
        {
          id: "cash_voided",
          amount: 500,
          recordedBy: "Mariam",
          recordedAt: 1500,
          isVoided: true,
        },
        {
          id: "cash_1",
          amount: 1500,
          recordedBy: "Youssef",
          recordedAt: 1000,
          note: "Deposit",
          isVoided: false,
        },
      ],
    });

    assert.equal(payments.length, 2);
    assert.equal(payments[0].id, "cash_1");
    assert.equal(payments[0].actor, "Youssef");
    assert.equal(payments[1].id, "cash_2");
    assert.equal(payments[1].actor, "Nourhan");
    assert.equal(
      computeActiveCashTotal({
        cashEntries: [
          { id: "cash_1", amount: 1500, recordedBy: "Youssef", recordedAt: 1000, isVoided: false },
          { id: "cash_voided", amount: 500, recordedBy: "Mariam", recordedAt: 1500, isVoided: true },
          { id: "cash_2", amount: 700, recordedBy: "Nourhan", recordedAt: 2000, isVoided: false },
        ],
      }),
      2200
    );
  });

  it("resolves legacy cashIn via cashRecordedBy -> activityLog -> enrolledBy and never falls back to assigned agent", () => {
    assert.equal(isRealCashActor("Youssef"), true);
    assert.equal(isRealCashActor("Staff"), false);
    assert.equal(isRealCashActor("Legacy"), false);

    const fromCashRecordedBy = resolveConversationCashPayments({
      cashIn: 1200,
      cashRecordedBy: "Nourhan",
      enrolledBy: "Youssef",
    });
    assert.equal(fromCashRecordedBy[0].actor, "Nourhan");
    assert.equal(fromCashRecordedBy[0].attributionSource, "cash_recorded_by");

    const fromActivity = resolveConversationCashPayments({
      cashIn: 1200,
      enrolledBy: "Youssef",
      activityLog: [
        { id: "a1", type: "cash_recorded", actor: "Mariam", timestamp: 5000 },
      ],
    });
    assert.equal(fromActivity[0].actor, "Mariam");
    assert.equal(fromActivity[0].attributionSource, "activity_log");
    assert.equal(fromActivity[0].timestamp, 5000);

    const fromEnrolledBy = resolveConversationCashPayments({
      cashIn: 1200,
      enrolledBy: "Youssef",
    });
    assert.equal(fromEnrolledBy[0].actor, "Youssef");
    assert.equal(fromEnrolledBy[0].attributionSource, "enrolled_by");

    const unattributed = resolveConversationCashPayments({
      cashIn: 1200,
    });
    assert.equal(unattributed[0].actor, "");
    assert.equal(unattributed[0].attributionSource, "unattributed");

    assert.ok(getCashEntriesSignature([{ id: "c1", amount: 100, recordedBy: "A", recordedAt: 1 }]));
  });
});
