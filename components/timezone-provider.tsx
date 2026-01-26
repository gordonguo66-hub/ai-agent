"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { createClient } from "@/lib/supabase/browser";

interface TimezoneContextType {
  timezone: string | null; // null means use browser local
  setTimezone: (tz: string | null) => void;
  isLoading: boolean;
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: null,
  setTimezone: () => {},
  isLoading: true,
});

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load timezone from user profile on mount
  useEffect(() => {
    const loadTimezone = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("timezone")
            .eq("id", session.user.id)
            .single();

          if (profile?.timezone) {
            setTimezoneState(profile.timezone);
          }
        }
      } catch (error) {
        console.error("Failed to load timezone preference:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTimezone();
  }, []);

  const setTimezone = async (tz: string | null) => {
    setTimezoneState(tz);

    // Also save to profile if user is logged in
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        await supabase
          .from("profiles")
          .update({ timezone: tz || null })
          .eq("id", session.user.id);
      }
    } catch (error) {
      console.error("Failed to save timezone preference:", error);
    }
  };

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone, isLoading }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}
