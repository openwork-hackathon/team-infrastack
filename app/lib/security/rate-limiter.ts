// Rate limiting implementation for InfraStack APIs
// Provides per-IP and per-API-key rate limiting with multiple strategies

import { NextRequest } from 'next/server';

export interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  message?: string;     // Custom error message
  keyGenerator?: (req: NextRequest) => string;
  skipOnSuccess?: boolean;
  skipOnFailure?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetTime: number;
  error?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstHit: number;
}

// In-memory store for rate limiting (use Redis in production)
class MemoryStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // Check if entry has expired
    if (Date.now() > entry.resetTime) {
      this.store.delete(key);
      return null;
    }
    
    return entry;
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now();
    const existing = await this.get(key);
    
    if (existing) {
      existing.count++;
      await this.set(key, existing);
      return existing;
    } else {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
        firstHit: now
      };
      await this.set(key, newEntry);
      return newEntry;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

const store = new MemoryStore();

// Default rate limit configurations
export const RATE_LIMIT_CONFIGS = {
  // Public endpoints - strict limits
  public: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 100,          // 100 requests per 15 minutes
    message: 'Too many requests from this IP, please try again later'
  },
  
  // AI routing endpoints - moderate limits
  routing: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 30,           // 30 requests per minute
    message: 'Rate limit exceeded for AI routing'
  },
  
  // Orchestration - lower limits due to cost
  orchestration: {
    windowMs: 60 * 1000,       // 1 minute  
    maxRequests: 10,           // 10 requests per minute
    message: 'Orchestration rate limit exceeded'
  },
  
  // Vault operations - very strict
  vault: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 20,           // 20 requests per minute
    message: 'Vault operation rate limit exceeded'
  },
  
  // Authenticated users - higher limits
  authenticated: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 100,          // 100 requests per minute
    message: 'Rate limit exceeded for authenticated user'
  }
} as const;

// Extract client identifier from request
function getClientKey(req: NextRequest, useApiKey: boolean = false): string {
  // Try API key first if requested
  if (useApiKey) {
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
    if (apiKey) {
      return `api:${apiKey.substring(0, 16)}...`; // Partial hash for privacy
    }
  }
  
  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const remoteAddr = forwarded?.split(',')[0] || realIp || 'unknown';
  
  return `ip:${remoteAddr}`;
}

// Main rate limiting function
export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  useApiKey: boolean = false
): Promise<RateLimitResult> {
  try {
    const clientKey = config.keyGenerator ? config.keyGenerator(req) : getClientKey(req, useApiKey);
    const entry = await store.increment(clientKey, config.windowMs);
    
    const limit = config.maxRequests;
    const used = entry.count;
    const remaining = Math.max(0, limit - used);
    const resetTime = entry.resetTime;
    
    if (used > limit) {
      return {
        success: false,
        limit,
        used,
        remaining: 0,
        resetTime,
        error: config.message || 'Rate limit exceeded'
      };
    }
    
    return {
      success: true,
      limit,
      used,
      remaining,
      resetTime
    };
    
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open - allow request if rate limiting fails
    return {
      success: true,
      limit: config.maxRequests,
      used: 0,
      remaining: config.maxRequests,
      resetTime: Date.now() + config.windowMs
    };
  }
}

// Convenience functions for common rate limiting patterns
export async function rateLimitPublic(req: NextRequest): Promise<RateLimitResult> {
  return rateLimit(req, RATE_LIMIT_CONFIGS.public);
}

export async function rateLimitRouting(req: NextRequest): Promise<RateLimitResult> {
  return rateLimit(req, RATE_LIMIT_CONFIGS.routing);
}

export async function rateLimitOrchestration(req: NextRequest): Promise<RateLimitResult> {
  return rateLimit(req, RATE_LIMIT_CONFIGS.orchestration);
}

export async function rateLimitVault(req: NextRequest): Promise<RateLimitResult> {
  return rateLimit(req, RATE_LIMIT_CONFIGS.vault);
}

export async function rateLimitAuthenticated(req: NextRequest): Promise<RateLimitResult> {
  return rateLimit(req, RATE_LIMIT_CONFIGS.authenticated, true);
}

// Advanced rate limiting with burst support
export async function burstRateLimit(
  req: NextRequest,
  shortConfig: RateLimitConfig,
  longConfig: RateLimitConfig,
  useApiKey: boolean = false
): Promise<RateLimitResult> {
  const shortResult = await rateLimit(req, shortConfig, useApiKey);
  const longResult = await rateLimit(req, longConfig, useApiKey);
  
  // Fail if either limit is exceeded
  if (!shortResult.success) {
    return shortResult;
  }
  
  if (!longResult.success) {
    return longResult;
  }
  
  // Return the more restrictive limit
  return shortResult.remaining < longResult.remaining ? shortResult : longResult;
}

// Token-based rate limiting (for AI operations)
interface TokenRateLimitConfig {
  windowMs: number;
  maxTokens: number;
  estimateTokens: (req: NextRequest) => Promise<number>;
}

export async function tokenRateLimit(
  req: NextRequest,
  config: TokenRateLimitConfig
): Promise<RateLimitResult> {
  try {
    const clientKey = getClientKey(req, true);
    const tokenKey = `tokens:${clientKey}`;
    
    const estimatedTokens = await config.estimateTokens(req);
    const existing = await store.get(tokenKey);
    
    if (!existing) {
      // First request in window
      await store.set(tokenKey, {
        count: estimatedTokens,
        resetTime: Date.now() + config.windowMs,
        firstHit: Date.now()
      });
      
      return {
        success: true,
        limit: config.maxTokens,
        used: estimatedTokens,
        remaining: config.maxTokens - estimatedTokens,
        resetTime: Date.now() + config.windowMs
      };
    }
    
    // Check if adding tokens would exceed limit
    const newTotal = existing.count + estimatedTokens;
    
    if (newTotal > config.maxTokens) {
      return {
        success: false,
        limit: config.maxTokens,
        used: existing.count,
        remaining: Math.max(0, config.maxTokens - existing.count),
        resetTime: existing.resetTime,
        error: `Token rate limit exceeded. Estimated tokens: ${estimatedTokens}, Available: ${Math.max(0, config.maxTokens - existing.count)}`
      };
    }
    
    // Update token count
    existing.count = newTotal;
    await store.set(tokenKey, existing);
    
    return {
      success: true,
      limit: config.maxTokens,
      used: newTotal,
      remaining: config.maxTokens - newTotal,
      resetTime: existing.resetTime
    };
    
  } catch (error) {
    console.error('Token rate limiting error:', error);
    // Fail open for token limits
    return {
      success: true,
      limit: config.maxTokens,
      used: 0,
      remaining: config.maxTokens,
      resetTime: Date.now() + config.windowMs
    };
  }
}

// Cleanup function for graceful shutdown
export function cleanup(): void {
  store.destroy();
}

// Export the store for testing
export { store as _store };