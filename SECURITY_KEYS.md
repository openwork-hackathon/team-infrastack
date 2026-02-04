# API Key Security Documentation

## Overview

This document outlines the comprehensive security measures implemented for API key management in the AgentRouter service. The system implements **BYOK (Bring Your Own Key)** security patterns to ensure that user API keys are handled with maximum security and minimal risk.

## 🔐 Security Principles

### 1. **Never Store Keys**
- API keys are **NEVER** persisted to disk, databases, or configuration files
- Keys exist only in memory during active request processing
- Keys are automatically cleared from memory after each request
- No long-term storage or caching of API keys

### 2. **Never Log Keys**
- API keys are **NEVER** logged in plain text
- All logging uses masked key format showing only last 4 characters
- Error messages are sanitized to remove potential key material
- Audit logs track usage patterns without exposing keys

### 3. **Secure Transmission Only**
- API keys transmitted via secure headers only (never URL parameters)
- HTTPS required in production environments
- Keys rejected if found in query parameters (security violation logged)

### 4. **Comprehensive Audit Trail**
- All key usage logged without exposing actual keys
- Failed authentication attempts tracked
- Security violations automatically detected and logged
- Usage statistics available without key exposure

## 🏗️ Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Key Manager   │────│  Audit Logger   │────│   Crypto Utils  │
│   (Lifecycle)   │    │  (Usage Track)  │    │  (Mask/Validate)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Router Service  │
                    │ (Orchestration) │
                    └─────────────────┘
```

### File Structure

```
app/lib/security/
├── key-manager.ts     # Secure key lifecycle management
├── audit-log.ts       # Usage logging without key exposure  
├── crypto.ts          # Key masking and validation utilities
└── types.ts           # Security-related TypeScript types
```

## 🔑 Key Management Lifecycle

### 1. **Key Reception**
```typescript
// ✅ SECURE: Via headers
Authorization: Bearer sk-ant-...
x-api-key: sk-ant-...

// ❌ INSECURE: Via URL (automatically rejected)
/api/v1/chat?api_key=sk-ant-... // Security violation logged
```

### 2. **Key Validation**
```typescript
const validation = await secureKeyManager.validateKey(key, provider);
// - Format validation (length, prefix, characters)
// - Provider detection (anthropic, openai, google, etc.)
// - Optional: Live API testing (disabled by default)
```

### 3. **Secure Storage (Temporary)**
```typescript
const keyId = await secureKeyManager.getValidatedKey(key, provider, context);
// - Key stored temporarily with random ID
// - Automatic cleanup after 5 minutes (configurable)
// - Memory cleared on request completion
```

### 4. **Key Usage**
```typescript
const actualKey = secureKeyManager.getKeyForRequest(keyId);
// API call made with actual key
await secureKeyManager.useKey(keyId, usageContext); // Log usage
```

### 5. **Key Cleanup**
```typescript
secureKeyManager.clearKey(keyId);
// - Overwrites key string in memory
// - Removes from active key map
// - Clears automatic cleanup timer
```

## 🛡️ Security Features

### Key Format Validation
- **Anthropic**: `sk-ant-*` format validation
- **OpenAI**: `sk-*` format validation (excluding Anthropic keys)
- **Google**: 39-character alphanumeric validation
- **Cohere**: 40-50 character alphanumeric validation
- **Mistral**: `api_*` or 32-character hex validation

### Key Masking
```typescript
maskApiKey("sk-ant-api03_abcd...xyz123") 
// Returns: { masked: "********************xyz123", last4: "z123", provider: "anthropic" }
```

### Security Violation Detection
- API keys in URL parameters
- Keys in error messages or logs
- Insecure transmission attempts
- Invalid key format patterns

### Audit Logging
```typescript
// What IS logged:
{
  timestamp: "2026-02-04T14:30:00Z",
  type: "key_usage",
  provider: "anthropic", 
  keyId: "anthropic_z123_key_1649123456_abc",
  success: true,
  model: "claude-3.5-sonnet",
  tokens: 1250,
  cost: 0.00375
}

// What is NEVER logged:
{
  apiKey: "sk-ant-api03_...", // ❌ NEVER
  key: "...",                 // ❌ NEVER  
  actualKey: "..."           // ❌ NEVER
}
```

## 🚀 Usage Examples

### Basic BYOK Request
```typescript
const response = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-ant-your-key-here'
  },
  body: JSON.stringify({
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

### Router Service Integration
```typescript
const unifiedRequest = {
  model: 'claude-3.5-sonnet',
  messages: [...],
  apiKey: userProvidedKey,  // BYOK pattern
  context: {
    requestId: 'req_123',
    userId: 'user_456',
    endpoint: '/api/v1/chat'
  }
};

const response = await routerService.route(unifiedRequest);
// Key automatically validated, used, logged, and cleared
```

## 📊 Monitoring & Analytics

### Usage Statistics (Key-Safe)
```typescript
const stats = secureKeyManager.getKeyStatistics();
// {
//   activeKeys: 3,
//   providerBreakdown: { anthropic: 2, openai: 1 },
//   totalUsage: { requests: 150, successes: 147, failures: 3 }
// }
```

### Audit Events
```typescript
const events = auditLogger.getRecentEvents(50);
const violations = auditLogger.getSecurityViolations(10);
const providerEvents = auditLogger.getProviderEvents('anthropic', 25);
```

### Export Audit Data
```typescript
const jsonExport = auditLogger.exportEvents('json');
const csvExport = auditLogger.exportEvents('csv');
```

## ⚙️ Configuration

### Key Manager Configuration
```typescript
const keyManager = new SecureKeyManager({
  enableKeyValidation: true,     // Validate key format
  enableKeyTesting: false,       // Test with provider API (off by default)
  enableAuditLogging: true,      // Log usage patterns
  keyTestTimeout: 5000,          // API test timeout (ms)
  maxKeyAge: 5 * 60 * 1000,     // Max memory retention (5 mins)
  requireHttps: true             // Require HTTPS in production
});
```

### Environment Variables
```bash
# Required for production
NODE_ENV=production              # Enables HTTPS requirement
ANTHROPIC_API_KEY=              # For server-side operations (optional)
OPENAI_API_KEY=                 # For server-side operations (optional)  
GOOGLE_API_KEY=                 # For server-side operations (optional)

# Security configuration
ENABLE_KEY_TESTING=false        # Enable live API key testing
MAX_KEY_AGE_MS=300000          # Key memory retention (5 mins default)
AUDIT_LOG_LEVEL=standard       # minimal|standard|detailed
```

## 🚨 Security Violations

### Automatic Detection
The system automatically detects and logs these security violations:

1. **API key in URL parameters**
   ```
   GET /api/chat?api_key=sk-ant-...  # ❌ Violation logged
   ```

2. **Insecure transmission** (non-HTTPS in production)
   ```
   http://api.example.com/chat    # ❌ Violation logged
   ```

3. **Key material in error messages**
   ```javascript
   throw new Error(`Invalid key: sk-ant-...`); // ❌ Auto-detected & sanitized
   ```

4. **Unknown/expired key usage attempts**
   ```typescript
   secureKeyManager.useKey('invalid_key_id', ...); // ❌ Violation logged
   ```

### Response to Violations
- Immediate logging with sanitized details
- Request rejection with generic error message
- Automatic audit trail creation
- No sensitive data exposure in responses

## ✅ Best Practices

### For Developers

1. **Never hardcode API keys**
   ```typescript
   // ❌ BAD
   const apiKey = "sk-ant-api03...";
   
   // ✅ GOOD  
   const apiKey = request.headers.get('x-api-key');
   ```

2. **Always use secure headers**
   ```typescript
   // ✅ GOOD
   Authorization: Bearer sk-ant-...
   x-api-key: sk-ant-...
   
   // ❌ BAD
   ?api_key=sk-ant-...
   ```

3. **Sanitize errors before logging**
   ```typescript
   // ✅ GOOD
   console.error('Auth failed:', sanitizeForLogging(error.message));
   
   // ❌ BAD
   console.error('Auth failed:', error.message); // May contain key
   ```

4. **Clear keys immediately after use**
   ```typescript
   try {
     const response = await apiCall(key);
     return response;
   } finally {
     secureKeyManager.clearKey(keyId); // Always cleanup
   }
   ```

### For API Users

1. **Use Authorization header**
   ```bash
   curl -H "Authorization: Bearer sk-ant-..." \
        -H "Content-Type: application/json" \
        -d '{"model":"claude-3.5-sonnet","messages":[...]}' \
        https://your-api.com/v1/chat/completions
   ```

2. **Never put keys in URLs**
   ```bash
   # ❌ BAD - Key visible in logs, history, cache
   curl "https://api.com/chat?api_key=sk-ant-..."
   
   # ✅ GOOD - Key in secure header
   curl -H "x-api-key: sk-ant-..." https://api.com/chat
   ```

3. **Rotate keys regularly**
   - Generate new API keys from provider dashboards
   - Update applications with new keys
   - Revoke old keys after successful migration

4. **Monitor usage via audit logs**
   - Check for unexpected usage patterns
   - Monitor failed authentication attempts
   - Review security violation alerts

## 🔍 Troubleshooting

### Common Issues

1. **"Key validation failed"**
   - Check key format matches provider expectations
   - Verify key hasn't expired or been revoked
   - Ensure key has necessary permissions

2. **"HTTPS required"**
   - Use HTTPS in production environments
   - Check proxy/load balancer SSL termination
   - Verify x-forwarded-proto headers

3. **"Key found in URL parameters"**
   - Move API key to Authorization header
   - Use x-api-key header as alternative
   - Never put sensitive data in URLs

4. **High memory usage**
   - Keys may not be clearing properly
   - Check maxKeyAge configuration
   - Monitor active key count: `keyManager.getKeyStatistics()`

### Debug Commands

```typescript
// Check active keys (no sensitive data exposed)
console.log(secureKeyManager.getKeyStatistics());

// Review recent audit events  
console.log(auditLogger.getRecentEvents(10));

// Check for security violations
console.log(auditLogger.getSecurityViolations(5));

// Clear all keys from memory
secureKeyManager.clearAllKeys();
```

## 🔄 Migration Guide

### From Insecure Implementation

1. **Remove persistent key storage**
   ```typescript
   // ❌ Remove this
   const apiKeys = new Map<string, string>();
   
   // ✅ Replace with
   import { secureKeyManager } from './security/key-manager';
   ```

2. **Update request handling**
   ```typescript
   // ❌ Old way
   const apiKey = config.openaiApiKey;
   
   // ✅ New way (BYOK)
   const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
   const keyValidation = await secureKeyManager.getValidatedKey(apiKey, 'openai');
   ```

3. **Replace console.log statements**
   ```typescript
   // ❌ Dangerous
   console.log('Using key:', apiKey);
   
   // ✅ Safe
   console.log('Key validated:', maskApiKey(apiKey).masked);
   ```

4. **Add cleanup in request handlers**
   ```typescript
   try {
     // Request processing
   } finally {
     if (keyId) secureKeyManager.clearKey(keyId);
   }
   ```

## 📞 Support

### Security Issues
Report security vulnerabilities immediately:
- Create private issue in repository
- Include detailed description (no actual keys!)
- Proposed fix if available

### Configuration Help
- Check environment variables match documentation
- Verify HTTPS configuration in production
- Review audit logs for configuration issues

### Performance Optimization
- Monitor key statistics for memory usage
- Adjust maxKeyAge for your use case
- Consider disabling keyTesting if not needed

---

**Last Updated**: February 4, 2026  
**Security Review**: Pending  
**Next Audit**: TBD

> **⚠️ IMPORTANT**: This security system is designed for high-sensitivity API key management. Always review and test thoroughly before deploying to production environments.