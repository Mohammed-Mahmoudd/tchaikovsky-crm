import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapAuthCodeToLogoutReason, getLogoutReasonMessage } from "./authSessionNotice.ts";

describe("authSessionNotice helpers", () => {
  it("maps backend auth codes to explicit logout reasons", () => {
    assert.equal(mapAuthCodeToLogoutReason("ACCOUNT_DEACTIVATED"), "deactivated");
    assert.equal(mapAuthCodeToLogoutReason("USER_NOT_FOUND"), "deleted");
    assert.equal(mapAuthCodeToLogoutReason("SESSION_REVOKED"), "session_revoked");
    assert.equal(mapAuthCodeToLogoutReason("INVALID_TOKEN"), "session_expired");
    assert.equal(mapAuthCodeToLogoutReason(undefined), "session_expired");
  });

  it("returns user-facing notices only for forced or expired session reasons", () => {
    assert.match(getLogoutReasonMessage("deactivated") || "", /deactivated/i);
    assert.match(getLogoutReasonMessage("deleted") || "", /removed/i);
    assert.match(getLogoutReasonMessage("session_revoked") || "", /sign in again/i);
    assert.match(getLogoutReasonMessage("session_expired") || "", /expired/i);
    assert.equal(getLogoutReasonMessage("manual"), null);
    assert.equal(getLogoutReasonMessage(null), null);
  });
});

