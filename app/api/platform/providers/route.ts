import { NextResponse } from "next/server";
import {
  getSupportedPlatformProviders,
  getAllSupportedProviders,
  isPlatformKeyAvailable,
  getPlatformProviderBaseUrl,
} from "@/lib/ai/platformApiKey";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/providers
 *
 * Returns information about available platform AI providers.
 * This endpoint tells the frontend which providers have platform keys configured
 * so users know they can use "Corebound AI" for those providers.
 */
export async function GET() {
  try {
    // Get all providers that have platform keys configured
    const availableProviders = getSupportedPlatformProviders();

    // Get all supported providers (for UI to show which can potentially be used)
    const allSupportedProviders = getAllSupportedProviders();

    // Build detailed provider info
    const providerDetails = allSupportedProviders.map((provider) => ({
      id: provider,
      name: getProviderDisplayName(provider),
      available: isPlatformKeyAvailable(provider),
      baseUrl: getPlatformProviderBaseUrl(provider),
    }));

    return NextResponse.json({
      // Simple list of available provider IDs
      providers: availableProviders,
      // Detailed info about all supported providers
      providerDetails,
      // Count of available providers
      availableCount: availableProviders.length,
      // Whether platform AI is available at all
      platformAvailable: availableProviders.length > 0,
    });
  } catch (error: any) {
    console.error("[Platform Providers] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch platform providers" },
      { status: 500 }
    );
  }
}

/**
 * Get human-readable display name for a provider
 */
function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    google: "Google Gemini",
    xai: "xAI Grok",
    qwen: "Qwen (Alibaba)",
  };

  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}
