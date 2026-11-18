import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUDITION_CACHE_UPDATED_EVENT,
  AUDITION_CLOSED_SLOTS_KEY,
  AUDITION_LOCKED_DATES_KEY,
  AUDITION_STATUS_OVERRIDES_KEY,
  buildAuditionBookingPatch,
  buildBookingModalDefaults,
  extractAuditionNoteSuffix,
  extractExplicitAuditionTime,
  getAuditionTimeSelectOptions,
  normalizeAuditionTimeLabel,
  reconcileAuditionLocalCaches,
  resolveAuditionTimeForCalendar,
  resolveCalendarSlotDateKey,
  resolveCalendarSlotStatus,
  syncAuditionSlotCacheOnUpdate,
} from "./auditionSchedule.ts";

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

const parseTestOutcome = (val) => {
  if (typeof val !== "string") return null;
  if (
    [
      "registered",
      "schedule-followup",
      "paid-trial",
      "joining-later",
      "no-show",
      "booked",
      "closed",
    ].includes(val)
  ) {
    return val;
  }
  return null;
};

describe("auditionSchedule", () => {
  it("normalizes 12h and 24h audition times consistently", () => {
    assert.equal(normalizeAuditionTimeLabel("5:00 pm"), "05:00 PM");
    assert.equal(normalizeAuditionTimeLabel("05:30PM · Piano"), "05:30 PM");
    assert.equal(normalizeAuditionTimeLabel("17:30 · Violin"), "05:30 PM");
    assert.equal(normalizeAuditionTimeLabel("09:05"), "09:05 AM");
    assert.equal(normalizeAuditionTimeLabel("no time here"), "");
  });

  it("extracts explicit time from followUpNote before notes and resolves calendar time fallback", () => {
    assert.equal(
      extractExplicitAuditionTime({
        followUpNote: "6:30 pm · Guitar",
        notes: "Called at 11:00 AM",
      }),
      "06:30 PM"
    );
    assert.equal(
      extractExplicitAuditionTime({
        followUpNote: "Call mother later",
        notes: "No time yet",
      }),
      ""
    );
    assert.equal(
      resolveAuditionTimeForCalendar({
        followUpNote: "07:00 PM · Piano",
        notes: "",
        lastMessageAt: 1700000000000,
      }),
      "07:00 PM"
    );
  });

  it("extracts note suffix after leading time and preserves non-standard times in select options", () => {
    assert.equal(extractAuditionNoteSuffix("06:00 PM · Violin", "Piano"), "Violin");
    assert.equal(extractAuditionNoteSuffix("06:00 PM", "Piano"), "Piano");
    assert.equal(extractAuditionNoteSuffix("Joining Later - Follow up", "Piano"), "Piano");

    const options = getAuditionTimeSelectOptions("11:30 AM");
    assert.equal(options[0], "11:30 AM");
    assert.equal(options.includes("05:00 PM"), true);
  });

  it("builds reschedule modal defaults from stored auditionDate even when followUpDate differs or was cleared", () => {
    const defaults = buildBookingModalDefaults(
      {
        id: "lead_1",
        auditionDate: "2026-11-24",
        followUpDate: "",
        followUpNote: "5:30 PM · Violin",
        branch: "Riyadh Park Mall (Riyadh)",
        formAnswers: { instrument: "Piano" },
      },
      "2026-11-18"
    );

    assert.deepEqual(defaults, {
      date: "2026-11-24",
      time: "05:30 PM",
      notes: "Violin",
      branch: "Riyadh Park Mall (Riyadh)",
    });

    const withDifferentFollowUp = buildBookingModalDefaults(
      {
        id: "lead_2",
        auditionDate: "2026-11-20",
        followUpDate: "2026-11-29",
        followUpNote: "Call later",
        branch: "Online",
        formAnswers: { instrument: "Guitar" },
      },
      "2026-11-18"
    );
    assert.equal(withDifferentFollowUp.date, "2026-11-20");
    assert.equal(withDifferentFollowUp.time, "05:00 PM");
    assert.equal(withDifferentFollowUp.notes, "Guitar");
  });

  it("builds reschedule PATCH that resets stale outcome, follow-up completion, and [No-Show] tags", () => {
    const patch = buildAuditionBookingPatch(
      { notes: "Parent confirmed [No-Show]" },
      {
        date: "2026-11-26",
        time: "7:30 pm",
        notes: "Piano",
        branch: "Ajdan Walk (Khobar)",
      }
    );

    assert.deepEqual(patch, {
      pipeline: "Audition Booked",
      auditionDate: "2026-11-26",
      followUpDate: "2026-11-26",
      followUpNote: "07:30 PM · Piano",
      branch: "Ajdan Walk (Khobar)",
      auditionOutcome: "",
      followUpCompleted: false,
      followUpCompletedAt: null,
      notes: "Parent confirmed",
    });
  });

  it("synchronizes localStorage slot caches on reschedule and emits cache update event", () => {
    const storage = createMemoryStorage({
      [AUDITION_LOCKED_DATES_KEY]: JSON.stringify({
        lead_1: "2026-11-18",
        "crm-lead_1": "2026-11-18",
        other: "2026-11-19",
      }),
      [AUDITION_STATUS_OVERRIDES_KEY]: JSON.stringify({
        lead_1: "no-show",
        "crm-lead_1": "no-show",
        other: "registered",
      }),
      [AUDITION_CLOSED_SLOTS_KEY]: JSON.stringify({
        "crm-lead_1": true,
        other: true,
      }),
    });

    const dispatched = [];
    syncAuditionSlotCacheOnUpdate("lead_1", {
      auditionDate: "2026-11-25",
      clearStatusOverride: true,
      clearClosedSlot: true,
      storage,
      dispatchEvent: (evt) => {
        dispatched.push(evt.type);
        return true;
      },
    });

    assert.deepEqual(JSON.parse(storage.getItem(AUDITION_LOCKED_DATES_KEY)), {
      lead_1: "2026-11-25",
      "crm-lead_1": "2026-11-25",
      other: "2026-11-19",
    });
    assert.deepEqual(JSON.parse(storage.getItem(AUDITION_STATUS_OVERRIDES_KEY)), {
      other: "registered",
    });
    assert.deepEqual(JSON.parse(storage.getItem(AUDITION_CLOSED_SLOTS_KEY)), {
      other: true,
    });
    assert.deepEqual(dispatched, [AUDITION_CACHE_UPDATED_EVENT]);
  });

  it("prioritizes real stored auditionDate and auditionOutcome over stale local cache on Auditions screen", () => {
    const conv = {
      id: "lead_99",
      pipeline: "Audition Booked",
      auditionDate: "2026-11-27",
      auditionOutcome: "",
      followUpDate: "2026-11-27",
      followUpNote: "08:00 PM · Violin",
      notes: "Some [No-Show] text left over",
    };

    const resolvedDate = resolveCalendarSlotDateKey(
      conv,
      { lead_99: "2026-11-18", "crm-lead_99": "2026-11-18" },
      "2026-11-18"
    );
    assert.equal(resolvedDate, "2026-11-27");

    const resolvedStatus = resolveCalendarSlotStatus(
      conv,
      { lead_99: "no-show", "crm-lead_99": "no-show" },
      {},
      parseTestOutcome
    );
    assert.equal(resolvedStatus, "booked");

    const registeredConv = {
      id: "lead_100",
      pipeline: "Enrolled",
      auditionDate: "2026-11-21",
      auditionOutcome: "registered",
    };
    assert.equal(
      resolveCalendarSlotStatus(
        registeredConv,
        { "crm-lead_100": "no-show" },
        {},
        parseTestOutcome
      ),
      "registered"
    );
  });

  it("reconciles stale local caches when conversations are rescheduled or auditions are removed", () => {
    const res = reconcileAuditionLocalCaches(
      [
        {
          id: "rescheduled_1",
          pipeline: "Audition Booked",
          auditionDate: "2026-11-28",
          auditionOutcome: "",
        },
        {
          id: "removed_2",
          pipeline: "Contacted",
          auditionDate: "",
          auditionOutcome: "",
        },
      ],
      {
        auditionDates: {
          rescheduled_1: "2026-11-18",
          "crm-rescheduled_1": "2026-11-18",
          "crm-removed_2": "2026-11-19",
        },
        statusOverrides: {
          "crm-rescheduled_1": "no-show",
          "crm-removed_2": "registered",
        },
      },
      parseTestOutcome,
      (c) => c.pipeline === "Audition Booked" || Boolean(c.auditionDate)
    );

    assert.equal(res.changed, true);
    assert.deepEqual(res.auditionDates, {
      rescheduled_1: "2026-11-28",
      "crm-rescheduled_1": "2026-11-28",
    });
    assert.deepEqual(res.statusOverrides, {});
  });
});

