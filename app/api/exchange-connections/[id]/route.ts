import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connectionId = params.id;
    const serviceClient = createServiceRoleClient();

    // Delete the connection (RLS ensures user can only delete their own)
    const { error } = await serviceClient
      .from("exchange_connections")
      .delete()
      .eq("id", connectionId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to delete connection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
