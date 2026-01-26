import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { getKnownModels } from "@/lib/ai/knownModels";

/**
 * Temporary endpoint to fetch models from a provider before saving the connection.
 * Accepts baseUrl and apiKey in the request body, fetches /models, and returns the list.
 * This avoids CORS issues and keeps API keys server-side.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { base_url, api_key } = body;

    if (!base_url || !api_key) {
      return NextResponse.json({ error: "Missing base_url or api_key" }, { status: 400 });
    }

    // Normalize base URL
    let url = String(base_url).trim().replace(/\/+$/, "");
    
    // Handle different provider endpoint formats
    // Try /models first (works for most providers)
    // If that fails, we'll fall back to known models
    if (url.includes("/v1beta/openai")) {
      // Google Gemini OpenAI-compatible endpoint
      url = url + "/models";
    } else if (url.includes("/v1") || url.includes("/api/v1") || url.includes("/inference/v1")) {
      // Already has version path, append /models
      url = url + "/models";
    } else {
      // No version - try /v1/models (OpenAI-compatible standard)
      url = url + "/v1/models";
    }

    let list: string[] = [];
    let apiError: string | null = null;

    // Try to fetch from API first
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${api_key}` },
      });

      if (res.ok) {
        const json = await res.json();
        console.log("Provider response:", JSON.stringify(json).slice(0, 500));
        
        // Handle different response formats
        if (Array.isArray(json?.data)) {
          // OpenAI format: { data: [{ id: "gpt-4", ... }, ...] }
          list = json.data.map((m: any) => m?.id || m?.model || String(m)).filter(Boolean);
        } else if (Array.isArray(json)) {
          // Direct array: [{ id: "gpt-4", ... }, ...] or ["gpt-4", "gpt-3.5", ...]
          list = json.map((m: any) => m?.id || m?.model || String(m)).filter(Boolean);
        } else if (json?.models && Array.isArray(json.models)) {
          // Some providers: { models: [...] }
          list = json.models.map((m: any) => m?.id || m?.model || String(m)).filter(Boolean);
        } else if (typeof json === "object" && json !== null) {
          // Try to extract any array values
          const values = Object.values(json);
          const arrays = values.filter(Array.isArray);
          if (arrays.length > 0) {
            list = arrays[0].map((m: any) => m?.id || m?.model || String(m)).filter(Boolean);
          }
        }
      } else {
        const text = await res.text();
        apiError = `API returned ${res.status}: ${text.slice(0, 200)}`;
        console.warn("API fetch failed, using fallback models:", apiError);
      }
    } catch (fetchError: any) {
      apiError = fetchError.message;
      console.warn("API fetch error, using fallback models:", fetchError.message);
    }

    // Always get known models as fallback
    const knownModels = getKnownModels(base_url);
    
    // Merge API models with known models (known models take precedence if API fails)
    let finalList: string[] = [];
    if (list.length > 0) {
      // API returned models - use them, but also include known models that aren't in the API response
      finalList = [...list];
      if (knownModels.length > 0) {
        // Add known models that aren't already in the list
        knownModels.forEach((m) => {
          if (!finalList.includes(m)) {
            finalList.push(m);
          }
        });
      }
    } else {
      // API didn't return models - use known models
      finalList = knownModels;
    }

    // Return sorted unique list
    const models = Array.from(new Set(finalList.map(String))).sort((a, b) => a.localeCompare(b));
    console.log("Final models list:", models.length, models.slice(0, 20));
    
    if (models.length === 0) {
      return NextResponse.json(
        { 
          error: apiError || "No models found. Check your API key and base URL.",
          models: [] 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      models,
      source: list.length === 0 ? "fallback" : (apiError ? "fallback+api" : "api")
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
