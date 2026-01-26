"use client";

import { useTimezone } from "./timezone-provider";
import { formatDateCompact, formatDateFull, formatRelativeTime, formatTime, formatDateOnly } from "@/lib/utils/dateFormat";

interface FormattedDateProps {
  date: string | Date;
  format?: "compact" | "full" | "relative" | "time" | "date";
  className?: string;
}

/**
 * A component that formats dates according to the user's timezone preference.
 * Uses suppressHydrationWarning to avoid hydration mismatches between server and client.
 */
export function FormattedDate({ date, format = "compact", className }: FormattedDateProps) {
  const { timezone } = useTimezone();

  let formatted: string;
  switch (format) {
    case "full":
      formatted = formatDateFull(date, timezone);
      break;
    case "relative":
      formatted = formatRelativeTime(date);
      break;
    case "time":
      formatted = formatTime(date, timezone);
      break;
    case "date":
      formatted = formatDateOnly(date, timezone);
      break;
    case "compact":
    default:
      formatted = formatDateCompact(date, timezone);
      break;
  }

  return (
    <span className={className} suppressHydrationWarning>
      {formatted}
    </span>
  );
}
