import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { updateArenaSnapshot } from "@/lib/arena/updateArenaSnapshot";

/**
 * Force refresh all arena snapshots
 * This endpoint can be called to update all snapshots with correct equity calculations
 */
export async function POST(request: NextRequest) {
  try {
    const serviceClient = createServiceRoleClient();

    // Get all active arena entries
    const { data: arenaEntries, error: entriesError } = await serviceClient
      .from("arena_entries")
      .select("session_id")
      .eq("active", true)
      .limit(1000);

    if (entriesError) {
      console.error("Failed to fetch arena entries:", entriesError);
      return NextResponse.json({ error: "Failed to fetch arena entries" }, { status: 500 });
    }

    if (!arenaEntries || arenaEntries.length === 0) {
      return NextResponse.json({ message: "No active arena entries to refresh" });
    }

    // Update snapshots for all entries
    const results = await Promise.allSettled(
      arenaEntries.map((entry) => updateArenaSnapshot(entry.session_id))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      message: `Refreshed ${succeeded} snapshots${failed > 0 ? `, ${failed} failed` : ""}`,
      total: arenaEntries.length,
      succeeded,
      failed,
    });
  } catch (error: any) {
    console.error("Error refreshing snapshots:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
