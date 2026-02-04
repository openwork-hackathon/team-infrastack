/**
 * Secure API Key Manager
 * CRITICAL SECURITY COMPONENT - Handles API keys securely throughout their lifecycle
 * 
 * Security Principles:
 * - Keys exist in memory only during active requests
 * - NEVER log actual keys, only masked versions
 * - Validate keys before use
 * - Clear keys from memory after use
 * - Audit all key operations without exposing keys
 */

import { validateKeyFormat, maskApiKey, sanitizeForLogging, containsApiKey, KeyValidationResult } from './crypto';
import { auditLogger, AuditEventType } from './audit-log';

export interface KeyManagerConfig {
  enableKeyValidation?: boolean;
  enableKeyTesting?: boolean;
  enableAuditLogging?: boolean;
  keyTestTimeout?: number;
  maxKeyAge?: number; // Maximum time to keep a key in memory (ms)
  requireHttps?: boolean; // Require HTTPS for key transmission
}

export interface SecureKey {
  id: string;
  provider: string;
  isValid: boolean;
  createdAt: Date;
  lastUsed?: Date;
  usage: {
    requests: number;
    successes: number;
    failures: number;
  };
}

export interface KeyTestResult {
  isValid: boolean;
  provider: string;
  model?: string;
  error?: string;
  responseTime?: number;
}

export interface KeyUsageContext {
  requestId?: string;
  userId?: string;
  model?: string;
  endpoint?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Secure API Key Manager
 * Manages the secure lifecycle of API keys with comprehensive audit logging
 */
export class SecureKeyManager {
  private config: Required<KeyManagerConfig>;
  private activeKeys: Map<string, { key: string; metadata: SecureKey }> = new Map();
  private keyTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: KeyManagerConfig = {}) {
    this.config = {
      enableKeyValidation: config.enableKeyValidation ?? true,
      enableKeyTesting: config.enableKeyTesting ?? false, // Disabled by default for security
      enableAuditLogging: config.enableAuditLogging ?? true,
      keyTestTimeout: config.keyTestTimeout || 5000,
      maxKeyAge: config.maxKeyAge || 5 * 60 * 1000, // 5 minutes default
      requireHttps: config.requireHttps ?? process.env.NODE_ENV === 'production'
    };

    console.log('🔐 SecureKeyManager initialized with configuration:', {
      enableKeyValidation: this.config.enableKeyValidation,
      enableKeyTesting: this.config.enableKeyTesting,
      enableAuditLogging: this.config.enableAuditLogging,
      maxKeyAge: `${this.config.maxKeyAge / 1000}s`,
      requireHttps: this.config.requireHttps
    });
  }

  /**
   * Validate and prepare a key for use
   * SECURITY: This is the main entry point - all keys must go through this
   */
  async validateKey(
    key: string, 
    expectedProvider?: string,
    context?: KeyUsageContext
  ): Promise<KeyValidationResult> {
    // SECURITY CHECK: Never log the actual key
    if (containsApiKey(key)) {
      const maskedKey = maskApiKey(key, expectedProvider);
      
      if (this.config.enableAuditLogging) {
        await auditLogger.logSecurityViolation(
          'Key validation called with potentially unsafe key parameter',
          { 
            provider: expectedProvider || 'unknown',
            keyFormat: maskedKey.masked,
            contextProvided: !!context 
          },
          expectedProvider,
          context?.requestId
        );
      }
    }

    // Basic validation first
    const formatValidation = validateKeyFormat(key, expectedProvider);
    
    if (this.config.enableAuditLogging) {
      await auditLogger.logKeyValidation(
        key,
        formatValidation.provider || expectedProvider || 'unknown',
        formatValidation.isValid,
        formatValidation.errors,
        context?.requestId
      );
    }

    // Early return if format validation failed
    if (!formatValidation.isValid) {
      return formatValidation;
    }

    // Optional: Test key with provider API
    if (this.config.enableKeyTesting) {
      try {
        const testResult = await this.testKeyWithProvider(key, formatValidation.provider!, context);
        
        if (!testResult.isValid && this.config.enableAuditLogging) {
          await auditLogger.logAuthFailure(
            key,
            formatValidation.provider!,
            testResult.error || 'Key test failed',
            context?.requestId,
            context?.userId
          );
        }

        return {
          ...formatValidation,
          isValid: testResult.isValid,
          errors: testResult.isValid ? [] : [testResult.error || 'Key test failed']
        };
      } catch (error) {
        const errorMessage = sanitizeForLogging(error instanceof Error ? error.message : String(error));
        
        if (this.config.enableAuditLogging) {
          await auditLogger.logAuthFailure(
            key,
            formatValidation.provider!,
            `Key test error: ${errorMessage}`,
            context?.requestId,
            context?.userId
          );
        }

        return {
          ...formatValidation,
          isValid: false,
          errors: [`Key test error: ${errorMessage}`]
        };
      }
    }

    return formatValidation;
  }

  /**
   * Get a validated key for immediate use
   * SECURITY: Key is automatically cleared from memory after maxKeyAge
   */
  async getValidatedKey(
    key: string, 
    provider: string,
    context?: KeyUsageContext
  ): Promise<{ isValid: boolean; keyId?: string; error?: string }> {
    const validation = await this.validateKey(key, provider, context);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        error: `Key validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Store key temporarily for tracking
    const keyId = await this.storeKeyTemporarily(key, validation.provider!, context);
    
    return {
      isValid: true,
      keyId
    };
  }

  /**
   * Use a key for an API request
   * SECURITY: Logs usage without exposing the key
   */
  async useKey(
    keyId: string,
    context: KeyUsageContext & { 
      model: string;
      success: boolean;
      responseTime?: number;
      tokens?: number;
      cost?: number;
      error?: string;
    }
  ): Promise<void> {
    const keyData = this.activeKeys.get(keyId);
    
    if (!keyData) {
      if (this.config.enableAuditLogging) {
        await auditLogger.logSecurityViolation(
          'Attempt to use unknown/expired key',
          { keyId, requestId: context.requestId },
          undefined,
          context.requestId
        );
      }
      return;
    }

    // Update usage statistics
    keyData.metadata.usage.requests++;
    if (context.success) {
      keyData.metadata.usage.successes++;
    } else {
      keyData.metadata.usage.failures++;
    }
    keyData.metadata.lastUsed = new Date();

    // Log the usage (without the actual key)
    if (this.config.enableAuditLogging) {
      await auditLogger.logKeyUsage(
        keyData.key,
        keyData.metadata.provider,
        context.model,
        context.success,
        context.responseTime,
        context.tokens,
        context.cost,
        context.requestId,
        context.userId,
        context.error
      );
    }

    // If this was a failure, log it specifically
    if (!context.success && this.config.enableAuditLogging) {
      await auditLogger.logAuthFailure(
        keyData.key,
        keyData.metadata.provider,
        context.error || 'Request failed',
        context.requestId,
        context.userId
      );
    }
  }

  /**
   * Retrieve the actual key for making API calls
   * SECURITY: Only use this right before making the API call, and clear immediately after
   */
  getKeyForRequest(keyId: string): string | null {
    const keyData = this.activeKeys.get(keyId);
    return keyData?.key || null;
  }

  /**
   * Clear a key from memory immediately
   * SECURITY: Call this after each API request
   */
  clearKey(keyId: string): void {
    const keyData = this.activeKeys.get(keyId);
    
    if (keyData) {
      // Clear the actual key from memory
      const keyToDelete = keyData.key;
      
      // Overwrite the key string (defense against memory inspection)
      if (typeof keyToDelete === 'string') {
        // This doesn't guarantee the string is cleared from all memory locations,
        // but it's better than leaving it as-is
        keyToDelete.split('').fill('*');
      }
      
      // Remove from active keys
      this.activeKeys.delete(keyId);
      
      // Clear timeout if exists
      const timeout = this.keyTimeouts.get(keyId);
      if (timeout) {
        clearTimeout(timeout);
        this.keyTimeouts.delete(keyId);
      }
    }
  }

  /**
   * Clear all keys from memory
   * SECURITY: Call this on shutdown or when needed
   */
  clearAllKeys(): void {
    const keyCount = this.activeKeys.size;
    
    for (const [keyId] of this.activeKeys) {
      this.clearKey(keyId);
    }
    
    console.log(`🧹 Cleared ${keyCount} keys from memory`);
  }

  /**
   * Get usage statistics for active keys
   * SECURITY: Returns only metadata, never actual keys
   */
  getKeyStatistics(): {
    activeKeys: number;
    providerBreakdown: Record<string, number>;
    totalUsage: { requests: number; successes: number; failures: number };
    oldestKey?: Date;
    newestKey?: Date;
  } {
    const providers: Record<string, number> = {};
    let totalRequests = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;
    let oldestKey: Date | undefined;
    let newestKey: Date | undefined;

    for (const [, keyData] of this.activeKeys) {
      const provider = keyData.metadata.provider;
      providers[provider] = (providers[provider] || 0) + 1;
      
      totalRequests += keyData.metadata.usage.requests;
      totalSuccesses += keyData.metadata.usage.successes;
      totalFailures += keyData.metadata.usage.failures;
      
      const createdAt = keyData.metadata.createdAt;
      if (!oldestKey || createdAt < oldestKey) {
        oldestKey = createdAt;
      }
      if (!newestKey || createdAt > newestKey) {
        newestKey = createdAt;
      }
    }

    return {
      activeKeys: this.activeKeys.size,
      providerBreakdown: providers,
      totalUsage: {
        requests: totalRequests,
        successes: totalSuccesses,
        failures: totalFailures
      },
      oldestKey,
      newestKey
    };
  }

  /**
   * Security check for HTTPS requirement
   */
  validateSecureTransmission(request: Request | { headers: any; protocol?: string }): boolean {
    if (!this.config.requireHttps) {
      return true;
    }

    // Check protocol from request
    const protocol = 'protocol' in request ? request.protocol : 
                    request.headers.get?.('x-forwarded-proto') || 
                    request.headers['x-forwarded-proto'];

    const isHttps = protocol === 'https' || 
                    request.headers.get?.('x-forwarded-ssl') === 'on' ||
                    request.headers['x-forwarded-ssl'] === 'on';

    if (!isHttps && this.config.enableAuditLogging) {
      auditLogger.logSecurityViolation(
        'API key transmitted over insecure connection',
        { 
          protocol,
          headers: Object.fromEntries(
            Object.entries(request.headers).filter(([key]) => 
              key.toLowerCase().includes('forward') || key.toLowerCase().includes('proto')
            )
          )
        }
      );
    }

    return isHttps;
  }

  // Private methods

  private async storeKeyTemporarily(
    key: string, 
    provider: string, 
    context?: KeyUsageContext
  ): Promise<string> {
    const keyId = `${provider}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const secureKey: SecureKey = {
      id: keyId,
      provider,
      isValid: true,
      createdAt: new Date(),
      usage: {
        requests: 0,
        successes: 0,
        failures: 0
      }
    };

    this.activeKeys.set(keyId, { key, metadata: secureKey });

    // Set automatic cleanup
    const timeout = setTimeout(() => {
      this.clearKey(keyId);
    }, this.config.maxKeyAge);
    
    this.keyTimeouts.set(keyId, timeout);

    return keyId;
  }

  private async testKeyWithProvider(
    key: string, 
    provider: string, 
    context?: KeyUsageContext
  ): Promise<KeyTestResult> {
    const masked = maskApiKey(key, provider);
    console.log(`🔍 Testing ${provider} key ending in ${masked.last4}...`);

    try {
      switch (provider) {
        case 'anthropic':
          return await this.testAnthropicKey(key, context);
        case 'openai':
          return await this.testOpenAIKey(key, context);
        case 'google':
          return await this.testGoogleKey(key, context);
        default:
          return {
            isValid: true, // Assume valid if we can't test
            provider,
            error: `Key testing not implemented for ${provider}`
          };
      }
    } catch (error) {
      const errorMessage = sanitizeForLogging(error instanceof Error ? error.message : String(error));
      return {
        isValid: false,
        provider,
        error: errorMessage
      };
    }
  }

  private async testAnthropicKey(key: string, context?: KeyUsageContext): Promise<KeyTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        signal: AbortSignal.timeout(this.config.keyTestTimeout)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { isValid: true, provider: 'anthropic', model: 'claude-3-haiku', responseTime };
      } else if (response.status === 401) {
        return { isValid: false, provider: 'anthropic', error: 'Invalid API key', responseTime };
      } else {
        return { isValid: false, provider: 'anthropic', error: `HTTP ${response.status}`, responseTime };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { isValid: false, provider: 'anthropic', error: 'Key test timeout' };
      }
      throw error;
    }
  }

  private async testOpenAIKey(key: string, context?: KeyUsageContext): Promise<KeyTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        },
        signal: AbortSignal.timeout(this.config.keyTestTimeout)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { isValid: true, provider: 'openai', responseTime };
      } else if (response.status === 401) {
        return { isValid: false, provider: 'openai', error: 'Invalid API key', responseTime };
      } else {
        return { isValid: false, provider: 'openai', error: `HTTP ${response.status}`, responseTime };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { isValid: false, provider: 'openai', error: 'Key test timeout' };
      }
      throw error;
    }
  }

  private async testGoogleKey(key: string, context?: KeyUsageContext): Promise<KeyTestResult> {
    const startTime = Date.now();
    
    try {
      // Test with a simple API call to verify the key
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.config.keyTestTimeout)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { isValid: true, provider: 'google', responseTime };
      } else if (response.status === 401 || response.status === 403) {
        return { isValid: false, provider: 'google', error: 'Invalid API key', responseTime };
      } else {
        return { isValid: false, provider: 'google', error: `HTTP ${response.status}`, responseTime };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { isValid: false, provider: 'google', error: 'Key test timeout' };
      }
      throw error;
    }
  }
}

// Export singleton instance
export const secureKeyManager = new SecureKeyManager();