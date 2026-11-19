const PLACEHOLDER_LEAD_NAMES = new Set([
  "WhatsApp User",
  "WhatsApp Contact",
  "Messenger User",
  "Instagram User",
]);

const E164_PHONE_REGEX = /^\+\d{7,13}$/;
const DIGITS_ONLY_REGEX = /^\+?\d+$/;
const MAX_LEAD_NAME_LENGTH = 120;

export interface RawConversationLeadFields {
  channel?: unknown;
  name?: unknown;
  leadName?: unknown;
  phone?: unknown;
  senderId?: unknown;
  source?: unknown;
}

export interface ResolvedConversationLeadNames {
  name: string;
  leadName?: string;
  profileName?: string;
}

export interface LeadNameSource {
  leadName?: string;
  profileName?: string;
  name?: string;
  phone?: string;
  id?: string;
}

export type LeadNameValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Return true if the value is empty, a generic channel placeholder, or pure digits/phone.
 */
export function isPlaceholderLeadName(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_LEAD_NAMES.has(trimmed)) return true;
  if (DIGITS_ONLY_REGEX.test(trimmed)) return true;
  return false;
}

function cleanRealLeadName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderLeadName(trimmed)) return undefined;
  return trimmed;
}

/**
 * Return true when an agent explicitly edited/confirmed this conversation's lead name.
 */
export function hasAgentEditedLeadName(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  const record = source as Record<string, unknown>;
  if (cleanRealLeadName(record.editedLeadName)) return true;
  return record.leadNameEdited === true;
}

/**
 * Extract the agent-edited lead name stored on `source` (if any).
 */
export function getAgentEditedLeadName(raw: RawConversationLeadFields): string | undefined {
  if (!raw.source || typeof raw.source !== "object") return undefined;
  const record = raw.source as Record<string, unknown>;
  const fromSource = cleanRealLeadName(record.editedLeadName);
  if (fromSource) return fromSource;
  if (record.leadNameEdited === true) {
    return cleanRealLeadName(raw.leadName) || cleanRealLeadName(raw.name);
  }
  return undefined;
}

/**
 * Resolve normalized `name`, `leadName`, and `profileName` fields for a conversation.
 *
 * On WhatsApp, unedited leads always display their phone number across Inbox list,
 * Pipeline cards, and Audition slots—even when a Meta Lead Form or WhatsApp push-name
 * populated `leadName`/`name`. Only when an agent explicitly edits the lead name
 * does the edited name replace the phone number across all screens.
 */
export function resolveConversationLeadNames(
  raw: RawConversationLeadFields
): ResolvedConversationLeadNames {
  const agentEditedName = getAgentEditedLeadName(raw);
  if (agentEditedName) {
    return {
      name: agentEditedName,
      leadName: agentEditedName,
      profileName: agentEditedName,
    };
  }

  const realLeadName = cleanRealLeadName(raw.leadName);
  const channel = typeof raw.channel === "string" ? raw.channel : "";

  if (channel === "WA") {
    const phoneStr = typeof raw.phone === "string" ? raw.phone.trim() : "";
    const senderDigits = String(raw.senderId || "")
      .replace(/^op_/, "")
      .replace(/\D/g, "");
    const pushName = cleanRealLeadName(raw.name);

    let resolvedName = "WhatsApp Contact";
    if (E164_PHONE_REGEX.test(phoneStr)) {
      resolvedName = phoneStr;
    } else if (senderDigits.length >= 7 && senderDigits.length <= 13) {
      resolvedName = `+${senderDigits}`;
    } else if (pushName) {
      resolvedName = pushName;
    }

    return {
      name: resolvedName,
      profileName: realLeadName || pushName,
      leadName: realLeadName,
    };
  }

  const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
  const isFakeLid = /^\+\d{13,}$/.test(rawName);
  const isNonHuman =
    !rawName || PLACEHOLDER_LEAD_NAMES.has(rawName) || isFakeLid || DIGITS_ONLY_REGEX.test(rawName);

  if (!isNonHuman) {
    return {
      name: rawName,
      profileName: realLeadName,
      leadName: realLeadName,
    };
  }

  if (channel === "FB") {
    return {
      name: realLeadName || rawName || "Messenger User",
      profileName: realLeadName,
      leadName: realLeadName,
    };
  }
  if (channel === "IG") {
    return {
      name: realLeadName || rawName || "Instagram User",
      profileName: realLeadName,
      leadName: realLeadName,
    };
  }

  const validPhone =
    typeof raw.phone === "string" && E164_PHONE_REGEX.test(raw.phone.trim())
      ? raw.phone.trim()
      : null;
  const senderStr = typeof raw.senderId === "string" ? raw.senderId.replace(/^op_/, "") : "";
  const derivedDigits = senderStr.replace(/\D/g, "");
  const derivedPhone =
    senderStr && senderStr.length <= 13 && derivedDigits.length >= 7 ? `+${derivedDigits}` : null;
  const fallbackPhone = typeof raw.phone === "string" && raw.phone.trim() ? raw.phone.trim() : null;

  return {
    name:
      realLeadName ||
      validPhone ||
      (!isFakeLid && !PLACEHOLDER_LEAD_NAMES.has(rawName) && rawName ? rawName : null) ||
      derivedPhone ||
      fallbackPhone ||
      "WhatsApp Contact",
    profileName: realLeadName,
    leadName: realLeadName,
  };
}

/**
 * Compute the display name shown and edited in the lead details header.
 */
export function getEditableLeadDisplayName(source: LeadNameSource): string {
  return (
    cleanRealLeadName(source.leadName) ||
    cleanRealLeadName(source.profileName) ||
    cleanRealLeadName(source.name) ||
    (typeof source.name === "string" && source.name.trim()) ||
    (typeof source.phone === "string" && source.phone.trim()) ||
    (typeof source.id === "string" && source.id.trim()) ||
    ""
  );
}

/**
 * Validate and normalize an edited lead name before saving.
 */
export function validateLeadNameInput(raw: string): LeadNameValidationResult {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { ok: false, error: "Lead name cannot be empty." };
  }
  if (trimmed.length > MAX_LEAD_NAME_LENGTH) {
    return {
      ok: false,
      error: `Lead name must be ${MAX_LEAD_NAME_LENGTH} characters or fewer.`,
    };
  }
  if (isPlaceholderLeadName(trimmed)) {
    return {
      ok: false,
      error: "Enter a real lead name rather than a phone number or placeholder.",
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Build the update payload when an agent explicitly edits a lead name.
 */
export function buildLeadNamePatchUpdates(newName: string): {
  name: string;
  leadName: string;
  leadNameEdited: true;
} {
  return {
    name: newName,
    leadName: newName,
    leadNameEdited: true,
  };
}
