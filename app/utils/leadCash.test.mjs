import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLeadCashInputValue,
  formatLeadCashLabel,
  parseLeadCashInput,
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

  it("formats stored Cash In values for input and display badges", () => {
    assert.equal(formatLeadCashInputValue(undefined), "");
    assert.equal(formatLeadCashInputValue(null), "");
    assert.equal(formatLeadCashInputValue(0), "");
    assert.equal(formatLeadCashInputValue(3500), "3500");

    assert.equal(formatLeadCashLabel(0), null);
    assert.equal(formatLeadCashLabel(null), null);
    assert.equal(formatLeadCashLabel(3500), "3,500 SAR");
  });
});

