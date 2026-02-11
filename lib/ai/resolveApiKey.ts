import { getPlatformApiKey, getPlatformProviderBaseUrl } from "./platformApiKey";

/**
 * Result of resolving an API key
 */
export interface ResolvedApiKey {
  apiKey: string;
  isPlatformKey: boolean;
  baseUrl?: string;
}

/**
 * Strategy object for API key resolution
 */
export interface StrategyKeyConfig {
  id: string;
  model_provider: string;
}

/**
 * Resolve the API key for a strategy.
 *
 * All strategies use Corebound platform keys - no user API keys supported.
 *
 * @param strategy Strategy object with model provider
 * @returns Object containing the API key and base URL
 * @throws Error if no platform key is configured for the provider
 */
export async function resolveStrategyApiKey(
  strategy: StrategyKeyConfig
): Promise<ResolvedApiKey> {
  const { model_provider, id } = strategy;

  console.log(`[resolveStrategyApiKey] Resolving platform key for strategy ${id}, provider: ${model_provider}`);

  const apiKey = getPlatformApiKey(model_provider);

  if (!apiKey) {
    console.error(`[resolveStrategyApiKey] No platform key configured for provider: ${model_provider}`);
    throw new Error(
      `No API key configured for ${model_provider}. ` +
      `Please contact support or try a different AI provider.`
    );
  }

  const baseUrl = getPlatformProviderBaseUrl(model_provider);

  console.log(`[resolveStrategyApiKey] Using platform key for ${model_provider}`);

  return {
    apiKey,
    isPlatformKey: true,
    baseUrl: baseUrl || undefined,
  };
}
