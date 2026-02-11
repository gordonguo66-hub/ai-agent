/**
 * Platform API Key Management
 *
 * This module handles Corebound's platform-provided API keys.
 * When users choose "Use Corebound AI", the system uses these platform keys
 * instead of requiring users to provide their own API keys.
 *
 * Platform keys are stored in environment variables (server-side only).
 */

/**
 * Map of provider names to their corresponding environment variable names
 */
const PLATFORM_KEY_MAP: Record<string, string> = {
  openai: 'PLATFORM_OPENAI_API_KEY',
  anthropic: 'PLATFORM_ANTHROPIC_API_KEY',
  deepseek: 'PLATFORM_DEEPSEEK_API_KEY',
  google: 'PLATFORM_GOOGLE_API_KEY',
  xai: 'PLATFORM_XAI_API_KEY',
  qwen: 'PLATFORM_QWEN_API_KEY',
};

/**
 * Provider base URLs for API calls
 * Note: Some providers like Qwen use Alibaba's DashScope API
 */
export const PLATFORM_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  xai: 'https://api.x.ai/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

/**
 * Get the platform API key for a specific provider
 * @param provider - The provider name (e.g., 'openai', 'anthropic')
 * @returns The API key from environment variables, or null if not configured
 */
export function getPlatformApiKey(provider: string): string | null {
  const normalizedProvider = provider.toLowerCase().trim();
  const envVar = PLATFORM_KEY_MAP[normalizedProvider];

  if (!envVar) {
    console.log(`[platformApiKey] No platform key mapping for provider: ${provider}`);
    return null;
  }

  const key = process.env[envVar];

  if (!key || key.trim() === '') {
    console.log(`[platformApiKey] Platform key not configured: ${envVar}`);
    return null;
  }

  return key.trim();
}

/**
 * Check if a platform API key is available for a specific provider
 * @param provider - The provider name
 * @returns true if a platform key is configured for this provider
 */
export function isPlatformKeyAvailable(provider: string): boolean {
  return getPlatformApiKey(provider) !== null;
}

/**
 * Get list of all providers that have platform keys configured
 * @returns Array of provider names that have platform keys available
 */
export function getSupportedPlatformProviders(): string[] {
  return Object.keys(PLATFORM_KEY_MAP).filter(provider =>
    isPlatformKeyAvailable(provider)
  );
}

/**
 * Get the base URL for a platform provider
 * @param provider - The provider name
 * @returns The base URL for API calls, or null if provider not supported
 */
export function getPlatformProviderBaseUrl(provider: string): string | null {
  const normalizedProvider = provider.toLowerCase().trim();
  return PLATFORM_PROVIDER_BASE_URLS[normalizedProvider] || null;
}

/**
 * Check if a provider is supported by the platform (has a key mapping defined)
 * Note: This checks if we have a mapping, not if the key is actually configured
 * @param provider - The provider name
 * @returns true if the provider is in our supported list
 */
export function isProviderSupported(provider: string): boolean {
  const normalizedProvider = provider.toLowerCase().trim();
  return normalizedProvider in PLATFORM_KEY_MAP;
}

/**
 * Get all supported provider names (regardless of whether keys are configured)
 * @returns Array of all provider names that can use platform keys
 */
export function getAllSupportedProviders(): string[] {
  return Object.keys(PLATFORM_KEY_MAP);
}
