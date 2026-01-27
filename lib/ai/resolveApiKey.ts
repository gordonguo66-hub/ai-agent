import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto/credentials";

/**
 * Resolve the effective API key for a strategy.
 * If strategy has saved_api_key_id, fetch and decrypt the saved key.
 * Otherwise, use the strategy's own api_key_ciphertext.
 * 
 * @param strategy Strategy object with api_key_ciphertext and optional saved_api_key_id
 * @returns Decrypted API key string
 * @throws Error if key cannot be resolved or decrypted
 */
export async function resolveStrategyApiKey(strategy: {
  id: string;
  user_id: string;
  saved_api_key_id?: string | null;
  api_key_ciphertext?: string;
}): Promise<string> {
  console.log(`[resolveStrategyApiKey] 🔍 Resolving key for strategy ${strategy.id}:`, {
    has_saved_key_id: !!strategy.saved_api_key_id,
    saved_key_id: strategy.saved_api_key_id,
    has_direct_key: !!strategy.api_key_ciphertext,
    direct_key_length: strategy.api_key_ciphertext?.length,
    direct_key_is_empty_string: strategy.api_key_ciphertext === "",
    direct_key_is_null: strategy.api_key_ciphertext === null,
    direct_key_is_undefined: strategy.api_key_ciphertext === undefined,
    direct_key_typeof: typeof strategy.api_key_ciphertext,
  });
  
  // Priority 1: Use saved key if referenced
  if (strategy.saved_api_key_id) {
    const serviceClient = createServiceRoleClient();
    
    const { data: savedKey, error: keyError } = await serviceClient
      .from("user_api_keys")
      .select("encrypted_key, user_id")
      .eq("id", strategy.saved_api_key_id)
      .maybeSingle();

    console.log(`[resolveStrategyApiKey] 📦 Saved key query result:`, {
      found: !!savedKey,
      error: keyError?.message,
      has_encrypted_key: !!savedKey?.encrypted_key,
      encrypted_key_length: savedKey?.encrypted_key?.length,
      user_id_match: savedKey?.user_id === strategy.user_id,
    });

    if (keyError) {
      console.error(`[resolveStrategyApiKey] Error fetching saved key:`, keyError);
      throw new Error(`Failed to fetch saved API key: ${keyError.message}`);
    }

    if (!savedKey) {
      // Saved key was deleted - check if strategy has fallback key
      if (strategy.api_key_ciphertext && strategy.api_key_ciphertext !== "" && strategy.api_key_ciphertext.trim()) {
        console.warn(
          `[resolveStrategyApiKey] Saved key ${strategy.saved_api_key_id} not found, falling back to strategy's own key`
        );
        return decryptCredential(strategy.api_key_ciphertext);
      }
      
      throw new Error(
        `⚠️ The saved API key for this strategy was deleted. ` +
        `Please go to Dashboard → Edit Strategy → Select a new saved key or paste an API key directly.`
      );
    }

    // Verify saved key belongs to the strategy owner (security check)
    if (savedKey.user_id !== strategy.user_id) {
      throw new Error(
        `Security violation: Saved key does not belong to strategy owner`
      );
    }

    // Decrypt and return saved key
    try {
      console.log(`[resolveStrategyApiKey] 🔐 Attempting to decrypt saved key, length: ${savedKey.encrypted_key?.length}`);
      console.log(`[resolveStrategyApiKey] 🔐 Saved key value type: ${typeof savedKey.encrypted_key}, is_empty: ${savedKey.encrypted_key === ''}, is_null: ${savedKey.encrypted_key === null}`);
      
      if (!savedKey.encrypted_key || savedKey.encrypted_key === '') {
        console.error(`[resolveStrategyApiKey] ❌ CRITICAL: Saved key encrypted_key is empty! Key ID: ${strategy.saved_api_key_id}`);
        throw new Error(`Saved API key (${strategy.saved_api_key_id}) has empty encrypted_key field. The key may be corrupted in the database.`);
      }
      
      const decrypted = decryptCredential(savedKey.encrypted_key);
      console.log(`[resolveStrategyApiKey] ✅ Successfully decrypted saved key`);
      return decrypted;
    } catch (error: any) {
      console.error(`[resolveStrategyApiKey] ❌ Failed to decrypt saved key:`, error.message);
      console.error(`[resolveStrategyApiKey] ❌ Error stack:`, error.stack);
      
      // User-friendly error message for encryption key issues
      if (error.message?.includes('CREDENTIALS_ENCRYPTION_KEY')) {
        throw new Error(
          `Server configuration error: Encryption key is not set up. ` +
          `The administrator needs to configure CREDENTIALS_ENCRYPTION_KEY in environment variables. ` +
          `Contact support or check the server logs for setup instructions.`
        );
      }
      
      throw new Error(`Failed to decrypt saved API key: ${error.message}`);
    }
  }

  // Priority 2: Use strategy's own key
  console.log(`[resolveStrategyApiKey] 🔑 Using direct key from strategy`);
  console.log(`[resolveStrategyApiKey] 🔑 Direct key details:`, {
    has_key: !!strategy.api_key_ciphertext,
    is_empty: strategy.api_key_ciphertext === "",
    is_null: strategy.api_key_ciphertext === null,
    is_undefined: strategy.api_key_ciphertext === undefined,
    length: strategy.api_key_ciphertext?.length,
    trimmed_length: strategy.api_key_ciphertext?.trim().length,
  });
  
  if (!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "" || !strategy.api_key_ciphertext.trim()) {
    console.error(`[resolveStrategyApiKey] ❌ No API key configured for strategy ${strategy.id}`);
    console.error(`[resolveStrategyApiKey] ❌ Strategy object:`, JSON.stringify(strategy, null, 2));
    throw new Error(
      `Strategy has no API key configured. Please edit the strategy to add an API key.`
    );
  }

  try {
    console.log(`[resolveStrategyApiKey] 🔐 Attempting to decrypt direct key, length: ${strategy.api_key_ciphertext.length}`);
    const decrypted = decryptCredential(strategy.api_key_ciphertext);
    console.log(`[resolveStrategyApiKey] ✅ Successfully decrypted direct key`);
    return decrypted;
  } catch (error: any) {
    console.error(`[resolveStrategyApiKey] ❌ Failed to decrypt direct key:`, error.message);
    console.error(`[resolveStrategyApiKey] ❌ Error stack:`, error.stack);
    
    // User-friendly error message for encryption key issues
    if (error.message?.includes('CREDENTIALS_ENCRYPTION_KEY')) {
      throw new Error(
        `Server configuration error: Encryption key is not set up. ` +
        `The administrator needs to configure CREDENTIALS_ENCRYPTION_KEY in environment variables. ` +
        `Contact support or check the server logs for setup instructions.`
      );
    }
    
    throw new Error(`Failed to decrypt strategy API key: ${error.message}`);
  }
}
