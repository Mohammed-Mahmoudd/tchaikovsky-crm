import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLabelNameMap, matchLeadSearch } from "./search.ts";

describe("matchLeadSearch", () => {
  const labelMap = buildLabelNameMap([
    { id: "l1", name: "VIP" },
    { id: "l2", name: "Arabic Speaker" },
    { id: "l3", name: "بيانو مبتدئ" },
  ]);

  const lead = {
    id: "201001234567",
    name: "+201001234567",
    leadName: "Ahmed Hassan",
    phone: "+201001234567",
    labels: ["l1", "l3"],
  };

  it("matches by lead ID, name, and phone formats", () => {
    assert.equal(matchLeadSearch(lead, "201001234567"), true);
    assert.equal(matchLeadSearch(lead, "hassan"), true);
    assert.equal(matchLeadSearch(lead, "01001234567"), true);
    assert.equal(matchLeadSearch(lead, "nonexistent"), false);
  });

  it("matches by assigned label names including Arabic normalization", () => {
    assert.equal(matchLeadSearch(lead, "vip", labelMap), true);
    assert.equal(matchLeadSearch(lead, "بيانو مبتدئ", labelMap), true);
    assert.equal(matchLeadSearch(lead, "مبتدي", labelMap), true);
    assert.equal(matchLeadSearch(lead, "Arabic Speaker", labelMap), false);
  });

  it("matches multi-token queries spanning lead name and assigned label", () => {
    assert.equal(matchLeadSearch(lead, "vip ahmed", labelMap), true);
    assert.equal(matchLeadSearch(lead, "vip sarah", labelMap), false);
  });

  it("ignores deleted or unmapped label IDs safely", () => {
    const withUnknown = {
      id: "999",
      name: "Omar",
      labels: ["deleted-id"],
    };
    assert.equal(matchLeadSearch(withUnknown, "deleted", labelMap), false);
    assert.equal(matchLeadSearch(withUnknown, "omar", labelMap), true);
  });
});

