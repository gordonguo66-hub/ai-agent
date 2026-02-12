'use client';

import { Analytics } from "@vercel/analytics/react";

export function AnalyticsWrapper() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (typeof window !== 'undefined' &&
            localStorage.getItem('exclude_from_analytics') === 'true') {
          return null; // Don't track this user
        }
        return event; // Track normally
      }}
    />
  );
}
