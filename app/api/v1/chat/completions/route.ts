/**
 * Secure Chat Completions API
 * Implements BYOK (Bring Your Own Key) security pattern
 * CRITICAL: Demonstrates secure API key handling throughout the request lifecycle
 */

import { NextRequest, NextResponse } from 'next/server';
import { secureKeyManager } from '@/app/lib/security/key-manager';
import { auditLogger } from '@/app/lib/security/audit-log';
import { sanitizeForLogging, containsApiKey } from '@/app/lib/security/crypto';
import { routerService } from '@/app/lib/router/service';

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // SECURITY: API key passed per-request, never stored
  api_key?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  provider: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_estimate: number;
  };
}

/**
 * POST /api/v1/chat/completions
 * Secure chat completions with BYOK support
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const startTime = Date.now();
  
  try {
    // SECURITY: Validate HTTPS requirement
    if (!secureKeyManager.validateSecureTransmission(request)) {
      return NextResponse.json(
        { 
          error: 'HTTPS required for secure API key transmission',
          code: 'INSECURE_TRANSPORT'
        },
        { status: 400 }
      );
    }

    // Parse request body
    let body: ChatCompletionRequest;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // SECURITY: Check for API keys in URL params (security violation)
    const url = new URL(request.url);
    if (url.searchParams.has('api_key') || url.searchParams.has('apikey')) {
      await auditLogger.logSecurityViolation(
        'API key found in URL parameters',
        { 
          url: sanitizeForLogging(url.pathname),
          params: Array.from(url.searchParams.keys())
        },
        undefined,
        requestId
      );
      
      return NextResponse.json(
        { 
          error: 'API keys must be passed in request headers or body, never in URL parameters',
          code: 'INSECURE_KEY_TRANSMISSION'
        },
        { status: 400 }
      );
    }

    // Extract API key from Authorization header or request body
    let apiKey: string | undefined;
    
    // Try Authorization header first (preferred)
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else if (authHeader?.startsWith('x-api-key ')) {
      apiKey = authHeader.substring(10);
    }
    
    // Fall back to x-api-key header
    if (!apiKey) {
      apiKey = request.headers.get('x-api-key') || undefined;
    }
    
    // Fall back to request body (less secure)
    if (!apiKey && body.api_key) {
      apiKey = body.api_key;
    }

    // Validate required fields
    const validationErrors: string[] = [];
    
    if (!body.model) {
      validationErrors.push('model is required');
    }
    
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      validationErrors.push('messages array is required and must not be empty');
    }
    
    if (!apiKey) {
      validationErrors.push('API key is required (via Authorization header or x-api-key header)');
    }

    // Validate message format
    if (body.messages) {
      body.messages.forEach((message, index) => {
        if (!message.role || !['user', 'assistant', 'system'].includes(message.role)) {
          validationErrors.push(`messages[${index}].role must be 'user', 'assistant', or 'system'`);
        }
        if (!message.content || typeof message.content !== 'string') {
          validationErrors.push(`messages[${index}].content must be a non-empty string`);
        }
      });
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    // SECURITY: Extract user context for audit logging
    const userAgent = request.headers.get('user-agent');
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ipAddress = forwardedFor?.split(',')[0] || realIp || 'unknown';

    const context = {
      requestId,
      userId: request.headers.get('x-user-id') || undefined,
      userAgent: userAgent ? sanitizeForLogging(userAgent) : undefined,
      ipAddress: sanitizeForLogging(ipAddress),
      endpoint: '/api/v1/chat/completions'
    };

    // Route the request using secure key handling
    const unifiedRequest = {
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens || 4096,
      stream: body.stream || false,
      apiKey: apiKey!,
      context
    };

    const response = await routerService.route(unifiedRequest);

    // Convert to OpenAI-compatible format
    const chatResponse: ChatCompletionResponse = {
      id: response.id,
      object: 'chat.completion',
      created: response.created,
      model: response.model,
      provider: response.provider,
      choices: response.choices,
      usage: response.usage
    };

    // SECURITY: Never log the response with potential sensitive data
    console.log(`✅ Chat completion successful for request ${requestId} (${Date.now() - startTime}ms)`);

    return NextResponse.json(chatResponse);

  } catch (error) {
    // SECURITY: Sanitize error before logging
    const sanitizedError = sanitizeForLogging(error instanceof Error ? error.message : String(error));
    console.error(`❌ Chat completion failed for request ${requestId}:`, sanitizedError);

    // Log security violations if error contains potential key material
    if (error instanceof Error && containsApiKey(error.message)) {
      await auditLogger.logSecurityViolation(
        'API key potentially exposed in error message',
        { 
          originalError: '[REDACTED - CONTAINED KEY MATERIAL]',
          requestId 
        },
        undefined,
        requestId
      );
    }

    // Return generic error to avoid information leakage
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        request_id: requestId
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/chat/completions
 * Health check and API documentation
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    name: 'Secure Chat Completions API',
    version: '1.0.0',
    description: 'OpenAI-compatible chat completions with secure BYOK (Bring Your Own Key) support',
    security: {
      transport: 'HTTPS required in production',
      authentication: 'API key via Authorization header (Bearer token) or x-api-key header',
      key_storage: 'Keys are never stored - provided per request only',
      audit_logging: 'All requests logged without exposing sensitive data'
    },
    supported_models: [
      'claude-3-opus',
      'claude-3.5-sonnet', 
      'claude-3-haiku',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'o1-preview',
      'o1-mini',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ],
    example_request: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your_api_key_here'
      },
      body: {
        model: 'claude-3.5-sonnet',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?'
          }
        ]
      }
    }
  });
}