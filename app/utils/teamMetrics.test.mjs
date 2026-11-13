import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampRatePct,
  collectLoggedMessageKeys,
  getAttendedTime,
  getBookedTime,
  getConvertedTime,
  isAttendedLead,
  isBookedLead,
  isConvertedLead,
  isMessageAlreadyInActivityLog,
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
});

