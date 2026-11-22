import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMetaErrorMessage } from "./errorParser.ts";

describe("formatMetaErrorMessage", () => {
  it("prioritizes 7-day window expiration over permission error when reason is human_agent_window_expired", () => {
    const parsed = formatMetaErrorMessage({
      success: false,
      error: "Cannot reply because more than 7 days have passed since the customer's last message.",
      details: {
        code: 10,
        subcode: 2534022,
        reason: "human_agent_window_expired",
        friendlyMessage:
          "Cannot reply because more than 7 days have passed since the customer's last message. Meta's maximum 7-day Human Agent window has expired.",
        actionHint: "Reach out via WhatsApp or phone call.",
      },
    });

    assert.equal(parsed.title, "7-day reply window expired");
    assert.equal(parsed.actionHint, "Reach out via WhatsApp or phone call.");
  });

  it("shows Human Agent permission message only when approval/permission failed", () => {
    const parsed = formatMetaErrorMessage({
      success: false,
      error: "Cannot reply outside 24 hours: Your Meta App needs the 'Human Agent' feature.",
      details: {
        code: 10,
        reason: "human_agent_permission_required",
      },
    });

    assert.equal(parsed.title, "Human Agent permission required (7-day window)");
  });

  it("recognizes Instagram 24h subcode 2534022", () => {
    const parsed = formatMetaErrorMessage({
      error: {
        code: 10,
        error_subcode: 2534022,
        message: "(#10) This message is sent outside of allowed window.",
      },
    });

    assert.equal(parsed.title, "24-hour reply window expired");
  });
});

