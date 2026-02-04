// Simplified OpenAI-compatible Chat Completions API
// Uses SimpleRouterService for testing and demonstration

import { NextRequest, NextResponse } from 'next/server';
import { SimpleRouterService, SimpleRequest } from '../../../../lib/router/simple-service';

// OpenAI API request interface
interface OpenAIRequest {
  model?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  routing?: {
    strategy?: 'direct' | 'delegate' | 'parallel' | 'escalate';
    constraints?: {
      maxCost?: 'low' | 'medium' | 'high';
      maxLatency?: 'low' | 'medium' | 'high';
      preferredProvider?: string;
    };
    enableFallback?: boolean;
  };
}

// Initialize SimpleRouterService
const router = new SimpleRouterService({
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse request
    const body: OpenAIRequest = await request.json();
    
    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid messages field' },
        { status: 400 }
      );
    }

    // Check for streaming (not implemented in simple version)
    if (body.stream) {
      return NextResponse.json(
        { error: 'Streaming not implemented in simple router' },
        { status: 501 }
      );
    }

    // Convert to SimpleRequest
    const simpleRequest: SimpleRequest = {
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      constraints: body.routing?.constraints
    };

    // Execute request
    let response;
    
    if (body.routing?.enableFallback !== false) {
      response = await router.routeWithFallback(simpleRequest);
    } else {
      response = await router.route(simpleRequest);
    }

    // Return OpenAI-compatible response
    return NextResponse.json({
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: response.provider,
      choices: response.choices,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
        cost_estimate: response.usage.cost_estimate
      },
      routing: response.routing
    });

  } catch (error) {
    console.error('❌ Simple chat completions API error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Request failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint for API info
export async function GET(): Promise<NextResponse> {
  try {
    const usageStats = router.getUsageStats();
    
    return NextResponse.json({
      service: 'InfraStack Simple Router API',
      version: '1.0.0',
      compatibility: 'OpenAI Chat Completions v1 (simplified)',
      features: [
        'Intelligent model selection',
        'Basic fallback support',
        'Cost optimization',
        'Usage tracking',
        'Mock execution (for testing)'
      ],
      usage: {
        total_requests: usageStats.totalRequests,
        total_cost: usageStats.totalCost,
        average_latency: usageStats.averageLatency,
        fallback_events: usageStats.fallbackEvents
      }
    });

  } catch (error) {
    return NextResponse.json({
      service: 'InfraStack Simple Router API',
      version: '1.0.0',
      status: 'Available',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}