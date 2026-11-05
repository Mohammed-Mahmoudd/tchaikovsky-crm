export interface ParsedMetaError {
  title: string;
  message: string;
  actionHint?: string;
  code?: number;
  subcode?: number;
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

  let parsed: any = errorInput;

  // Handle serialized JSON strings (e.g. '{"error":{"message":"(#551)..."}}')
  if (typeof errorInput === "string") {
    const trimmed = errorInput.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = errorInput;
      }
    }
  }

  const metaErr = parsed?.error || parsed;
  const code = metaErr?.code || parsed?.details?.code;
  const subcode = metaErr?.error_subcode || parsed?.details?.subcode;
  const rawMsg =
    typeof metaErr?.message === "string"
      ? metaErr.message
      : typeof metaErr === "string"
      ? metaErr
      : typeof parsed === "string"
      ? parsed
      : "";
  const lowerMsg = rawMsg.toLowerCase();

  // 1. Recipient unavailable on Messenger (Error 551 / Subcode 1545041)
  if (
    code === 551 ||
    subcode === 1545041 ||
    rawMsg.includes("551") ||
    rawMsg.includes("isn't available right now") ||
    rawMsg.includes("is not available")
  ) {
    return {
      title: "Recipient unavailable on Messenger",
      message:
        "This person cannot receive messages right now. They may have blocked messages, deactivated their account, or your Meta App is still in Development mode.",
      actionHint: "Check if you can reply via Meta Business Suite, or verify that your Meta App is set to Live in the Developer Console.",
      code: 551,
      subcode: 1545041,
    };
  }

  // 2. 7-day Human Agent window expired
  if (lowerMsg.includes("7 days") || lowerMsg.includes("seven days")) {
    return {
      title: "7-day reply window expired",
      message:
        "More than 7 days have passed since the customer's last message. Meta's maximum 7-day Human Agent window has closed.",
      actionHint: "Wait for the customer to send a new message, or reach out to them via WhatsApp or phone call.",
      code: 10,
      subcode: 2018001,
    };
  }

  // 3. Human Agent tag permission required in Meta Developer Portal
  if (
    lowerMsg.includes("human agent") ||
    lowerMsg.includes("human_agent")
  ) {
    return {
      title: "Human Agent permission required (7-day window)",
      message:
        "To reply outside 24 hours (up to 7 days), your Meta App must be approved for the 'Human Agent' feature in Meta Developer Console.",
      actionHint: "Go to Meta Developer Console > App Review > Permissions and Features > request Advanced Access for 'Human Agent'.",
      code: 10,
      subcode: 2018001,
    };
  }

  // 4. 24-hour policy window (Error 10 / Subcode 2018001)
  if (
    code === 10 ||
    subcode === 2018001 ||
    rawMsg.includes("24 hours") ||
    rawMsg.includes("message tag") ||
    rawMsg.includes("window")
  ) {
    return {
      title: "24-hour reply window expired",
      message:
        "More than 24 hours have passed since the customer's last message. Standard replies are restricted outside 24 hours.",
      actionHint: "Request the 'Human Agent' feature in Meta Developer Console to enable 7-day replies, or reply via Meta Business Suite.",
      code: 10,
      subcode: 2018001,
    };
  }

  // 3. Token expired or invalid (Error 190)
  if (code === 190 || rawMsg.includes("access token") || rawMsg.includes("Session has expired")) {
    return {
      title: "Meta authorization expired",
      message: "The Facebook Page access token has expired or is invalid.",
      actionHint: "Please refresh the Facebook Page access token in server settings.",
      code: 190,
    };
  }

  // 4. Permissions error (Error 200 / 230)
  if (code === 200 || code === 230 || rawMsg.includes("Permissions error")) {
    return {
      title: "Permission denied",
      message: "The Meta App lacks permission (pages_messaging) to message this recipient.",
      actionHint: "Verify permissions in Meta Developer Portal.",
      code: 200,
    };
  }

  // 5. Invalid parameters (Error 100)
  if (code === 100) {
    return {
      title: "Invalid recipient",
      message: "The recipient ID or messaging parameters are invalid.",
      code: 100,
    };
  }

  // If a friendly message was already provided by our backend
  if (parsed?.details?.friendlyMessage) {
    return {
      title: "Message could not be sent",
      message: parsed.details.friendlyMessage,
      actionHint: parsed.details.actionHint || "Please try again later.",
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
