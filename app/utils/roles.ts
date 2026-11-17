export type CanonicalRole =
  | "chairman"
  | "enrollment_director"
  | "admission_officer"
  | "admission_advanced"
  | "finance"
  | "marketing";

export type Role =
  | CanonicalRole
  | "owner"
  | "manager"
  | "agent"
  | "analyst";

export interface RoleOption {
  value: CanonicalRole;
  label: string;
  chairmanOnly?: boolean;
}

export const ROLE_OPTIONS: ReadonlyArray<RoleOption> = [
  { value: "admission_officer", label: "Admission Officer" },
  { value: "admission_advanced", label: "Admission (Advanced)" },
  { value: "enrollment_director", label: "Enrollment Director" },
  { value: "finance", label: "Finance" },
  { value: "marketing", label: "Marketing" },
  { value: "chairman", label: "Chairman", chairmanOnly: true },
];

const ROLE_DISPLAY_NAMES: Record<CanonicalRole, string> = {
  chairman: "Chairman",
  enrollment_director: "Enrollment Director",
  admission_officer: "Admission Officer",
  admission_advanced: "Admission (Advanced)",
  finance: "Finance",
  marketing: "Marketing",
};

/** Maps legacy or display-formatted role strings to a canonical CRM role. */
export function normalizeRole(role?: string): CanonicalRole {
  if (!role) return "admission_officer";
  const r = role.toLowerCase().trim();
  if (r === "chairman" || r === "owner" || r === "manager") return "chairman";
  if (r === "enrollment_director") return "enrollment_director";
  if (r === "admission_officer" || r === "agent") return "admission_officer";
  if (r === "admission_advanced" || r === "admission (advanced)") return "admission_advanced";
  if (r === "finance" || r === "analyst") return "finance";
  if (r === "marketing") return "marketing";
  return "admission_officer";
}

/** Returns the human-readable UI label for a CRM role, defaulting unknown inputs to Admission Officer. */
export function getRoleDisplayName(role?: string): string {
  return ROLE_DISPLAY_NAMES[normalizeRole(role)] || "Admission Officer";
}

/** Formats a staff role for display while preserving unrecognized historical role strings. */
export function formatRoleLabel(role?: string): string {
  if (!role) return "Admission Officer";
  const r = role.toLowerCase().trim();
  if (r === "chairman" || r === "owner" || r === "manager") return "Chairman";
  if (r === "enrollment_director") return "Enrollment Director";
  if (r === "admission_officer" || r === "agent") return "Admission Officer";
  if (r === "admission_advanced" || r === "admission (advanced)") return "Admission (Advanced)";
  if (r === "finance" || r === "analyst") return "Finance";
  if (r === "marketing") return "Marketing";
  return role.replace(/_/g, " ");
}

/** Returns true if the role is restricted to view-only CRM access. */
export function isReadOnlyRole(role?: string): boolean {
  return normalizeRole(role) === "marketing";
}

/** Returns true if the role can create, edit, or remove team members and branches. */
export function canManageTeamRole(role?: string): boolean {
  return normalizeRole(role) === "chairman";
}

/** Returns true for Chairman or Enrollment Director roles (unrestricted lead assignment). */
export function isDirectorOrChairmanRole(role?: string): boolean {
  if (!role) return false;
  const norm = normalizeRole(role);
  return norm === "chairman" || norm === "enrollment_director";
}

/** Returns true for Admission roles (standard or advanced) that handle inbox/self-assignment. */
export function isAdmissionRole(role?: string): boolean {
  if (!role) return false;
  const norm = normalizeRole(role);
  return norm === "admission_officer" || norm === "admission_advanced";
}

/** Returns true if users with this role should appear in lead-assignment dropdowns. */
export function isAssignableRole(role?: string): boolean {
  return isDirectorOrChairmanRole(role) || isAdmissionRole(role);
}

/** Enforces route-level RBAC for sidebar navigation and page guards. */
export function canAccessRoute(role: string | undefined, pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/profile") return true;
  const norm = normalizeRole(role);

  if (pathname === "/claude-leads" || pathname.startsWith("/claude-leads/")) {
    return norm === "chairman";
  }

  if (norm === "chairman" || norm === "marketing") {
    return true;
  }

  if (norm === "admission_advanced") {
    return true;
  }

  if (norm === "enrollment_director") {
    return pathname === "/auditions" || pathname === "/settings";
  }

  if (norm === "finance") {
    return pathname === "/pipeline" || pathname === "/reports" || pathname === "/settings";
  }

  if (norm === "admission_officer") {
    return pathname !== "/reports" && pathname !== "/team-performance";
  }

  return true;
}

/** Returns the landing route after login or unauthorized route redirect for a role. */
export function getDefaultRouteForRole(role?: string): string {
  const norm = normalizeRole(role);
  switch (norm) {
    case "enrollment_director":
      return "/auditions";
    case "finance":
      return "/pipeline";
    case "admission_officer":
    case "admission_advanced":
    case "chairman":
    case "marketing":
    default:
      return "/";
  }
}

export type SettingsTeamGroupKey = "chairman" | "admissions" | "other";

export interface SettingsTeamGroup<T> {
  key: SettingsTeamGroupKey;
  label: string;
  members: T[];
}

export interface RoleSortableMember {
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
}

const SETTINGS_ROLE_SORT_RANK: Record<CanonicalRole, number> = {
  chairman: 0,
  admission_advanced: 1,
  admission_officer: 2,
  enrollment_director: 3,
  finance: 4,
  marketing: 5,
};

const SETTINGS_GROUP_META: ReadonlyArray<{ key: SettingsTeamGroupKey; label: string }> = [
  { key: "chairman", label: "Chairman" },
  { key: "admissions", label: "Admissions" },
  { key: "other", label: "Other Roles" },
];

/** Compares two team members by active state (active first), role hierarchy (Chairman, Admissions, other roles), and name. */
export function compareTeamMembersByRole(a: RoleSortableMember, b: RoleSortableMember): number {
  const aActive = a.active !== false;
  const bActive = b.active !== false;
  if (aActive !== bActive) return aActive ? -1 : 1;

  const rankDiff =
    SETTINGS_ROLE_SORT_RANK[normalizeRole(a.role)] - SETTINGS_ROLE_SORT_RANK[normalizeRole(b.role)];
  if (rankDiff !== 0) return rankDiff;

  const nameCompare = (a.name || "").trim().localeCompare((b.name || "").trim(), undefined, {
    sensitivity: "base",
  });
  if (nameCompare !== 0) return nameCompare;

  return (a.email || "").trim().localeCompare((b.email || "").trim(), undefined, {
    sensitivity: "base",
  });
}

/** Groups Settings team members into Chairman, Admissions, and Other Roles with deactivated accounts at the end of their own role group. */
export function organizeTeamMembersByRole<T extends RoleSortableMember>(
  members: ReadonlyArray<T>
): SettingsTeamGroup<T>[] {
  const buckets: Record<SettingsTeamGroupKey, T[]> = {
    chairman: [],
    admissions: [],
    other: [],
  };

  for (const member of [...members].sort(compareTeamMembersByRole)) {
    const norm = normalizeRole(member.role);
    if (norm === "chairman") {
      buckets.chairman.push(member);
    } else if (norm === "admission_advanced" || norm === "admission_officer") {
      buckets.admissions.push(member);
    } else {
      buckets.other.push(member);
    }
  }

  return SETTINGS_GROUP_META.filter(({ key }) => buckets[key].length > 0).map(({ key, label }) => ({
    key,
    label,
    members: buckets[key],
  }));
}

