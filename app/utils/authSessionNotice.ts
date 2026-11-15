export type LogoutReason =
  | "deactivated"
  | "deleted"
  | "session_revoked"
  | "session_expired"
  | "manual";

export function mapAuthCodeToLogoutReason(code?: string | null, fallback: LogoutReason = "session_expired"): LogoutReason {
  switch (code) {
    case "ACCOUNT_DEACTIVATED":
      return "deactivated";
    case "USER_NOT_FOUND":
      return "deleted";
    case "SESSION_REVOKED":
      return "session_revoked";
    case "INVALID_TOKEN":
    case "TOKEN_MISSING":
    case "INVALID_SSE_TICKET":
      return "session_expired";
    default:
      return fallback;
  }
}

export function normalizeLogoutReason(reason?: string | null): LogoutReason | null {
  switch (reason) {
    case "deactivated":
    case "deleted":
    case "session_revoked":
    case "session_expired":
    case "manual":
      return reason;
    default:
      return null;
  }
}

export function getLogoutReasonMessage(reason?: string | null): string | null {
  switch (normalizeLogoutReason(reason)) {
    case "deactivated":
      return "Your account has been deactivated by an administrator. Contact your team administrator to restore access.";
    case "deleted":
      return "Your account has been removed by an administrator.";
    case "session_revoked":
      return "Your session was closed because your account security details changed. Please sign in again.";
    case "session_expired":
      return "Your session has expired. Please sign in again.";
    case "manual":
    default:
      return null;
  }
}

