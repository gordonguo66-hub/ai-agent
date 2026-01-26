/**
 * Session Display Utilities
 * Single source of truth for session type badges and labels
 */

export type SessionDisplayType = "ARENA" | "LIVE" | "VIRTUAL";

export interface SessionBadgeConfig {
  label: string;
  variant: "default" | "destructive" | "secondary" | "outline";
  className?: string;
}

/**
 * Get the display type for a session
 * Arena is Virtual-only ($100k competition)
 * 
 * @param session - Session object with mode property
 * @returns Display type: "ARENA", "LIVE", or "VIRTUAL"
 */
export function getSessionDisplayType(session: any): SessionDisplayType {
  if (!session) return "VIRTUAL";
  
  // Arena mode is always displayed as ARENA, never LIVE
  if (session.mode === "arena") {
    return "ARENA";
  }
  
  // Live mode
  if (session.mode === "live") {
    return "LIVE";
  }
  
  // Default to virtual
  return "VIRTUAL";
}

/**
 * Get badge configuration for a session
 * 
 * @param session - Session object with mode property
 * @returns Badge configuration object
 */
export function getSessionBadgeConfig(session: any): SessionBadgeConfig {
  const displayType = getSessionDisplayType(session);
  
  switch (displayType) {
    case "ARENA":
      return {
        label: "ARENA 🏆",
        variant: "secondary",
        className: "bg-gradient-to-r from-purple-600 to-blue-600 text-white",
      };
    
    case "LIVE":
      return {
        label: "LIVE",
        variant: "destructive",
      };
    
    case "VIRTUAL":
    default:
      return {
        label: "VIRTUAL",
        variant: "secondary",
      };
  }
}

/**
 * Check if a session is an Arena session
 * 
 * @param session - Session object
 * @returns true if session is Arena mode
 */
export function isArenaSession(session: any): boolean {
  return session?.mode === "arena";
}

/**
 * Check if a session uses virtual broker (virtual or arena)
 * 
 * @param session - Session object
 * @returns true if session uses virtual broker
 */
export function isVirtualBroker(session: any): boolean {
  return session?.mode === "virtual" || session?.mode === "arena";
}

/**
 * Check if a session uses live broker
 * 
 * @param session - Session object
 * @returns true if session uses live broker
 */
export function isLiveBroker(session: any): boolean {
  return session?.mode === "live";
}

/**
 * Validate that Arena session is not using live mode
 * Throws error if Arena is incorrectly configured as live
 * 
 * @param session - Session object
 * @throws Error if Arena session is misconfigured
 */
export function validateArenaNotLive(session: any): void {
  if (session?.mode === "arena" && session?.mode === "live") {
    throw new Error("ASSERTION FAILED: Arena session cannot be LIVE mode. Arena is virtual-only.");
  }
}
