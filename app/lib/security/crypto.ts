/**
 * Crypto utilities for secure API key handling
 * Provides key masking, format validation, and security helpers
 */

export interface KeyValidationResult {
  isValid: boolean;
  provider?: string;
  format?: string;
  errors: string[];
}

export interface MaskedKey {
  masked: string;
  last4: string;
  provider: string;
}

/**
 * Mask an API key showing only the last 4 characters
 * CRITICAL: Use this for ALL logging and error messages
 */
export function maskApiKey(key: string, provider?: string): MaskedKey {
  if (!key || typeof key !== 'string') {
    return {
      masked: '[INVALID_KEY]',
      last4: 'XXXX',
      provider: provider || 'unknown'
    };
  }

  const last4 = key.slice(-4);
  const maskedLength = Math.max(0, key.length - 4);
  const masked = '*'.repeat(maskedLength) + last4;

  return {
    masked,
    last4,
    provider: provider || detectProvider(key)
  };
}

/**
 * Validate API key format based on known provider patterns
 */
export function validateKeyFormat(key: string, expectedProvider?: string): KeyValidationResult {
  const errors: string[] = [];
  
  if (!key || typeof key !== 'string') {
    return {
      isValid: false,
      errors: ['Key must be a non-empty string']
    };
  }

  if (key.trim() !== key) {
    errors.push('Key contains leading/trailing whitespace');
  }

  if (key.length < 10) {
    errors.push('Key is too short (minimum 10 characters)');
  }

  if (key.length > 200) {
    errors.push('Key is too long (maximum 200 characters)');
  }

  // Check for common invalid patterns
  if (key.includes(' ')) {
    errors.push('Key contains spaces');
  }

  if (key.toLowerCase().includes('your_') || key.toLowerCase().includes('_here')) {
    errors.push('Key appears to be a placeholder value');
  }

  // Detect provider from key format
  const detectedProvider = detectProvider(key);
  
  // Validate against expected provider if specified
  if (expectedProvider && detectedProvider !== expectedProvider && detectedProvider !== 'unknown') {
    errors.push(`Key format suggests ${detectedProvider} but expected ${expectedProvider}`);
  }

  // Provider-specific validation
  const providerValidation = validateProviderSpecificFormat(key, detectedProvider);
  errors.push(...providerValidation.errors);

  return {
    isValid: errors.length === 0,
    provider: detectedProvider,
    format: getKeyFormat(key, detectedProvider),
    errors
  };
}

/**
 * Detect API key provider based on key format patterns
 */
export function detectProvider(key: string): string {
  if (!key || typeof key !== 'string') {
    return 'unknown';
  }

  // Anthropic keys typically start with "sk-ant-"
  if (key.startsWith('sk-ant-')) {
    return 'anthropic';
  }

  // OpenAI keys typically start with "sk-" (but not "sk-ant-")
  if (key.startsWith('sk-') && !key.startsWith('sk-ant-')) {
    return 'openai';
  }

  // Google API keys are typically 39 characters, all caps and numbers
  if (key.length === 39 && /^[A-Z0-9_-]+$/.test(key)) {
    return 'google';
  }

  // Cohere keys typically start with specific patterns
  if (key.match(/^[a-zA-Z0-9]{40,50}$/)) {
    return 'cohere';
  }

  // Mistral keys typically start with specific patterns
  if (key.startsWith('api_') || key.match(/^[a-f0-9]{32}$/)) {
    return 'mistral';
  }

  return 'unknown';
}

/**
 * Get a description of the key format
 */
function getKeyFormat(key: string, provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'sk-ant-[identifier]';
    case 'openai':
      return 'sk-[identifier]';
    case 'google':
      return '39-character alphanumeric string';
    case 'cohere':
      return '40-50 character alphanumeric string';
    case 'mistral':
      return 'api_[identifier] or 32-character hex';
    default:
      return `${key.length}-character string`;
  }
}

/**
 * Provider-specific key format validation
 */
function validateProviderSpecificFormat(key: string, provider: string): KeyValidationResult {
  const errors: string[] = [];

  switch (provider) {
    case 'anthropic':
      if (!key.startsWith('sk-ant-')) {
        errors.push('Anthropic keys must start with "sk-ant-"');
      }
      if (key.length < 50) {
        errors.push('Anthropic keys are typically longer than 50 characters');
      }
      break;

    case 'openai':
      if (!key.startsWith('sk-')) {
        errors.push('OpenAI keys must start with "sk-"');
      }
      if (key.startsWith('sk-ant-')) {
        errors.push('This appears to be an Anthropic key, not OpenAI');
      }
      if (key.length < 40) {
        errors.push('OpenAI keys are typically longer than 40 characters');
      }
      break;

    case 'google':
      if (key.length !== 39) {
        errors.push('Google API keys are typically exactly 39 characters');
      }
      if (!/^[A-Za-z0-9_-]+$/.test(key)) {
        errors.push('Google API keys contain only letters, numbers, underscores, and hyphens');
      }
      break;

    case 'cohere':
      if (key.length < 40 || key.length > 50) {
        errors.push('Cohere keys are typically 40-50 characters');
      }
      if (!/^[a-zA-Z0-9]+$/.test(key)) {
        errors.push('Cohere keys contain only letters and numbers');
      }
      break;

    case 'mistral':
      const isApiFormat = key.startsWith('api_');
      const isHexFormat = /^[a-f0-9]{32}$/.test(key);
      if (!isApiFormat && !isHexFormat) {
        errors.push('Mistral keys should start with "api_" or be a 32-character hex string');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Generate a secure random identifier for audit logging
 */
export function generateSecureId(prefix: string = 'key'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Sanitize strings for logging - removes potential key material
 */
export function sanitizeForLogging(text: string): string {
  if (!text || typeof text !== 'string') {
    return '[INVALID_INPUT]';
  }

  // Replace potential API keys with masked versions
  let sanitized = text;

  // Match common key patterns and mask them
  const keyPatterns = [
    /sk-ant-[a-zA-Z0-9_-]+/g,  // Anthropic keys
    /sk-[a-zA-Z0-9_-]{40,}/g,  // OpenAI keys
    /api_[a-zA-Z0-9_-]+/g,     // Mistral api_ keys
    /[A-Z0-9_-]{39}/g,         // Google keys (39 chars)
    /[a-f0-9]{32}/g            // Hex keys (32 chars)
  ];

  keyPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, (match) => {
      const masked = maskApiKey(match);
      return `[API_KEY:${masked.provider}:${masked.last4}]`;
    });
  });

  return sanitized;
}

/**
 * Check if a string contains potential API key material
 */
export function containsApiKey(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const keyPatterns = [
    /sk-ant-[a-zA-Z0-9_-]+/,
    /sk-[a-zA-Z0-9_-]{40,}/,
    /api_[a-zA-Z0-9_-]+/,
    /[A-Z0-9_-]{39}/,
    /[a-f0-9]{32}/
  ];

  return keyPatterns.some(pattern => pattern.test(text));
}

/**
 * Create a hash of an API key for comparison purposes
 * Uses SHA-256 for consistency but this is NOT for cryptographic security
 */
export async function hashKey(key: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Browser/Node.js with Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without crypto.subtle
    // This is less secure but better than storing keys in plain text
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}