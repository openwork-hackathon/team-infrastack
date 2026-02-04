// Simplified RouterService - Core router execution service
// Orchestrates model selection and execution with fallback support

import { AgentOrchestrator } from '../orchestrator';

// Simple types for the router service
export interface SimpleRouterConfig {
  baseUrl?: string;
  maxRetries?: number;
  apiKeys?: Record<string, string>;
}

export interface SimpleRequest {
  model?: string;
  prompt?: string;
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: string;
  };
  temperature?: number;
  maxTokens?: number;
}

export interface SimpleResponse {
  id: string;
  object: string;
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
  routing: {
    strategy: string;
    selectedModel: string;
    fallbackUsed?: boolean;
    complexity: number;
    executionTimeMs: number;
  };
}

export interface FallbackChain {
  name: string;
  models: string[];
  triggers: ('rate_limit' | 'timeout' | 'provider_error' | 'model_unavailable')[];
}

export interface MockAdapter {
  name: string;
  provider: string;
  execute(request: SimpleRequest): Promise<SimpleResponse>;
  isAvailable(): Promise<boolean>;
  estimateCost(tokens: number): number;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  modelUsage: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
    latency: number;
  }>;
  fallbackEvents: number;
}

// Default fallback chains
const DEFAULT_FALLBACK_CHAINS: FallbackChain[] = [
  {
    name: 'claude-primary',
    models: ['claude-3.5-sonnet', 'claude-3-haiku', 'gpt-4o-mini'],
    triggers: ['rate_limit', 'provider_error', 'model_unavailable']
  },
  {
    name: 'cost-optimized',
    models: ['gpt-4o-mini', 'claude-3-haiku', 'gemini-1.5-flash'],
    triggers: ['rate_limit', 'provider_error', 'timeout']
  }
];

export class SimpleRouterService {
  private config: SimpleRouterConfig;
  private orchestrator: AgentOrchestrator;
  private providers: Map<string, MockAdapter> = new Map();
  private usageStats!: UsageStats;

  constructor(config: SimpleRouterConfig = {}) {
    this.config = {
      baseUrl: 'http://localhost:3000',
      maxRetries: 3,
      ...config
    };

    this.orchestrator = new AgentOrchestrator(this.config.baseUrl);
    this.initializeUsageStats();
  }

  private initializeUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      modelUsage: {},
      fallbackEvents: 0
    };
  }

  /**
   * Main routing method - selects optimal model and executes request
   */
  async route(request: SimpleRequest): Promise<SimpleResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Validate request
      this.validateRequest(request);

      // Select model (if not explicitly specified)
      let selectedModel = request.model;
      let routingDecision: any;

      if (!selectedModel) {
        routingDecision = await this.getRoutingDecision(request);
        selectedModel = routingDecision.selectedModel;
      }

      if (!selectedModel) {
        throw new Error('No model could be selected for this request');
      }

      // Execute with mock adapter
      const response = await this.executeWithMock(request, selectedModel);

      // Track usage
      this.trackUsage(selectedModel, response, Date.now() - startTime);

      // Enhance response with routing metadata
      response.routing = {
        strategy: routingDecision?.strategy || 'direct',
        selectedModel,
        complexity: routingDecision?.complexity || 1,
        executionTimeMs: Date.now() - startTime,
        fallbackUsed: false
      };

      response.id = requestId;

      return response;

    } catch (error) {
      console.error(`❌ Routing failed:`, error);
      throw error;
    }
  }

  /**
   * Route with fallback support
   */
  async routeWithFallback(request: SimpleRequest): Promise<SimpleResponse> {
    try {
      return await this.route(request);
    } catch (error) {
      console.warn('🔄 Primary routing failed, attempting fallback...');
      
      // Try cost-optimized fallback chain
      const fallbackChain = DEFAULT_FALLBACK_CHAINS.find(chain => chain.name === 'cost-optimized');
      
      if (fallbackChain) {
        for (const fallbackModel of fallbackChain.models) {
          try {
            const fallbackRequest = { ...request, model: fallbackModel };
            const response = await this.route(fallbackRequest);
            
            response.routing.fallbackUsed = true;
            this.usageStats.fallbackEvents++;
            
            return response;
          } catch (fallbackError) {
            continue;
          }
        }
      }

      throw error;
    }
  }

  /**
   * Register a provider adapter
   */
  registerProvider(name: string, adapter: MockAdapter): void {
    this.providers.set(name, adapter);
    console.log(`📝 Registered provider: ${name}`);
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.initializeUsageStats();
  }

  // Private helper methods
  private validateRequest(request: SimpleRequest): void {
    if (!request.prompt && (!request.messages || request.messages.length === 0)) {
      throw new Error('Request must include either prompt or messages');
    }
  }

  private async getRoutingDecision(request: SimpleRequest): Promise<any> {
    const prompt = request.prompt || this.messagesToPrompt(request.messages || []);
    
    try {
      const routeResponse = await fetch(`${this.config.baseUrl}/api/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          constraints: request.constraints || {}
        })
      });

      if (!routeResponse.ok) {
        throw new Error(`Routing API failed: ${routeResponse.status}`);
      }

      return routeResponse.json();
    } catch (error) {
      // Fallback to simple decision
      return {
        selectedModel: 'claude-3.5-sonnet',
        strategy: 'direct',
        complexity: 2
      };
    }
  }

  private async executeWithMock(request: SimpleRequest, modelName: string): Promise<SimpleResponse> {
    const prompt = request.prompt || this.messagesToPrompt(request.messages || []);
    const tokens = Math.ceil(prompt.length / 4) + 200;

    // Mock response that looks realistic
    return {
      id: this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      provider: this.getProviderFromModel(modelName),
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: `Mock response from ${modelName}. This is a test implementation that demonstrates the router service functionality. Original request: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: Math.ceil(prompt.length / 4),
        completion_tokens: 200,
        total_tokens: tokens,
        cost_estimate: this.estimateCost(tokens, modelName)
      },
      routing: {
        strategy: 'direct',
        selectedModel: modelName,
        complexity: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      }
    };
  }

  private trackUsage(modelName: string, response: SimpleResponse, latency: number): void {
    this.usageStats.totalRequests++;
    this.usageStats.totalTokens += response.usage.total_tokens;
    this.usageStats.totalCost += response.usage.cost_estimate;

    if (!this.usageStats.modelUsage[modelName]) {
      this.usageStats.modelUsage[modelName] = {
        requests: 0,
        tokens: 0,
        cost: 0,
        latency: 0
      };
    }

    const modelStats = this.usageStats.modelUsage[modelName];
    const previousAvgLatency = modelStats.latency;
    const previousRequests = modelStats.requests;

    modelStats.requests++;
    modelStats.tokens += response.usage.total_tokens;
    modelStats.cost += response.usage.cost_estimate;
    modelStats.latency = (previousAvgLatency * previousRequests + latency) / modelStats.requests;
  }

  private getProviderFromModel(modelName: string): string {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt') || modelName.includes('o1')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    if (modelName.includes('llama')) return 'meta';
    return 'unknown';
  }

  private estimateCost(tokens: number, modelName: string): number {
    const costPerK: Record<string, number> = {
      'claude-3-opus': 0.015,
      'claude-3.5-sonnet': 0.003,
      'claude-3-haiku': 0.0015,
      'gpt-4o': 0.005,
      'gpt-4o-mini': 0.00015,
      'gemini-1.5-flash': 0.00035
    };
    
    const rate = costPerK[modelName] || 0.002;
    return (tokens / 1000) * rate;
  }

  private messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
    return messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  private generateRequestId(): string {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }
}

// Export singleton instance
export const simpleRouterService = new SimpleRouterService();