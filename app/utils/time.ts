/**
 * Formats a timestamp into a friendly, compact relative time string.
 * Examples: "just now", "23m", "2h", "1 day ago", "3 days ago", "1 week ago", "2 months ago".
 */
export function formatLastMessageTime(timestamp?: number | string | Date | null): string {
  if (!timestamp) return "";
  let time = 0;
  if (typeof timestamp === "number") {
    time = timestamp;
  } else if (typeof timestamp === "string") {
    time = new Date(timestamp).getTime();
  } else if (timestamp instanceof Date) {
    time = timestamp.getTime();
  }

  if (isNaN(time) || time <= 0) return "";

  // Normalize seconds to milliseconds if necessary (e.g. 10-digit Unix timestamp)
  if (time < 10000000000) {
    time *= 1000;
  }

  const now = Date.now();
  const diffMs = now - time;

  // Under 60 seconds (also guards against minor clock drift)
  if (diffMs < 60 * 1000) {
    return "just now";
  }

  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 60) {
    return `${diffMin}m`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour}h`;
  }

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) {
    return "1 day ago";
  }
  if (diffDay < 7) {
    return `${diffDay} days ago`;
  }

  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek === 1) {
    return "1 week ago";
  }
  if (diffWeek < 5) {
    return `${diffWeek} weeks ago`;
  }

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth === 1) {
    return "1 month ago";
  }
  if (diffMonth < 12) {
    return `${diffMonth} months ago`;
  }

  const diffYear = Math.floor(diffDay / 365);
  return diffYear <= 1 ? "1 year ago" : `${diffYear} years ago`;
}
