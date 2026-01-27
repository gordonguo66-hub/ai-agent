import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * DELETE /api/settings/api-keys/[id]
 * Delete a saved API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keyId = params.id;
    if (!keyId) {
      return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // First verify the key belongs to the user
    const { data: existingKey, error: fetchError } = await serviceClient
      .from("user_api_keys")
      .select("id, user_id")
      .eq("id", keyId)
      .maybeSingle();

    if (fetchError) {
      console.error("[DELETE /api/settings/api-keys/[id]] Error fetching key:", fetchError);
      return NextResponse.json(
        { error: "Failed to verify key ownership" },
        { status: 500 }
      );
    }

    if (!existingKey) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    if (existingKey.user_id !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this key" },
        { status: 403 }
      );
    }

    // Check if any strategies are using this key
    const { data: strategiesUsingKey, error: strategiesError } = await serviceClient
      .from("strategies")
      .select("id, name, api_key_ciphertext")
      .eq("saved_api_key_id", keyId)
      .eq("user_id", user.id);

    if (strategiesError) {
      console.error("[DELETE /api/settings/api-keys/[id]] Error checking strategies:", strategiesError);
      return NextResponse.json(
        { error: "Failed to check strategy dependencies" },
        { status: 500 }
      );
    }

    // Check if any strategies would be left without ANY API key
    const strategiesWithoutFallback = (strategiesUsingKey || []).filter(
      (s) => !s.api_key_ciphertext || s.api_key_ciphertext.trim() === ""
    );

    if (strategiesWithoutFallback.length > 0) {
      const names = strategiesWithoutFallback.map((s) => s.name).join(", ");
      return NextResponse.json(
        {
          error: `Cannot delete this key. ${strategiesWithoutFallback.length} strategy(ies) depend on it: ${names}. Please edit these strategies to add a manual API key or select a different saved key first.`,
          affectedStrategies: strategiesWithoutFallback,
        },
        { status: 409 } // 409 Conflict
      );
    }

    // Safe to delete - all strategies using this key have a fallback
    if (strategiesUsingKey && strategiesUsingKey.length > 0) {
      const strategyNames = strategiesUsingKey.map((s) => s.name).join(", ");
      console.warn(
        `[DELETE /api/settings/api-keys/[id]] Deleting key used by ${strategiesUsingKey.length} strategies (they have fallback keys): ${strategyNames}`
      );
    }

    // Delete the key (will set saved_api_key_id to NULL in strategies due to ON DELETE SET NULL)
    const { error: deleteError } = await serviceClient
      .from("user_api_keys")
      .delete()
      .eq("id", keyId)
      .eq("user_id", user.id); // Double-check user_id for safety

    if (deleteError) {
      console.error("[DELETE /api/settings/api-keys/[id]] Error deleting key:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete API key" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: strategiesUsingKey && strategiesUsingKey.length > 0
          ? `Key deleted. ${strategiesUsingKey.length} strategy(ies) will need a new key.`
          : "Key deleted successfully",
        affectedStrategies: strategiesUsingKey || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[DELETE /api/settings/api-keys/[id]] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
