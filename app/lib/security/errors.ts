// Safe error handling for InfraStack APIs
// Prevents information disclosure and standardizes error responses

import { NextResponse } from 'next/server';

export interface SafeError {
  code: string;
  message: string;
  details?: Record<string, any>;
  status: number;
  timestamp: string;
  requestId?: string;
}

export interface ErrorLogEntry {
  level: 'error' | 'warn' | 'info';
  message: string;
  error?: Error;
  context?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

// Error codes for different types of errors
export const ERROR_CODES = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_API_KEY: 'INVALID_API_KEY',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOKEN_LIMIT_EXCEEDED: 'TOKEN_LIMIT_EXCEEDED',
  
  // Resource errors (404/409)
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  
  // External service errors (502/503)
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  
  // Internal errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR'
} as const;

// Safe error messages that don't leak implementation details
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.VALIDATION_ERROR]: 'The provided input is invalid',
  [ERROR_CODES.INVALID_INPUT]: 'Invalid input format',
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Required field is missing',
  [ERROR_CODES.INVALID_FORMAT]: 'Input format is invalid',
  
  [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
  [ERROR_CODES.FORBIDDEN]: 'Access denied',
  [ERROR_CODES.INVALID_API_KEY]: 'Invalid API key',
  [ERROR_CODES.EXPIRED_TOKEN]: 'Token has expired',
  
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please try again later',
  [ERROR_CODES.TOKEN_LIMIT_EXCEEDED]: 'Token usage limit exceeded',
  
  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.ALREADY_EXISTS]: 'Resource already exists',
  [ERROR_CODES.RESOURCE_CONFLICT]: 'Resource conflict',
  
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 'External service temporarily unavailable',
  [ERROR_CODES.MODEL_UNAVAILABLE]: 'AI model temporarily unavailable',
  [ERROR_CODES.PROVIDER_ERROR]: 'AI provider service error',
  
  [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
  [ERROR_CODES.DATABASE_ERROR]: 'Database operation failed',
  [ERROR_CODES.CONFIG_ERROR]: 'Configuration error'
};

// Status codes for error types
const ERROR_STATUS_CODES: Record<string, number> = {
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_INPUT]: 400,
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 400,
  [ERROR_CODES.INVALID_FORMAT]: 400,
  
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.INVALID_API_KEY]: 401,
  [ERROR_CODES.EXPIRED_TOKEN]: 401,
  
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
  [ERROR_CODES.TOKEN_LIMIT_EXCEEDED]: 429,
  
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.ALREADY_EXISTS]: 409,
  [ERROR_CODES.RESOURCE_CONFLICT]: 409,
  
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 502,
  [ERROR_CODES.MODEL_UNAVAILABLE]: 503,
  [ERROR_CODES.PROVIDER_ERROR]: 502,
  
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.CONFIG_ERROR]: 500
};

// Create a safe error object
export function createSafeError(
  code: keyof typeof ERROR_CODES,
  details?: Record<string, any>,
  customMessage?: string,
  requestId?: string
): SafeError {
  return {
    code,
    message: customMessage || SAFE_ERROR_MESSAGES[code],
    details: sanitizeDetails(details),
    status: ERROR_STATUS_CODES[code] || 500,
    timestamp: new Date().toISOString(),
    requestId
  };
}

// Sanitize error details to prevent information disclosure
function sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
  if (!details) return undefined;
  
  const sanitized: Record<string, any> = {};
  const allowedFields = [
    'field', 'value', 'expected', 'received', 'limit', 'remaining', 
    'resetTime', 'modelName', 'provider', 'retryAfter'
  ];
  
  for (const [key, value] of Object.entries(details)) {
    if (allowedFields.includes(key)) {
      // Further sanitize specific fields
      if (key === 'value' && typeof value === 'string') {
        // Truncate long values and remove sensitive patterns
        sanitized[key] = sanitizeValue(value);
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
  }
  
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

// Sanitize values to prevent injection attacks and information disclosure
function sanitizeValue(value: string): string {
  if (typeof value !== 'string') return String(value);
  
  // Truncate very long values
  if (value.length > 200) {
    value = value.substring(0, 200) + '...';
  }
  
  // Remove potential API keys, tokens, and sensitive patterns
  value = value.replace(/\b[a-zA-Z0-9]{20,}\b/g, '[REDACTED]'); // Long alphanumeric strings
  value = value.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED]'); // Base64 patterns
  value = value.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'bearer [REDACTED]');
  value = value.replace(/api[_-]?key[_-]?[a-zA-Z0-9]+/gi, 'apikey [REDACTED]');
  
  return value;
}

// Convert any error to a safe error
export function toSafeError(
  error: unknown,
  fallbackCode: keyof typeof ERROR_CODES = 'INTERNAL_ERROR',
  requestId?: string
): SafeError {
  // Handle known safe errors
  if (isSafeError(error)) {
    return { ...error, requestId: requestId || error.requestId };
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    // Check if it's a known error pattern
    const code = classifyError(error);
    return createSafeError(code, undefined, undefined, requestId);
  }
  
  // Handle validation errors from Zod or similar
  if (isValidationError(error)) {
    return createSafeError('VALIDATION_ERROR', {
      field: getValidationField(error),
      expected: getValidationExpected(error)
    }, undefined, requestId);
  }
  
  // Fallback for unknown errors
  return createSafeError(fallbackCode, undefined, undefined, requestId);
}

// Type guard for SafeError
function isSafeError(error: unknown): error is SafeError {
  return typeof error === 'object' &&
         error !== null &&
         'code' in error &&
         'message' in error &&
         'status' in error &&
         'timestamp' in error;
}

// Classify error based on message patterns
function classifyError(error: Error): keyof typeof ERROR_CODES {
  const message = error.message.toLowerCase();
  
  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'RATE_LIMIT_EXCEEDED';
  }
  
  // Authentication
  if (message.includes('unauthorized') || message.includes('authentication')) {
    return 'UNAUTHORIZED';
  }
  
  // Validation
  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return 'VALIDATION_ERROR';
  }
  
  // External services
  if (message.includes('timeout') || message.includes('network') || message.includes('fetch')) {
    return 'EXTERNAL_SERVICE_ERROR';
  }
  
  // Model/Provider errors
  if (message.includes('model') && (message.includes('unavailable') || message.includes('not found'))) {
    return 'MODEL_UNAVAILABLE';
  }
  
  return 'INTERNAL_ERROR';
}

// Check if error is a validation error (Zod, Joi, etc.)
function isValidationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  
  // Zod error detection
  if ('issues' in error || 'errors' in error) return true;
  
  // Joi error detection  
  if ('details' in error && Array.isArray((error as any).details)) return true;
  
  return false;
}

// Extract field name from validation error
function getValidationField(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  
  // Zod error
  if ('issues' in error && Array.isArray((error as any).issues)) {
    const firstIssue = (error as any).issues[0];
    return firstIssue?.path?.join('.') || firstIssue?.path?.[0];
  }
  
  // Joi error
  if ('details' in error && Array.isArray((error as any).details)) {
    return (error as any).details[0]?.path?.join('.') || (error as any).details[0]?.context?.key;
  }
  
  return undefined;
}

// Extract expected value from validation error
function getValidationExpected(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  
  // Zod error
  if ('issues' in error && Array.isArray((error as any).issues)) {
    const firstIssue = (error as any).issues[0];
    return firstIssue?.expected || firstIssue?.message;
  }
  
  // Joi error
  if ('details' in error && Array.isArray((error as any).details)) {
    return (error as any).details[0]?.type;
  }
  
  return undefined;
}

// Create a NextResponse from a SafeError
export function createErrorResponse(error: SafeError): NextResponse {
  // Log the error securely
  logError(error);
  
  // Return standardized error response
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
        timestamp: error.timestamp,
        ...(error.requestId && { requestId: error.requestId })
      }
    },
    { 
      status: error.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Code': error.code,
        ...(error.requestId && { 'X-Request-ID': error.requestId })
      }
    }
  );
}

// Secure error logging
function logError(error: SafeError): void {
  const logEntry: ErrorLogEntry = {
    level: error.status >= 500 ? 'error' : error.status >= 400 ? 'warn' : 'info',
    message: `${error.code}: ${error.message}`,
    context: {
      code: error.code,
      status: error.status,
      timestamp: error.timestamp,
      ...(error.requestId && { requestId: error.requestId }),
      ...(error.details && { details: error.details })
    },
    timestamp: new Date().toISOString(),
    requestId: error.requestId
  };
  
  // Use appropriate log level
  if (logEntry.level === 'error') {
    console.error('[ERROR]', JSON.stringify(logEntry));
  } else if (logEntry.level === 'warn') {
    console.warn('[WARN]', JSON.stringify(logEntry));
  } else {
    console.info('[INFO]', JSON.stringify(logEntry));
  }
}

// Wrapper for async route handlers with error handling
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R | NextResponse> => {
    const requestId = generateRequestId();
    
    try {
      return await handler(...args);
    } catch (error) {
      const safeError = toSafeError(error, 'INTERNAL_ERROR', requestId);
      return createErrorResponse(safeError);
    }
  };
}

// Generate a request ID for tracing
function generateRequestId(): string {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

// Convenience functions for common error types
export const Errors = {
  validation: (field: string, expected: string, requestId?: string) => 
    createSafeError('VALIDATION_ERROR', { field, expected }, undefined, requestId),
    
  unauthorized: (requestId?: string) =>
    createSafeError('UNAUTHORIZED', undefined, undefined, requestId),
    
  forbidden: (requestId?: string) =>
    createSafeError('FORBIDDEN', undefined, undefined, requestId),
    
  notFound: (resource: string, requestId?: string) =>
    createSafeError('NOT_FOUND', { resource }, undefined, requestId),
    
  alreadyExists: (resource: string, requestId?: string) =>
    createSafeError('ALREADY_EXISTS', { resource }, undefined, requestId),
    
  rateLimit: (limit: number, remaining: number, resetTime: number, requestId?: string) =>
    createSafeError('RATE_LIMIT_EXCEEDED', { limit, remaining, resetTime }, undefined, requestId),
    
  internal: (requestId?: string) =>
    createSafeError('INTERNAL_ERROR', undefined, undefined, requestId),
    
  modelUnavailable: (modelName: string, provider: string, requestId?: string) =>
    createSafeError('MODEL_UNAVAILABLE', { modelName, provider }, undefined, requestId)
};

export { createErrorResponse as errorResponse, withErrorHandling as safeHandler };