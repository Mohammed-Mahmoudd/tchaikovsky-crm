import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LEAD_LABEL_NAME_LENGTH,
  areStringArraysEqual,
  countLeadsWithLabel,
  filterLeadLabels,
  getLabelConversationCounts,
  getLabelFilterDisplayText,
  getLeadLabelCssVars,
  matchesLabelFilter,
  normalizeConversationLabelIds,
  normalizeLeadLabelCatalog,
  partitionVisibleLabels,
  removeLeadLabelId,
  resolveConversationLabels,
  toggleLeadLabelId,
  validateLeadLabelName,
} from "./leadLabels.ts";

describe("leadLabels utilities", () => {
  const catalog = normalizeLeadLabelCatalog([
    { id: "l1", name: "VIP", color: "amber", order: 0 },
    { id: "l2", name: "Arabic Speaker", color: "blue", order: 1 },
    { id: "l3", name: "Corporate", color: "teal", order: 2 },
    { id: "l4", name: "Sibling Discount", color: "purple", order: 3 },
  ]);

  it("maps colors to CSS theme token variables with safe fallback", () => {
    assert.deepEqual(getLeadLabelCssVars("green"), {
      background: "var(--label-green-bg)",
      borderColor: "var(--label-green-border)",
      color: "var(--label-green-text)",
      dotColor: "var(--label-green-dot)",
    });

    assert.deepEqual(getLeadLabelCssVars("invalid"), {
      background: "var(--label-blue-bg)",
      borderColor: "var(--label-blue-border)",
      color: "var(--label-blue-text)",
      dotColor: "var(--label-blue-dot)",
    });
  });

  it("validates label names for empty, length, whitespace normalization, and case-insensitive duplicates", () => {
    assert.equal(validateLeadLabelName("   ", catalog).ok, false);
    assert.equal(
      validateLeadLabelName("a".repeat(MAX_LEAD_LABEL_NAME_LENGTH + 1), catalog).ok,
      false
    );
    assert.equal(validateLeadLabelName("  vip  ", catalog).ok, false);

    // Renaming the same label to different casing/spacing is allowed when excludeId matches
    assert.deepEqual(validateLeadLabelName("  VIP  ", catalog, "l1"), {
      ok: true,
      value: "VIP",
    });

    assert.deepEqual(validateLeadLabelName("  Piano   Beginner  ", catalog), {
      ok: true,
      value: "Piano Beginner",
    });
  });

  it("resolves conversation label IDs cleanly and drops deleted/unknown IDs", () => {
    const resolved = resolveConversationLabels(["l2", "missing", "l1", "l2"], catalog);
    assert.deepEqual(
      resolved.map((l) => l.name),
      ["Arabic Speaker", "VIP"]
    );
  });

  it("toggles, removes, normalizes, and compares label ID arrays", () => {
    assert.deepEqual(normalizeConversationLabelIds(["l1", "", "l1", "l2"]), ["l1", "l2"]);
    assert.deepEqual(toggleLeadLabelId(["l1"], "l2"), ["l1", "l2"]);
    assert.deepEqual(toggleLeadLabelId(["l1", "l2"], "l1"), ["l2"]);
    assert.deepEqual(removeLeadLabelId(["l1", "l2"], "l1"), ["l2"]);

    assert.equal(areStringArraysEqual(["l1", "l2"], ["l1", "l2"]), true);
    assert.equal(areStringArraysEqual(["l1", "l2"], ["l1", "l3"]), false);
    assert.equal(areStringArraysEqual(undefined, []), true);
  });

  it("partitions visible vs overflow labels for compact inbox rows", () => {
    const { visible, overflow } = partitionVisibleLabels(catalog, 3);
    assert.deepEqual(
      visible.map((l) => l.id),
      ["l1", "l2", "l3"]
    );
    assert.deepEqual(
      overflow.map((l) => l.id),
      ["l4"]
    );
  });

  it("filters label catalog and counts affected conversations", () => {
    assert.deepEqual(
      filterLeadLabels(catalog, "speak").map((l) => l.id),
      ["l2"]
    );
    assert.equal(
      countLeadsWithLabel(
        [{ labels: ["l1", "l2"] }, { labels: ["l2"] }, { labels: [] }],
        "l2"
      ),
      2
    );
  });

  it("matches label filters, computes per-label counts, and formats filter display text", () => {
    assert.equal(matchesLabelFilter([], []), true);
    assert.equal(matchesLabelFilter([], ["l1"]), false);
    assert.equal(matchesLabelFilter(["l2"], ["l1", "l2"]), true);
    assert.equal(matchesLabelFilter(["l3"], ["l1", "l2"]), false);

    const counts = getLabelConversationCounts(
      [{ labels: ["l1", "l2"] }, { labels: ["l2"] }, { labels: ["deleted"] }],
      catalog
    );
    assert.equal(counts.get("l1"), 1);
    assert.equal(counts.get("l2"), 2);
    assert.equal(counts.get("l3"), 0);

    assert.equal(getLabelFilterDisplayText([]), "All Labels");
    assert.equal(getLabelFilterDisplayText([catalog[0]]), "VIP");
    assert.equal(getLabelFilterDisplayText([catalog[0], catalog[1]]), "2 Labels");
  });
});

