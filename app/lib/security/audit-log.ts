/**
 * Security Audit Logging System
 * Logs API key usage and authentication events WITHOUT logging the keys themselves
 * CRITICAL: Never log actual API keys - only usage patterns and metadata
 */

import { maskApiKey, generateSecureId, sanitizeForLogging, hashKey } from './crypto';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  type: AuditEventType;
  provider: string;
  keyId: string;        // Masked identifier, not the actual key
  userId?: string;      // If available from request context
  requestId?: string;   // Correlation with application logs
  success: boolean;
  metadata: Record<string, any>;
  error?: string;       // Sanitized error message
}

export enum AuditEventType {
  KEY_VALIDATION = 'key_validation',
  KEY_USAGE = 'key_usage',
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILURE = 'auth_failure',
  KEY_EXPIRED = 'key_expired',
  KEY_INVALID = 'key_invalid',
  RATE_LIMIT = 'rate_limit',
  PROVIDER_ERROR = 'provider_error',
  SECURITY_VIOLATION = 'security_violation'
}

export interface AuditLogConfig {
  maxEvents?: number;        // Maximum events to keep in memory
  maxAge?: number;          // Maximum age in milliseconds
  enableConsoleLog?: boolean;
  enableFileLog?: boolean;
  logLevel?: 'minimal' | 'standard' | 'detailed';
}

export interface UsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  providerStats: Record<string, {
    requests: number;
    successes: number;
    failures: number;
    lastUsed: Date;
    errors: Record<string, number>;
  }>;
  timeRanges: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
}

class SecurityAuditLogger {
  private events: AuditEvent[] = [];
  private config: Required<AuditLogConfig>;
  private keyHashes: Map<string, string> = new Map(); // Hash -> KeyId mapping

  constructor(config: AuditLogConfig = {}) {
    this.config = {
      maxEvents: config.maxEvents || 10000,
      maxAge: config.maxAge || 30 * 24 * 60 * 60 * 1000, // 30 days
      enableConsoleLog: config.enableConsoleLog ?? true,
      enableFileLog: config.enableFileLog ?? false,
      logLevel: config.logLevel || 'standard'
    };

    // Clean up old events periodically
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Log API key validation attempt
   */
  async logKeyValidation(
    key: string,
    provider: string,
    isValid: boolean,
    errors: string[] = [],
    requestId?: string
  ): Promise<void> {
    const maskedKey = maskApiKey(key, provider);
    const keyId = await this.getOrCreateKeyId(key);

    const event: AuditEvent = {
      id: generateSecureId('audit'),
      timestamp: new Date(),
      type: AuditEventType.KEY_VALIDATION,
      provider,
      keyId,
      requestId,
      success: isValid,
      metadata: {
        errors: errors.map(e => sanitizeForLogging(e)),
        keyFormat: maskedKey.masked.length > 10 ? 'long' : 'short'
      },
      error: errors.length > 0 ? sanitizeForLogging(errors.join('; ')) : undefined
    };

    this.addEvent(event);
  }

  /**
   * Log API key usage for a provider request
   */
  async logKeyUsage(
    key: string,
    provider: string,
    model: string,
    success: boolean,
    responseTime?: number,
    tokens?: number,
    cost?: number,
    requestId?: string,
    userId?: string,
    error?: string
  ): Promise<void> {
    const keyId = await this.getOrCreateKeyId(key);

    const event: AuditEvent = {
      id: generateSecureId('usage'),
      timestamp: new Date(),
      type: AuditEventType.KEY_USAGE,
      provider,
      keyId,
      requestId,
      userId,
      success,
      metadata: {
        model,
        responseTime,
        tokens,
        cost
      },
      error: error ? sanitizeForLogging(error) : undefined
    };

    this.addEvent(event);
  }

  /**
   * Log authentication success
   */
  async logAuthSuccess(
    key: string,
    provider: string,
    requestId?: string,
    userId?: string
  ): Promise<void> {
    const keyId = await this.getOrCreateKeyId(key);

    const event: AuditEvent = {
      id: generateSecureId('auth'),
      timestamp: new Date(),
      type: AuditEventType.AUTH_SUCCESS,
      provider,
      keyId,
      requestId,
      userId,
      success: true,
      metadata: {}
    };

    this.addEvent(event);
  }

  /**
   * Log authentication failure
   */
  async logAuthFailure(
    key: string,
    provider: string,
    reason: string,
    requestId?: string,
    userId?: string
  ): Promise<void> {
    const keyId = await this.getOrCreateKeyId(key);

    const event: AuditEvent = {
      id: generateSecureId('auth'),
      timestamp: new Date(),
      type: AuditEventType.AUTH_FAILURE,
      provider,
      keyId,
      requestId,
      userId,
      success: false,
      metadata: {},
      error: sanitizeForLogging(reason)
    };

    this.addEvent(event);
  }

  /**
   * Log security violation (e.g., key in URL, key in logs, etc.)
   */
  async logSecurityViolation(
    violation: string,
    details: Record<string, any>,
    provider?: string,
    requestId?: string
  ): Promise<void> {
    const event: AuditEvent = {
      id: generateSecureId('security'),
      timestamp: new Date(),
      type: AuditEventType.SECURITY_VIOLATION,
      provider: provider || 'unknown',
      keyId: 'N/A',
      requestId,
      success: false,
      metadata: {
        violation: sanitizeForLogging(violation),
        details: Object.fromEntries(
          Object.entries(details).map(([k, v]) => [k, sanitizeForLogging(String(v))])
        )
      }
    };

    this.addEvent(event);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): UsageStats {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const usageEvents = this.events.filter(e => e.type === AuditEventType.KEY_USAGE);
    
    const stats: UsageStats = {
      totalRequests: usageEvents.length,
      successfulRequests: usageEvents.filter(e => e.success).length,
      failedRequests: usageEvents.filter(e => !e.success).length,
      providerStats: {},
      timeRanges: {
        last24h: usageEvents.filter(e => e.timestamp >= last24h).length,
        last7d: usageEvents.filter(e => e.timestamp >= last7d).length,
        last30d: usageEvents.filter(e => e.timestamp >= last30d).length
      }
    };

    // Build provider statistics
    usageEvents.forEach(event => {
      const provider = event.provider;
      if (!stats.providerStats[provider]) {
        stats.providerStats[provider] = {
          requests: 0,
          successes: 0,
          failures: 0,
          lastUsed: event.timestamp,
          errors: {}
        };
      }

      const providerStats = stats.providerStats[provider];
      providerStats.requests++;
      
      if (event.success) {
        providerStats.successes++;
      } else {
        providerStats.failures++;
        if (event.error) {
          const errorKey = event.error.substring(0, 50); // Limit error key length
          providerStats.errors[errorKey] = (providerStats.errors[errorKey] || 0) + 1;
        }
      }

      if (event.timestamp > providerStats.lastUsed) {
        providerStats.lastUsed = event.timestamp;
      }
    });

    return stats;
  }

  /**
   * Get recent events (for debugging, with sensitive data already masked)
   */
  getRecentEvents(limit: number = 100): AuditEvent[] {
    return this.events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get events for a specific provider
   */
  getProviderEvents(provider: string, limit: number = 100): AuditEvent[] {
    return this.events
      .filter(e => e.provider === provider)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get security violations
   */
  getSecurityViolations(limit: number = 50): AuditEvent[] {
    return this.events
      .filter(e => e.type === AuditEventType.SECURITY_VIOLATION)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clear all audit events (use with caution)
   */
  clearEvents(): void {
    this.events = [];
    this.keyHashes.clear();
    console.log('🧹 Audit log cleared');
  }

  /**
   * Export audit events for external analysis
   */
  exportEvents(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'type', 'provider', 'keyId', 'success', 'error'];
      const rows = this.events.map(event => [
        event.timestamp.toISOString(),
        event.type,
        event.provider,
        event.keyId,
        event.success.toString(),
        event.error || ''
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    } else {
      return JSON.stringify(this.events, null, 2);
    }
  }

  // Private methods

  private async getOrCreateKeyId(key: string): Promise<string> {
    try {
      const hash = await hashKey(key);
      
      if (!this.keyHashes.has(hash)) {
        const maskedKey = maskApiKey(key);
        const keyId = `${maskedKey.provider}_${maskedKey.last4}_${generateSecureId('key').split('_')[1]}`;
        this.keyHashes.set(hash, keyId);
      }

      return this.keyHashes.get(hash)!;
    } catch (error) {
      // Fallback if hashing fails
      const maskedKey = maskApiKey(key);
      return `${maskedKey.provider}_${maskedKey.last4}_fallback`;
    }
  }

  private addEvent(event: AuditEvent): void {
    this.events.push(event);

    // Log to console if enabled
    if (this.config.enableConsoleLog) {
      this.logToConsole(event);
    }

    // Trim events if over limit
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents);
    }
  }

  private logToConsole(event: AuditEvent): void {
    const level = event.success ? 'info' : 'warn';
    const emoji = this.getEventEmoji(event.type, event.success);
    
    const logData = {
      timestamp: event.timestamp.toISOString(),
      type: event.type,
      provider: event.provider,
      keyId: event.keyId,
      success: event.success,
      ...(event.requestId && { requestId: event.requestId }),
      ...(event.error && { error: event.error }),
      ...(this.config.logLevel === 'detailed' && { metadata: event.metadata })
    };

    console[level](`${emoji} [AUDIT] ${event.type}:`, logData);
  }

  private getEventEmoji(type: AuditEventType, success: boolean): string {
    if (!success) return '⚠️';
    
    switch (type) {
      case AuditEventType.KEY_VALIDATION: return '🔍';
      case AuditEventType.KEY_USAGE: return '🔑';
      case AuditEventType.AUTH_SUCCESS: return '✅';
      case AuditEventType.AUTH_FAILURE: return '❌';
      case AuditEventType.SECURITY_VIOLATION: return '🚨';
      default: return '📝';
    }
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - this.config.maxAge);
    const initialCount = this.events.length;
    
    this.events = this.events.filter(event => event.timestamp >= cutoff);
    
    const removedCount = initialCount - this.events.length;
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} old audit events`);
    }
  }
}

// Export singleton instance
export const auditLogger = new SecurityAuditLogger({
  enableConsoleLog: process.env.NODE_ENV !== 'production',
  logLevel: process.env.NODE_ENV === 'production' ? 'minimal' : 'standard'
});

// Export types and class for custom instances
export { SecurityAuditLogger };