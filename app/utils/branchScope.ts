export function normalizeBranchText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/\bal[\s-]*khobar\b/g, "khobar")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBranchRegion(value: unknown): string {
  const norm = normalizeBranchText(value);
  if (!norm) return "";
  const match = norm.match(/\(([^)]+)\)\s*$/);
  return match ? normalizeBranchText(match[1]) : "";
}

export function stripBranchRegion(value: unknown): string {
  const norm = normalizeBranchText(value);
  if (!norm) return "";
  return norm.replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
}

const SINGLE_BRANCH_CITY_REGIONS = new Set(["khobar"]);

/**
 * Returns true when a slot/conversation branch belongs to the Enrollment Director's assigned branch.
 * Rejects unassigned directors and never matches sibling compounds in multi-branch cities like Riyadh.
 */
export function matchesAssignedBranch(
  conversationBranch: unknown,
  assignedBranch: unknown
): boolean {
  const convNorm = normalizeBranchText(conversationBranch);
  const assignedNorm = normalizeBranchText(assignedBranch);
  if (!convNorm || !assignedNorm) return false;

  if (convNorm === assignedNorm) return true;

  const convCore = stripBranchRegion(convNorm);
  const assignedCore = stripBranchRegion(assignedNorm);
  const convRegion = extractBranchRegion(convNorm);
  const assignedRegion = extractBranchRegion(assignedNorm);

  if (convCore && assignedCore && convCore === assignedCore) {
    if (convRegion && assignedRegion && convRegion !== assignedRegion) {
      return false;
    }
    return true;
  }

  const cleanedConvCore = convCore
    .replace(/\bbranch\b/g, "")
    .replace(/[-/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanedAssignedCore = assignedCore
    .replace(/\bbranch\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    cleanedConvCore &&
    cleanedAssignedCore &&
    cleanedAssignedCore.length >= 4 &&
    (cleanedConvCore === cleanedAssignedCore || cleanedConvCore.includes(cleanedAssignedCore))
  ) {
    if (!convRegion || !assignedRegion || convRegion === assignedRegion) {
      return true;
    }
  }

  const effectiveAssignedRegion = assignedRegion || assignedNorm;
  if (SINGLE_BRANCH_CITY_REGIONS.has(effectiveAssignedRegion)) {
    const cityOnlyConv = cleanedConvCore || convRegion;
    if (cityOnlyConv === effectiveAssignedRegion) {
      return true;
    }
  }

  return false;
}

export interface BranchScopedConversationLike {
  id: string;
  inbox?: string;
  whatsappAccount?: string;
  branch?: string;
  pipeline?: string;
  auditionOutcome?: string;
  auditionDate?: string;
  followUpDate?: string;
  notes?: string;
  formAnswers?: {
    instrument?: string;
  };
}

function isEnrollmentDirectorRoleString(role: unknown): boolean {
  if (typeof role !== "string") return false;
  const clean = role.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  return clean === "enrollment director" || clean === "enrollment_director" || role.toLowerCase().trim() === "enrollment_director";
}

function isAdmissionsInboxConv(conv: BranchScopedConversationLike): boolean {
  const inbox = String(conv.inbox || "").toLowerCase().trim();
  const wa = String(conv.whatsappAccount || "").toLowerCase().trim();
  if (inbox === "operation" || wa === "operation") return false;
  if (typeof conv.id === "string" && conv.id.startsWith("op_")) return false;
  return true;
}

function isLiveAuditionForDirector(
  c: BranchScopedConversationLike,
  statusOverrides: Readonly<Record<string, unknown>>,
  auditionDates: Readonly<Record<string, string>>
): boolean {
  return (
    c.pipeline === "Audition Booked" ||
    c.pipeline === "Attended" ||
    c.pipeline === "Enrolled" ||
    (Boolean(c.auditionOutcome) &&
      (c.auditionOutcome !== "joining-later" ||
        Boolean(c.auditionDate) ||
        Boolean(auditionDates[c.id]) ||
        Boolean(auditionDates[`crm-${c.id}`]))) ||
    statusOverrides[c.id] !== undefined ||
    statusOverrides[`crm-${c.id}`] !== undefined ||
    (c.pipeline === "Contacted" && Boolean(c.auditionDate)) ||
    (c.pipeline === "Qualified" && Boolean(c.auditionDate)) ||
    (c.pipeline === "Joining Later" && Boolean(c.auditionDate)) ||
    (c.pipeline === "Lost" &&
      (Boolean(c.auditionDate) ||
        Boolean(c.followUpDate) ||
        Boolean(c.notes) ||
        Boolean(c.formAnswers?.instrument)))
  );
}

/**
 * Authorizes whether a conversation record may remain in client state for the active user.
 * Non-director roles are governed by inbox RBAC; Enrollment Directors only receive Admissions
 * audition records matching their assigned branch.
 */
export function canUserViewConversationInStore(
  conv: BranchScopedConversationLike,
  user: { role?: string; branch?: string } | null | undefined,
  statusOverrides: Readonly<Record<string, unknown>> = {},
  auditionDates: Readonly<Record<string, string>> = {}
): boolean {
  if (!user) return false;
  if (!isEnrollmentDirectorRoleString(user.role)) {
    return true;
  }

  const assignedBranch = typeof user.branch === "string" ? user.branch.trim() : "";
  if (!assignedBranch) return false;
  if (!isAdmissionsInboxConv(conv)) return false;
  if (!isLiveAuditionForDirector(conv, statusOverrides, auditionDates)) return false;

  return matchesAssignedBranch(conv.branch, assignedBranch);
}
