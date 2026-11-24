import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_OPTIONS,
  canAccessInbox,
  canAccessRoute,
  canManageTeamRole,
  formatRoleLabel,
  getDefaultRouteForRole,
  getRoleDisplayName,
  isAdmissionRole,
  isAssignableForInbox,
  isAssignableRole,
  isDirectorOrChairmanRole,
  isOperationRole,
  isReadOnlyRole,
  normalizeRole,
  organizeTeamMembersByRole,
  reconcileMemberPatchResponse,
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

  it("organizes Settings team members into Chairman, Admissions, and Other Roles with deactivated accounts at the end of their own role", () => {
    const sample = [
      { id: "1", name: "Ziad", email: "ziad@school.com", role: "marketing", active: true },
      { id: "2", name: "Nour", email: "nour@school.com", role: "admission_officer", active: true },
      { id: "3", name: "Old Admin", email: "old@school.com", role: "chairman", active: false },
      { id: "4", name: "Adham", email: "adham@school.com", role: "owner", active: true },
      { id: "5", name: "Mina", email: "mina@school.com", role: "finance", active: true },
      { id: "6", name: "Yara", email: "yara@school.com", role: "admission_advanced", active: true },
      { id: "7", name: "Ali", email: "ali@school.com", role: "agent", active: true },
      { id: "8", name: "Dina", email: "dina@school.com", role: "enrollment_director", active: true },
      { id: "9", name: "Old Agent", email: "oldagent@school.com", role: "admission_officer", active: false },
      { id: "10", name: "Old Finance", email: "oldfin@school.com", role: "finance", active: false },
    ];

    const groups = organizeTeamMembersByRole(sample);
    assert.deepEqual(
      groups.map((g) => ({ key: g.key, label: g.label, names: g.members.map((m) => m.name) })),
      [
        { key: "chairman", label: "Chairman", names: ["Adham", "Old Admin"] },
        { key: "admissions", label: "Admissions", names: ["Yara", "Ali", "Nour", "Old Agent"] },
        { key: "other", label: "Other Roles", names: ["Dina", "Mina", "Ziad", "Old Finance"] },
      ]
    );
  });

  it("omits empty groups when organizing team members", () => {
    const groups = organizeTeamMembersByRole([
      { id: "1", name: "Adham", email: "adham@school.com", role: "chairman", active: true },
    ]);
    assert.deepEqual(groups.map((g) => g.key), ["chairman"]);
  });

  it("restricts /agent/* and /claude-leads strictly to Chairman and legacy Manager/Owner aliases", () => {
    const agentPaths = [
      "/agent",
      "/agent/activity",
      "/agent/skills",
      "/agent/sandbox",
      "/agent/leads",
      "/agent/studio",
      "/claude-leads",
    ];
    for (const path of agentPaths) {
      assert.equal(canAccessRoute("chairman", path), true, `chairman should access ${path}`);
      assert.equal(canAccessRoute("manager", path), true, `manager should access ${path}`);
      assert.equal(canAccessRoute("owner", path), true, `owner should access ${path}`);

      for (const role of ["marketing", "admission_advanced", "admission_officer", "enrollment_director", "finance", "operation"]) {
        assert.equal(canAccessRoute(role, path), false, `${role} should not access ${path}`);
      }
    }
  });

  it("isolates Operation role to /operation-inbox, /profile, and /settings while letting Chairman access both inboxes", () => {
    assert.equal(normalizeRole("Operation"), "operation");
    assert.equal(getRoleDisplayName("operation"), "Operation");
    assert.equal(formatRoleLabel("Operations"), "Operation");
    assert.equal(isOperationRole("operation"), true);
    assert.equal(isOperationRole("chairman"), false);
    assert.equal(getDefaultRouteForRole("operation"), "/operation-inbox");

    assert.equal(canAccessRoute("operation", "/operation-inbox"), true);
    assert.equal(canAccessRoute("operation", "/profile"), true);
    assert.equal(canAccessRoute("operation", "/settings"), true);
    for (const forbidden of ["/", "/leads", "/pipeline", "/auditions", "/follow-ups", "/reports", "/team-performance", "/claude-leads"]) {
      assert.equal(canAccessRoute("operation", forbidden), false, `operation must not access ${forbidden}`);
    }

    for (const role of ["admission_officer", "admission_advanced", "marketing", "finance", "enrollment_director"]) {
      assert.equal(canAccessRoute(role, "/operation-inbox"), false, `${role} must not access /operation-inbox`);
    }
    assert.equal(canAccessRoute("chairman", "/operation-inbox"), true);
    assert.equal(canAccessRoute("chairman", "/"), true);

    assert.equal(canAccessInbox("operation", "operation"), true);
    assert.equal(canAccessInbox("operation", "admissions"), false);
    assert.equal(canAccessInbox("chairman", "operation"), true);
    assert.equal(canAccessInbox("chairman", "admissions"), true);
    assert.equal(canAccessInbox("admission_officer", "operation"), false);

    assert.equal(isAssignableForInbox("operation", "operation"), true);
    assert.equal(isAssignableForInbox("chairman", "operation"), true);
    assert.equal(isAssignableForInbox("operation", "admissions"), false);
    assert.equal(isAssignableForInbox("admission_officer", "operation"), false);

    const withOpGroups = organizeTeamMembersByRole([
      { id: "1", name: "Sara", email: "s@school.com", role: "operation", active: true },
      { id: "2", name: "Adham", email: "a@school.com", role: "chairman", active: true },
    ]);
    assert.deepEqual(
      withOpGroups.map((g) => g.key),
      ["chairman", "operation"]
    );
  });

  it("reconciles team-member PATCH responses and detects silent server role rejections", () => {
    const prev = {
      id: "u1",
      name: "Sara",
      email: "s@school.com",
      role: "admission_officer",
      active: true,
    };

    const okResult = reconcileMemberPatchResponse({
      previousMember: prev,
      requestedRole: "operation",
      resOk: true,
      payload: {
        success: true,
        user: { id: "u1", name: "Sara", email: "s@school.com", role: "operation", active: true },
      },
    });
    assert.equal(okResult.ok, true);
    assert.equal(okResult.member.role, "operation");

    // Server returned success: true but kept old role (e.g. stale backend)
    const staleBackendResult = reconcileMemberPatchResponse({
      previousMember: prev,
      requestedRole: "operation",
      resOk: true,
      payload: {
        success: true,
        user: { id: "u1", name: "Sara", email: "s@school.com", role: "admission_officer", active: true },
      },
    });
    assert.equal(staleBackendResult.ok, false);
    assert.equal(staleBackendResult.member.role, "admission_officer");
    if (!staleBackendResult.ok) {
      assert.match(staleBackendResult.error, /Operation/);
    }

    // HTTP error reverts to previousMember
    const errorResult = reconcileMemberPatchResponse({
      previousMember: prev,
      requestedRole: "operation",
      resOk: false,
      payload: { success: false, error: "Unsupported role" },
    });
    assert.equal(errorResult.ok, false);
    assert.equal(errorResult.member.role, "admission_officer");
  });
});

