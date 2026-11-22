export interface ParsedMetaError {
  title: string;
  message: string;
  actionHint?: string;
  code?: number;
  subcode?: number;
}

function asRecord(val: unknown): Record<string, unknown> | null {
  return val && typeof val === "object" ? (val as Record<string, unknown>) : null;
}

function asNumber(val: unknown): number | undefined {
  return typeof val === "number" && Number.isFinite(val) ? val : undefined;
}

function asString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

/**
 * Parses raw Meta API errors or server error responses into human-friendly messages
 * with clear action hints, adhering to CRM UX standards.
 */
export function formatMetaErrorMessage(errorInput: unknown): ParsedMetaError {
  if (!errorInput) {
    return {
      title: "Message could not be sent",
      message: "An unexpected error occurred while sending your message.",
      actionHint: "Please try again or check your network connection.",
    };
  }

  let parsed: unknown = errorInput;

  // Handle serialized JSON strings (e.g. '{"error":{"message":"(#551)..."}}')
  if (typeof errorInput === "string") {
    const trimmed = errorInput.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        parsed = errorInput;
      }
    }
  }

  const parsedObj = asRecord(parsed);
  const nestedErrorObj = asRecord(parsedObj?.error);
  const metaErrObj = nestedErrorObj || parsedObj;
  const details = asRecord(parsedObj?.details);

  const code = asNumber(metaErrObj?.code) ?? asNumber(details?.code);
  const subcode =
    asNumber(metaErrObj?.error_subcode) ??
    asNumber(metaErrObj?.subcode) ??
    asNumber(details?.subcode);
  const reason = asString(details?.reason) || "";
  const detailsFriendly = asString(details?.friendlyMessage);
  const detailsHint = asString(details?.actionHint);
  const rawMsg =
    asString(metaErrObj?.message) ??
    asString(parsedObj?.error) ??
    (typeof parsed === "string" ? parsed : "");
  const lowerMsg = rawMsg.toLowerCase();

  // 1. Recipient unavailable on Messenger / Instagram (Error 551 / Subcode 1545041)
  if (
    code === 551 ||
    subcode === 1545041 ||
    rawMsg.includes("551") ||
    rawMsg.includes("isn't available right now") ||
    rawMsg.includes("is not available")
  ) {
    return {
      title: "Recipient unavailable",
      message:
        "This person cannot receive messages right now. They may have blocked messages, deactivated their account, or your Meta App is still in Development mode.",
      actionHint:
        "Check if you can reply via Meta Business Suite, or verify that your Meta App is set to Live in the Developer Console.",
      code: 551,
      subcode: 1545041,
    };
  }

  // 1b. Another app / Meta Business Suite is controlling the thread (Subcode 2018300)
  if (
    subcode === 2018300 ||
    lowerMsg.includes("another app is controlling") ||
    lowerMsg.includes("holds control of this conversation")
  ) {
    return {
      title: "Another app is controlling this thread",
      message:
        "Meta blocked this reply because another app or Meta Business Suite currently holds thread control for this conversation.",
      actionHint:
        "Open Meta Business Suite Inbox and click 'Move to Done' on this conversation, or set Tchaikovsky CRM as Primary Receiver in Facebook Page Settings > Advanced Messaging.",
      code: code || 10,
      subcode: 2018300,
    };
  }

  // 1c. Automated AI reply outside 24-hour window
  if (reason === "automated_outside_24h" || lowerMsg.includes("automated reply")) {
    return {
      title: "Automated reply restricted to 24 hours",
      message:
        detailsFriendly ||
        "More than 24 hours have passed since the customer's last message. Automated replies are only allowed within 24 hours.",
      actionHint:
        detailsHint || "A human staff member can still reply manually within 7 days.",
      code: code || 10,
      subcode: subcode || 2018278,
    };
  }

  // 2. 7-day Human Agent window expired
  if (
    reason === "human_agent_window_expired" ||
    lowerMsg.includes("7 days") ||
    lowerMsg.includes("seven days")
  ) {
    return {
      title: "7-day reply window expired",
      message:
        detailsFriendly ||
        "More than 7 days have passed since the customer's last message. Meta's maximum 7-day Human Agent window has closed.",
      actionHint:
        detailsHint ||
        "Wait for the customer to send a new message, or reach out to them via WhatsApp or phone call.",
      code: code || 10,
      subcode: subcode || 2018278,
    };
  }

  // 3. Human Agent permission / feature approval issue
  if (
    reason === "human_agent_permission_required" ||
    lowerMsg.includes("needs the 'human agent'") ||
    lowerMsg.includes("human_agent")
  ) {
    return {
      title: "Human Agent permission required (7-day window)",
      message:
        detailsFriendly ||
        "To reply outside 24 hours (up to 7 days), your Meta App needs the 'Human Agent' feature approved and included on the active Page token.",
      actionHint:
        detailsHint ||
        "Verify 'Human Agent' and channel permissions in Meta Developer Console and refresh FB_PAGE_ACCESS_TOKEN if needed.",
      code: code || 10,
      subcode: subcode || 2018001,
    };
  }

  // 4. 24-hour policy window (Error 10 / Subcode 2018001 / 2018278 / 2534022)
  if (
    reason === "standard_window_expired" ||
    code === 10 ||
    subcode === 2018001 ||
    subcode === 2018278 ||
    subcode === 2534022 ||
    rawMsg.includes("24 hours") ||
    rawMsg.includes("message tag") ||
    lowerMsg.includes("allowed window")
  ) {
    return {
      title: "24-hour reply window expired",
      message:
        detailsFriendly ||
        "More than 24 hours have passed since the customer's last message. Standard replies are restricted outside 24 hours.",
      actionHint:
        detailsHint ||
        "Verify 'Human Agent' access in Meta Developer Console to enable 7-day replies, or reply via Meta Business Suite.",
      code: code || 10,
      subcode: subcode || 2018001,
    };
  }

  // 5. Token expired or invalid (Error 190)
  if (code === 190 || rawMsg.includes("access token") || rawMsg.includes("Session has expired")) {
    return {
      title: "Meta authorization expired",
      message: "The Facebook Page access token has expired or is invalid.",
      actionHint: "Please refresh the Facebook Page access token in server settings.",
      code: 190,
    };
  }

  // 6. Permissions error (Error 200 / 230)
  if (code === 200 || code === 230 || rawMsg.includes("Permissions error")) {
    return {
      title: "Permission denied",
      message:
        detailsFriendly ||
        "The Meta App lacks permission (pages_messaging / instagram_manage_messages) to message this recipient.",
      actionHint:
        detailsHint || "Verify permissions in Meta Developer Portal and refresh the Page token.",
      code: code || 200,
    };
  }

  // 7. Invalid parameters (Error 100)
  if (code === 100) {
    return {
      title: "Invalid recipient",
      message: "The recipient ID or messaging parameters are invalid.",
      code: 100,
    };
  }

  // If a friendly message was already provided by our backend
  if (detailsFriendly) {
    return {
      title: "Message could not be sent",
      message: detailsFriendly,
      actionHint: detailsHint || "Please try again later.",
      code,
      subcode,
    };
  }

  // Fallback: clean up raw message (strip "(#123)" prefix if present)
  const cleanMsg = rawMsg
    ? rawMsg.replace(/^\(#\d+\)\s*/, "").trim()
    : "Failed to send message via Meta API.";

  return {
    title: "Message could not be sent",
    message: cleanMsg,
    actionHint: "Please try again later or check Meta Business Suite.",
    code,
    subcode,
  };
}
