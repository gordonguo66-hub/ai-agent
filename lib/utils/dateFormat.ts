/**
 * Shared date formatting utility with timezone support.
 *
 * By default, uses the browser's local timezone.
 * If a user has set a timezone preference in their profile, that will be used instead.
 */

// Common IANA timezones for the selector
export const TIMEZONES = [
  { value: "", label: "Auto (Browser Local)" },
  // Americas
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Vancouver", label: "Vancouver" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Sao_Paulo", label: "Sao Paulo" },
  { value: "America/Buenos_Aires", label: "Buenos Aires" },
  // Europe
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Amsterdam", label: "Amsterdam" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Europe/Rome", label: "Rome" },
  { value: "Europe/Zurich", label: "Zurich" },
  { value: "Europe/Stockholm", label: "Stockholm" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Europe/Istanbul", label: "Istanbul" },
  // Asia
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "India (Mumbai, Delhi)" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Shanghai", label: "China (Shanghai, Beijing)" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Seoul", label: "Seoul" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "Asia/Jakarta", label: "Jakarta" },
  // Oceania
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Australia/Melbourne", label: "Melbourne" },
  { value: "Australia/Brisbane", label: "Brisbane" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Pacific/Auckland", label: "Auckland" },
  // Africa
  { value: "Africa/Cairo", label: "Cairo" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Africa/Lagos", label: "Lagos" },
  // UTC
  { value: "UTC", label: "UTC" },
];

/**
 * Format a date string with the specified timezone.
 *
 * @param dateString - ISO date string or Date-parseable string
 * @param timezone - IANA timezone identifier (e.g., "America/New_York"), or empty string for local
 * @param options - Optional Intl.DateTimeFormat options for customization
 * @returns Formatted date string
 */
export function formatDate(
  dateString: string | Date,
  timezone?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  };

  // If timezone is provided, use it. Otherwise use browser's local timezone.
  if (timezone) {
    defaultOptions.timeZone = timezone;
  }

  try {
    return date.toLocaleString("en-US", defaultOptions).replace(",", "");
  } catch (e) {
    // Fallback if timezone is invalid
    console.warn(`Invalid timezone "${timezone}", falling back to local`);
    const { timeZone: _, ...safeOptions } = defaultOptions;
    return date.toLocaleString("en-US", safeOptions).replace(",", "");
  }
}

/**
 * Format a date for display in a compact format (e.g., "1/25/2026 14:30")
 */
export function formatDateCompact(dateString: string | Date, timezone?: string | null): string {
  return formatDate(dateString, timezone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format a date for display with full month name (e.g., "January 25, 2026 at 2:30 PM")
 */
export function formatDateFull(dateString: string | Date, timezone?: string | null): string {
  return formatDate(dateString, timezone, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a date as relative time (e.g., "5 minutes ago", "2 days ago")
 */
export function formatRelativeTime(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  if (diffWeek < 4) return `${diffWeek} week${diffWeek === 1 ? "" : "s"} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
  return `${diffYear} year${diffYear === 1 ? "" : "s"} ago`;
}

/**
 * Format just the time portion (e.g., "14:30" or "2:30 PM")
 */
export function formatTime(dateString: string | Date, timezone?: string | null, hour12: boolean = false): string {
  return formatDate(dateString, timezone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
}

/**
 * Format just the date portion (e.g., "1/25/2026")
 */
export function formatDateOnly(dateString: string | Date, timezone?: string | null): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  };

  // If timezone is provided, use it. Otherwise use browser's local timezone.
  if (timezone) {
    options.timeZone = timezone;
  }

  try {
    return date.toLocaleDateString("en-US", options);
  } catch (e) {
    // Fallback if timezone is invalid
    console.warn(`Invalid timezone "${timezone}", falling back to local`);
    const { timeZone: _, ...safeOptions } = options;
    return date.toLocaleDateString("en-US", safeOptions);
  }
}

/**
 * Get the current timezone offset string (e.g., "UTC-5", "UTC+8")
 */
export function getTimezoneOffset(timezone?: string | null): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZoneName: "short",
  };

  if (timezone) {
    options.timeZone = timezone;
  }

  try {
    const formatted = date.toLocaleString("en-US", options);
    const match = formatted.match(/[A-Z]{2,5}[+-]?\d*$/);
    return match ? match[0] : "";
  } catch {
    return "";
  }
}

/**
 * Detect the browser's local timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
