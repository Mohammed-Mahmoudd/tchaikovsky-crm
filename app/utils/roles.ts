export type CanonicalRole =
  | "chairman"
  | "enrollment_director"
  | "admission_officer"
  | "admission_advanced"
  | "finance"
  | "marketing"
  | "operation";

export type Role =
  | CanonicalRole
  | "owner"
  | "manager"
  | "agent"
  | "analyst";

export type InboxScope = "admissions" | "operation";

export interface RoleOption {
  value: CanonicalRole;
  label: string;
  chairmanOnly?: boolean;
}

export const ROLE_OPTIONS: ReadonlyArray<RoleOption> = [
  { value: "admission_officer", label: "Admission Officer" },
  { value: "admission_advanced", label: "Admission (Advanced)" },
  { value: "operation", label: "Operation" },
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
  operation: "Operation",
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
  if (r === "operation" || r === "operations" || r === "operation team" || r === "operation_team" || r === "ops") {
    return "operation";
  }
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
  if (r === "operation" || r === "operations" || r === "operation team" || r === "operation_team" || r === "ops") {
    return "Operation";
  }
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

/** Returns true if users with this role belong to the dedicated Operations team. */
export function isOperationRole(role?: string): boolean {
  if (!role) return false;
  return normalizeRole(role) === "operation";
}

/** Returns true if users with this role can view the specified inbox (`admissions` vs `operation`). */
export function canAccessInbox(role?: string, inbox: InboxScope = "admissions"): boolean {
  const norm = normalizeRole(role);
  if (inbox === "operation") {
    return norm === "chairman" || norm === "operation";
  }
  return (
    norm === "chairman" ||
    norm === "admission_officer" ||
    norm === "admission_advanced" ||
    norm === "marketing"
  );
}

/** Returns true if this role accesses the Inbox strictly in view-only mode (cannot message or mutate Inbox state). */
export function isInboxViewOnlyRole(role?: string): boolean {
  const norm = normalizeRole(role);
  return norm === "marketing" || norm === "enrollment_director";
}

/** Returns true if users with this role can receive CRM conversation data for the given inbox. */
export function canAccessConversationInboxData(role?: string, inbox: InboxScope = "admissions"): boolean {
  const norm = normalizeRole(role);
  if (norm === "chairman") return true;
  if (norm === "operation") return inbox === "operation";
  return inbox === "admissions";
}

/** Returns true if this role may send, edit, unsend, react to, or sync chat messages. */
export function canSendChatMessagesRole(role?: string): boolean {
  const norm = normalizeRole(role);
  return norm !== "marketing" && norm !== "enrollment_director";
}

/** Returns true if this role may export or download full chat transcripts from the Inbox (Chairman roles only). */
export function canDownloadChatRole(role?: string): boolean {
  return Boolean(role) && normalizeRole(role) === "chairman";
}

/** Returns true if this role sees Agent Name and Branch pills inside Audition calendar cards. */
export function shouldShowAuditionCardAgentAndBranch(role?: string): boolean {
  return normalizeRole(role) !== "enrollment_director";
}

/** Returns true if this role sees and can edit Assigned Agent controls inside Audition modals and forms. */
export function canAssignAuditionAgentRole(role?: string): boolean {
  return normalizeRole(role) !== "enrollment_director";
}

/** Returns true if this role sees and can open conversation chat from Audition cards and modals. */
export function canOpenAuditionChatRole(role?: string): boolean {
  return normalizeRole(role) !== "enrollment_director";
}

/** Returns true if this role sees and can filter the Auditions calendar by agent. */
export function canFilterAuditionsByAgentRole(role?: string): boolean {
  return normalizeRole(role) !== "enrollment_director";
}

/** Returns true if this role can choose or edit a lead's branch inside the Audition details modal. */
export function canEditAuditionBranchRole(role?: string): boolean {
  return normalizeRole(role) !== "enrollment_director";
}

/** Returns true if this role gets the view-only Lead Info sidebar trigger on Audition cards. */
export function canViewDirectorLeadInfoSidebarRole(role?: string): boolean {
  return normalizeRole(role) === "enrollment_director";
}

/** Returns true if users with this role should appear in assignment dropdowns for Admissions. */
export function isAssignableRole(role?: string): boolean {
  return isDirectorOrChairmanRole(role) || isAdmissionRole(role);
}

/** Returns true if users with this role can be assigned inside the given inbox. */
export function isAssignableForInbox(role?: string, inbox: InboxScope = "admissions"): boolean {
  if (inbox === "operation") {
    const norm = normalizeRole(role);
    return Boolean(role) && (norm === "chairman" || norm === "operation");
  }
  return isAssignableRole(role);
}

/** Enforces route-level RBAC for sidebar navigation and page guards. */
export function canAccessRoute(role: string | undefined, pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/profile") return true;
  const norm = normalizeRole(role);

  if (pathname === "/operation-inbox" || pathname.startsWith("/operation-inbox/")) {
    return norm === "chairman" || norm === "operation";
  }

  if (norm === "operation") {
    return pathname === "/settings";
  }

  if (
    pathname === "/agent" ||
    pathname.startsWith("/agent/") ||
    pathname === "/claude-leads" ||
    pathname.startsWith("/claude-leads/")
  ) {
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
    case "operation":
      return "/operation-inbox";
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

export type SettingsTeamGroupKey = "chairman" | "admissions" | "operation" | "other";

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
  operation: 3,
  enrollment_director: 4,
  finance: 5,
  marketing: 6,
};

const SETTINGS_GROUP_META: ReadonlyArray<{ key: SettingsTeamGroupKey; label: string }> = [
  { key: "chairman", label: "Chairman" },
  { key: "admissions", label: "Admissions" },
  { key: "operation", label: "Operation" },
  { key: "other", label: "Other Roles" },
];

/** Compares two team members by active state (active first), role hierarchy, and name. */
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

/** Groups Settings team members into Chairman, Admissions, Operation, and Other Roles with deactivated accounts at the end of their own group. */
export function organizeTeamMembersByRole<T extends RoleSortableMember>(
  members: ReadonlyArray<T>
): SettingsTeamGroup<T>[] {
  const buckets: Record<SettingsTeamGroupKey, T[]> = {
    chairman: [],
    admissions: [],
    operation: [],
    other: [],
  };

  for (const member of [...members].sort(compareTeamMembersByRole)) {
    const norm = normalizeRole(member.role);
    if (norm === "chairman") {
      buckets.chairman.push(member);
    } else if (norm === "admission_advanced" || norm === "admission_officer") {
      buckets.admissions.push(member);
    } else if (norm === "operation") {
      buckets.operation.push(member);
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

export interface PatchableTeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  branch?: string;
  avatar?: string;
  active: boolean;
}

export interface MemberPatchResponsePayload {
  success?: boolean;
  error?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    branch?: string;
    avatar?: string;
    active?: boolean;
  };
}

export type ReconcileMemberPatchResult<T extends PatchableTeamMember> =
  | { ok: true; member: T }
  | { ok: false; member: T; error: string };

/**
 * Reconciles a team-member PATCH response against the requested changes so
 * silent backend rejections or unrecognized roles never leave stale UI state.
 */
export function reconcileMemberPatchResponse<T extends PatchableTeamMember>({
  previousMember,
  requestedRole,
  requestedBranch,
  resOk,
  payload,
}: {
  previousMember: T;
  requestedRole?: Role;
  requestedBranch?: string;
  resOk: boolean;
  payload: MemberPatchResponsePayload | null | undefined;
}): ReconcileMemberPatchResult<T> {
  if (!resOk || !payload?.success || !payload.user) {
    return {
      ok: false,
      member: previousMember,
      error: payload?.error || "Failed to update member.",
    };
  }

  const persistedRole = normalizeRole(payload.user.role || previousMember.role);
  const persistedBranch =
    persistedRole === "enrollment_director"
      ? typeof payload.user.branch === "string"
        ? payload.user.branch.trim()
        : previousMember.branch || ""
      : "";
  const persistedMember: T = {
    ...previousMember,
    name: typeof payload.user.name === "string" ? payload.user.name : previousMember.name,
    email: typeof payload.user.email === "string" ? payload.user.email : previousMember.email,
    role: persistedRole,
    branch: persistedBranch,
    avatar: payload.user.avatar !== undefined ? payload.user.avatar : previousMember.avatar,
    active: payload.user.active !== undefined ? Boolean(payload.user.active) : previousMember.active,
  };

  if (requestedRole !== undefined && persistedRole !== normalizeRole(requestedRole)) {
    return {
      ok: false,
      member: persistedMember,
      error: `Role did not change to "${getRoleDisplayName(requestedRole)}" (server kept "${getRoleDisplayName(persistedRole)}"). Ensure the latest backend is deployed.`,
    };
  }

  if (
    requestedBranch !== undefined &&
    persistedRole === "enrollment_director" &&
    persistedBranch !== requestedBranch.trim()
  ) {
    return {
      ok: false,
      member: persistedMember,
      error: `Branch did not change to "${requestedBranch.trim()}" (server kept "${persistedBranch || "Unassigned"}").`,
    };
  }

  return { ok: true, member: persistedMember };
}

