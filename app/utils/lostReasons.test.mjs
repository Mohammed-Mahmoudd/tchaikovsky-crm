import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LOST_REASON_OPTIONS,
  MAX_LOST_REASON_NOTE_LENGTH,
  normalizeLostReasonId,
  getLostReasonLabel,
  formatLostReasonDisplay,
  validateLostReasonSubmission,
} from "./lostReasons.ts";

describe("lostReasons", () => {
  it("normalizes canonical IDs, hyphenated aliases, and labels", () => {
    assert.equal(normalizeLostReasonId("price"), "price");
    assert.equal(normalizeLostReasonId("no-show"), "no_show");
    assert.equal(normalizeLostReasonId("Location / Branch too far"), "location");
    assert.equal(normalizeLostReasonId(""), "");
    assert.equal(normalizeLostReasonId("unknown_value"), "");
    assert.equal(normalizeLostReasonId("competitor"), "");
    assert.equal(LOST_REASON_OPTIONS.length, 8);
  });

  it("formats display labels and combined reason + note strings", () => {
    assert.equal(getLostReasonLabel("schedule"), "Schedule / Timing conflict");
    assert.equal(
      formatLostReasonDisplay("price", "Requested 1,000 SAR limit"),
      "Price / Too expensive — Requested 1,000 SAR limit"
    );
    assert.equal(formatLostReasonDisplay("no_response", "  "), "No response / Unreachable");
  });

  it("validates required reason, note requirement for Other, and note length limit", () => {
    assert.deepEqual(validateLostReasonSubmission("", ""), {
      ok: false,
      field: "reason",
      error: "Select why this lead was lost",
    });
    assert.deepEqual(validateLostReasonSubmission("other", "   "), {
      ok: false,
      field: "note",
      error: "Enter a brief reason when selecting Other",
    });
    assert.deepEqual(
      validateLostReasonSubmission("price", "  Outside budget  "),
      {
        ok: true,
        reason: "price",
        note: "Outside budget",
      }
    );
    assert.equal(
      validateLostReasonSubmission("price", "a".repeat(MAX_LOST_REASON_NOTE_LENGTH + 1)).ok,
      false
    );
  });
});

