import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { requireValidOrigin } from "@/lib/api/csrfProtection";

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = requireValidOrigin(request);
    if (csrfCheck) return csrfCheck;

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, model_provider, model_name, prompt, filters } = body;

    if (!name || !model_provider || !model_name || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, model_provider, model_name, prompt" },
        { status: 400 }
      );
    }

    // Validate prompt length to prevent excessive token usage
    if (typeof prompt === "string" && prompt.length > 10000) {
      return NextResponse.json(
        { error: "Prompt too long (max 10,000 characters)" },
        { status: 400 }
      );
    }

    // Validate cadence (minimum 60 seconds due to cron frequency)
    if (filters?.cadenceSeconds && filters.cadenceSeconds < 60) {
      return NextResponse.json(
        { error: "Minimum AI cadence is 60 seconds (1 minute). The system checks for decisions every minute." },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Prepare strategy data - always use platform keys (no user API keys)
    const strategyData: any = {
      user_id: user.id,
      name: String(name),
      model_provider: String(model_provider),
      model_name: String(model_name),
      prompt: String(prompt),
      filters: filters || {},
      use_platform_key: true, // Always use platform keys
      saved_api_key_id: null,
      api_key_ciphertext: null,
    };

    const { data, error } = await serviceClient
      .from("strategies")
      .insert(strategyData)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategy: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
