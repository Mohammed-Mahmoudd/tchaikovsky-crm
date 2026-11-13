import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_OPTIONS,
  canAccessRoute,
  canManageTeamRole,
  formatRoleLabel,
  getDefaultRouteForRole,
  getRoleDisplayName,
  isAdmissionRole,
  isAssignableRole,
  isDirectorOrChairmanRole,
  isReadOnlyRole,
  normalizeRole,
} from "./roles.ts";

describe("CRM roles & permissions", () => {
  it("normalizes and formats Admission (Advanced) consistently", () => {
    assert.equal(normalizeRole("admission_advanced"), "admission_advanced");
    assert.equal(normalizeRole("Admission (Advanced)"), "admission_advanced");
    assert.equal(getRoleDisplayName("admission_advanced"), "Admission (Advanced)");
    assert.equal(formatRoleLabel("admission_advanced"), "Admission (Advanced)");
    assert.equal(formatRoleLabel("custom_role"), "custom role");
    assert.equal(
      ROLE_OPTIONS.some((opt) => opt.value === "admission_advanced" && opt.label === "Admission (Advanced)"),
      true
    );
  });

  it("grants Admission (Advanced) reports and team-performance access plus all admission routes", () => {
    const admissionRoutes = ["/", "/pipeline", "/leads", "/auditions", "/follow-ups", "/profile", "/settings"];
    for (const route of admissionRoutes) {
      assert.equal(canAccessRoute("admission_officer", route), true, `admission_officer should access ${route}`);
      assert.equal(canAccessRoute("admission_advanced", route), true, `admission_advanced should access ${route}`);
    }

    assert.equal(canAccessRoute("admission_officer", "/reports"), false);
    assert.equal(canAccessRoute("admission_officer", "/team-performance"), false);

    assert.equal(canAccessRoute("admission_advanced", "/reports"), true);
    assert.equal(canAccessRoute("admission_advanced", "/team-performance"), true);
    assert.equal(getDefaultRouteForRole("admission_advanced"), "/");
  });

  it("keeps Admission (Advanced) non-readonly, assignable, and with standard admission assignment scope", () => {
    assert.equal(isReadOnlyRole("admission_advanced"), false);
    assert.equal(canManageTeamRole("admission_advanced"), false);
    assert.equal(isDirectorOrChairmanRole("admission_advanced"), false);
    assert.equal(isAdmissionRole("admission_advanced"), true);
    assert.equal(isAssignableRole("admission_advanced"), true);

    assert.equal(isAdmissionRole(undefined), false);
    assert.equal(isDirectorOrChairmanRole(undefined), false);
    assert.equal(isAssignableRole("marketing"), false);
    assert.equal(isAssignableRole("finance"), false);
    assert.equal(isDirectorOrChairmanRole("enrollment_director"), true);
    assert.equal(isDirectorOrChairmanRole("chairman"), true);
  });
});

