import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildChatDateDividerLabels,
  formatChatDateDivider,
  formatChatMessageTooltip,
  formatLastMessageTime,
  getLocalDateKey,
  normalizeTimestampMs,
} from "./time.ts";

describe("time utilities", () => {
  it("normalizes ms, 10-digit Unix seconds, ISO strings, and invalid inputs", () => {
    const ms = new Date(2026, 10, 15, 14, 30, 0).getTime();
    const sec = Math.floor(ms / 1000);

    assert.equal(normalizeTimestampMs(ms), ms);
    assert.equal(normalizeTimestampMs(sec), sec * 1000);
    assert.equal(normalizeTimestampMs(String(sec)), sec * 1000);
    assert.equal(normalizeTimestampMs(new Date(ms).toISOString()), ms);
    assert.equal(normalizeTimestampMs(new Date(ms)), ms);

    assert.equal(normalizeTimestampMs(null), null);
    assert.equal(normalizeTimestampMs(undefined), null);
    assert.equal(normalizeTimestampMs(""), null);
    assert.equal(normalizeTimestampMs(0), null);
    assert.equal(normalizeTimestampMs(-100), null);
    assert.equal(normalizeTimestampMs("not-a-date"), null);
  });

  it("computes local calendar date keys", () => {
    const localDate = new Date(2026, 0, 5, 23, 59, 0); // Jan 5, 2026 local
    assert.equal(getLocalDateKey(localDate), "2026-01-05");
    assert.equal(getLocalDateKey(undefined), null);
  });

  it("formats chat date dividers as Today, Yesterday, or full short date", () => {
    const now = new Date(2026, 10, 15, 20, 45, 0); // Nov 15, 2026 local
    const todayEarly = new Date(2026, 10, 15, 0, 5, 0).getTime();
    const yesterdayLate = new Date(2026, 10, 14, 23, 55, 0).getTime();
    const older = new Date(2026, 10, 12, 16, 10, 0).getTime();

    assert.equal(formatChatDateDivider(todayEarly, now), "Today");
    assert.equal(formatChatDateDivider(yesterdayLate, now), "Yesterday");
    assert.equal(formatChatDateDivider(older, now), "Thu, Nov 12, 2026");
    assert.equal(formatChatDateDivider(null, now), "");

    // Handles month/year rollover cleanly for Yesterday
    const janFirst = new Date(2027, 0, 1, 9, 0, 0);
    const decThirtyFirst = new Date(2026, 11, 31, 22, 0, 0).getTime();
    assert.equal(formatChatDateDivider(decThirtyFirst, janFirst), "Yesterday");
  });

  it("formats full date and time tooltips with fallback", () => {
    const ts = new Date(2026, 10, 12, 14, 34, 0).getTime();
    assert.equal(formatChatMessageTooltip(ts, "02:34 PM"), "Thu, Nov 12, 2026 · 02:34 PM");
    assert.equal(formatChatMessageTooltip(undefined, "02:34 PM"), "02:34 PM");
    assert.equal(formatChatMessageTooltip(undefined, undefined), "");

    const autoTooltip = formatChatMessageTooltip(ts);
    assert.ok(autoTooltip.startsWith("Thu, Nov 12, 2026 · "));
    assert.ok(autoTooltip.length > "Thu, Nov 12, 2026 · ".length);
  });

  it("builds date divider labels across multi-day and missing-timestamp messages", () => {
    const now = new Date(2026, 10, 15, 20, 0, 0);
    const nov12Morning = new Date(2026, 10, 12, 9, 0, 0).getTime();
    const nov12Evening = new Date(2026, 10, 12, 18, 0, 0).getTime();
    const nov14 = new Date(2026, 10, 14, 12, 0, 0).getTime();
    const nov15 = new Date(2026, 10, 15, 10, 0, 0).getTime();

    const labels = buildChatDateDividerLabels(
      [
        { timestamp: undefined },
        { timestamp: nov12Morning },
        { timestamp: undefined },
        { timestamp: nov12Evening },
        { timestamp: nov14 },
        { timestamp: nov15 },
        { timestamp: nov15 + 60_000 },
      ],
      now
    );

    assert.deepEqual(labels, [
      null,
      "Thu, Nov 12, 2026",
      null,
      null,
      "Yesterday",
      "Today",
      null,
    ]);
    assert.deepEqual(buildChatDateDividerLabels([], now), []);
  });

  it("preserves compact relative timestamps for conversation list", () => {
    const now = Date.now();
    assert.equal(formatLastMessageTime(now - 10_000), "just now");
    assert.equal(formatLastMessageTime(now - 5 * 60_000), "5m");
    assert.equal(formatLastMessageTime(now - 2 * 3600_000), "2h");
    assert.equal(formatLastMessageTime(now - 24 * 3600_000), "1 day ago");
    assert.equal(formatLastMessageTime(now - 3 * 24 * 3600_000), "3 days ago");
    assert.equal(formatLastMessageTime(null), "");
  });
});

