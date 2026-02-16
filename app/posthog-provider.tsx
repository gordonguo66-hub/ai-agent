'use client'

import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Don't track in development
    if (process.env.NODE_ENV === 'development') return

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false, // captured manually for Next.js client-side routing
      capture_pageleave: true,
      loaded: (posthog) => {
        if (localStorage.getItem('exclude_from_analytics') === 'true') {
          posthog.opt_out_capturing()
        }
      },
    })
  }, [])

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
