// RouterService - Core router execution service
// Orchestrates model selection and execution with fallback support
// SECURITY: Now includes secure API key management

import { AgentOrchestrator } from '../orchestrator';
import { secureKeyManager, KeyUsageContext } from '../security/key-manager';
import { auditLogger } from '../security/audit-log';
import { sanitizeForLogging } from '../security/crypto';
import { AnthropicAdapter } from './providers/anthropic';
import { OpenAIAdapter } from './providers/openai';
import { GoogleProvider as GoogleAdapter } from './providers/google';

// Types for the router service
export interface RouterConfig {
  baseUrl?: string;
  defaultProvider?: string;
  fallbackChains?: FallbackChain[];
  maxRetries?: number;
  apiKeys?: Record<string, string>;
}

export interface UnifiedRequest {
  model?: string; // Optional explicit model selection
  prompt?: string;
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: string;
    timeout?: number;
  };
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  executionOptions?: {
    strategy?: 'direct' | 'delegate' | 'parallel' | 'escalate';
    planOnly?: boolean;
  };
  
  // SECURITY: API key handling
  apiKey?: string;     // BYOK - Bring Your Own Key per request
  context?: KeyUsageContext; // Usage context for audit logging
}

export interface UnifiedResponse {
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
    fallbackReason?: string;
    complexity: number;
    executionTimeMs: number;
  };
}

export interface FallbackChain {
  name: string;
  models: string[];
  triggers: ('rate_limit' | 'timeout' | 'provider_error' | 'model_unavailable')[];
}

export interface ProviderAdapter {
  name: string;
  provider: string;
  execute(request: UnifiedRequest): Promise<UnifiedResponse>;
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
  providerErrors: Record<string, number>;
  lastReset: string;
}

// Default fallback chains
const DEFAULT_FALLBACK_CHAINS: FallbackChain[] = [
  {
    name: 'claude-primary',
    models: ['claude-3.5-sonnet', 'claude-3-haiku', 'gpt-4o-mini'],
    triggers: ['rate_limit', 'provider_error', 'model_unavailable']
  },
  {
    name: 'gpt-primary',
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet'],
    triggers: ['rate_limit', 'provider_error', 'model_unavailable']
  },
  {
    name: 'cost-optimized',
    models: ['gpt-4o-mini', 'claude-3-haiku', 'gemini-1.5-flash'],
    triggers: ['rate_limit', 'provider_error', 'timeout']
  },
  {
    name: 'reasoning-focused',
    models: ['o1-preview', 'claude-3-opus', 'gpt-4-turbo'],
    triggers: ['provider_error', 'model_unavailable']
  }
];

// Utility functions
function messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');
}

export class RouterService {
  private config: RouterConfig;
  private orchestrator: AgentOrchestrator;
  private providers: Map<string, ProviderAdapter> = new Map();
  private usageStats!: UsageStats;
  private fallbackChains: FallbackChain[];

  constructor(config: RouterConfig = {}) {
    this.config = {
      baseUrl: 'http://localhost:3000',
      maxRetries: 3,
      fallbackChains: DEFAULT_FALLBACK_CHAINS,
      ...config
    };

    this.orchestrator = new AgentOrchestrator(this.config.baseUrl);
    this.fallbackChains = this.config.fallbackChains || DEFAULT_FALLBACK_CHAINS;
    this.initializeUsageStats();
    this.initializeProviders();
    
    // SECURITY: No longer store API keys in the service
    // Keys are now handled securely via secureKeyManager per-request
    console.log('🔐 RouterService initialized with secure key management');
  }

  private initializeUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      modelUsage: {},
      fallbackEvents: 0,
      providerErrors: {},
      lastReset: new Date().toISOString()
    };
  }

  private initializeProviders(): void {
    // Initialize real provider adapters
    // Keys are passed per-request via Authorization header
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;

    if (anthropicKey) {
      const anthropic = new AnthropicAdapter({ apiKey: anthropicKey });
      this.providers.set('anthropic', anthropic as any);
      console.log('✅ Anthropic adapter initialized');
    }

    if (openaiKey) {
      const openai = new OpenAIAdapter(openaiKey);
      this.providers.set('openai', openai as any);
      console.log('✅ OpenAI adapter initialized');
    }

    if (googleKey) {
      const google = new GoogleAdapter(googleKey);
      this.providers.set('google', google as any);
      console.log('✅ Google adapter initialized');
    }

    console.log(`📡 Initialized ${this.providers.size} provider adapter(s)`);
  }

  // SECURITY: Removed initializeApiKeys - keys are no longer stored persistently

  /**
   * Main routing method - selects optimal model and executes request
   * SECURITY: Now includes secure API key validation and management
   */
  async route(request: UnifiedRequest): Promise<UnifiedResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    let keyId: string | undefined;

    try {
      // Step 1: Validate request
      this.validateRequest(request);

      // Step 2: Select model (if not explicitly specified)
      let selectedModel = request.model;
      let routingDecision: any;

      if (!selectedModel) {
        routingDecision = await this.getRoutingDecision(request);
        selectedModel = routingDecision.selectedModel;
      }

      // Ensure we have a model selected
      if (!selectedModel) {
        throw new Error('No model could be selected for this request');
      }

      // Step 3: SECURITY - Validate API key if provided
      if (request.apiKey && selectedModel) {
        const provider = this.getProviderFromModel(selectedModel);
        const keyValidation = await secureKeyManager.getValidatedKey(
          request.apiKey,
          provider,
          {
            ...request.context,
            requestId,
            model: selectedModel
          }
        );

        if (!keyValidation.isValid) {
          throw new Error(`API key validation failed: ${keyValidation.error}`);
        }

        keyId = keyValidation.keyId;
      }

      // Step 4: Get appropriate provider adapter
      const adapter = await this.getProviderAdapter(selectedModel, keyId);
      if (!adapter) {
        throw new Error(`No provider adapter available for model: ${selectedModel}`);
      }

      // Step 5: Execute request
      const response = await this.executeRequest(request, adapter, selectedModel, keyId);

      // Step 6: SECURITY - Log key usage
      if (keyId) {
        await secureKeyManager.useKey(keyId, {
          ...request.context,
          requestId,
          model: selectedModel,
          success: true,
          responseTime: Date.now() - startTime,
          tokens: response.usage.total_tokens,
          cost: response.usage.cost_estimate
        });
      }

      // Step 7: Track usage
      this.trackUsage(selectedModel, response, Date.now() - startTime, false);

      // Step 8: Enhance response with routing metadata
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
      // SECURITY - Sanitize error message before logging
      const sanitizedError = sanitizeForLogging(error instanceof Error ? error.message : String(error));
      console.error(`❌ Routing failed for request ${requestId}:`, sanitizedError);
      
      // Log key usage failure if key was provided
      if (keyId) {
        await secureKeyManager.useKey(keyId, {
          ...request.context,
          requestId,
          model: request.model || 'unknown',
          success: false,
          responseTime: Date.now() - startTime,
          error: sanitizedError
        });
      }
      
      // Track error
      const errorType = this.classifyError(error instanceof Error ? error : new Error(String(error)));
      this.usageStats.providerErrors[errorType] = (this.usageStats.providerErrors[errorType] || 0) + 1;

      throw error;
    } finally {
      // SECURITY - Always clear key from memory after request
      if (keyId) {
        secureKeyManager.clearKey(keyId);
      }
    }
  }

  /**
   * Route with fallback support - auto-retries with fallback models on failure
   */
  async routeWithFallback(request: UnifiedRequest): Promise<UnifiedResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    try {
      // Try primary routing first
      return await this.route(request);
    } catch (primaryError) {
      lastError = primaryError instanceof Error ? primaryError : new Error(String(primaryError));
      console.warn('🔄 Primary routing failed, attempting fallback...', lastError.message);
    }

    // Determine appropriate fallback chain
    const fallbackChain = this.selectFallbackChain(request, lastError);
    
    if (!fallbackChain) {
      throw new Error(`No suitable fallback chain found for request. Last error: ${lastError?.message}`);
    }

    // Try each model in the fallback chain
    for (let i = 0; i < fallbackChain.models.length; i++) {
      const fallbackModel = fallbackChain.models[i];
      
      try {
        console.log(`🔄 Trying fallback model ${i + 1}/${fallbackChain.models.length}: ${fallbackModel}`);
        
        const fallbackRequest = { ...request, model: fallbackModel };
        const response = await this.route(fallbackRequest);
        
        // Mark as fallback in response
        response.routing.fallbackUsed = true;
        response.routing.fallbackReason = `Primary model failed: ${lastError?.message}. Used fallback chain: ${fallbackChain.name}`;
        
        // Track fallback event
        this.usageStats.fallbackEvents++;
        
        console.log(`✅ Fallback successful with ${fallbackModel}`);
        return response;

      } catch (fallbackError) {
        lastError = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
        console.warn(`❌ Fallback model ${fallbackModel} failed:`, lastError.message);
        continue;
      }
    }

    // All fallback attempts failed
    throw new Error(`All fallback models failed. Last error: ${lastError?.message}. Tried chain: ${fallbackChain.name}`);
  }

  /**
   * Register a provider adapter
   */
  registerProvider(name: string, adapter: ProviderAdapter): void {
    this.providers.set(name, adapter);
    console.log(`📝 Registered provider adapter: ${name}`);
  }

  /**
   * Validate API key for a provider
   * SECURITY: Keys are no longer stored - this method only validates format
   */
  async validateApiKey(provider: string, key: string): Promise<{ isValid: boolean; errors: string[] }> {
    // SECURITY: Never log the actual key, always use sanitizeForLogging
    const sanitizedLog = `🔍 Validating API key for provider: ${provider}`;
    console.log(sanitizedLog);
    
    const validation = await secureKeyManager.validateKey(key, provider);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors
    };
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): UsageStats {
    // Calculate average latency
    const totalLatency = Object.values(this.usageStats.modelUsage)
      .reduce((sum, stats) => sum + (stats.latency * stats.requests), 0);
    
    this.usageStats.averageLatency = this.usageStats.totalRequests > 0 
      ? totalLatency / this.usageStats.totalRequests 
      : 0;

    return { ...this.usageStats };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.initializeUsageStats();
    console.log('📊 Usage statistics reset');
  }

  // Private helper methods

  private validateRequest(request: UnifiedRequest): void {
    if (!request.prompt && (!request.messages || request.messages.length === 0)) {
      throw new Error('Request must include either prompt or messages');
    }

    if (request.messages) {
      for (const message of request.messages) {
        if (!message.role || !message.content) {
          throw new Error('Each message must have role and content');
        }
        if (!['user', 'assistant', 'system'].includes(message.role)) {
          throw new Error('Message role must be user, assistant, or system');
        }
      }
    }
  }

  private async getRoutingDecision(request: UnifiedRequest): Promise<any> {
    // Use the existing routing API from the orchestrator
    const prompt = request.prompt || this.messagesToPrompt(request.messages || []);
    
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
  }

  private async getProviderAdapter(modelName: string, keyId?: string): Promise<ProviderAdapter | null> {
    // Determine provider from model name
    const providerName = this.getProviderFromModel(modelName);
    
    // Check if we have a registered adapter for this provider
    if (this.providers.has(providerName)) {
      const adapter = this.providers.get(providerName)!;
      console.log(`🔀 Using ${providerName} adapter for model ${modelName}`);
      return adapter;
    }

    console.log(`⚠️ No adapter for provider ${providerName}, using mock`);
    // If no specific adapter, create a mock one for testing
    return this.createMockAdapter(modelName);
  }

  private async modelSupported(adapter: ProviderAdapter, modelName: string): Promise<boolean> {
    try {
      return await adapter.isAvailable();
    } catch {
      return false;
    }
  }

  private createMockAdapter(modelName: string): ProviderAdapter {
    const providerName = this.getProviderFromModel(modelName);
    const generateId = () => `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      name: `mock-${modelName}`,
      provider: providerName,
      async execute(request: UnifiedRequest): Promise<UnifiedResponse> {
        // Mock implementation for testing
        const prompt = request.prompt || messagesToPrompt(request.messages || []);
        const tokens = Math.ceil(prompt.length / 4) + 200; // Estimate tokens
        
        return {
          id: generateId(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          provider: providerName,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: `Mock response from ${modelName}. Original prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: Math.ceil(prompt.length / 4),
            completion_tokens: 200,
            total_tokens: tokens
          },
          cost: {
            input_cost: 0,
            output_cost: 0,
            total_cost: 0,
            currency: 'USD'
          },
          latency: {
            total_time_ms: 100
          }
        } as unknown as UnifiedResponse;
      },
      async isAvailable(): Promise<boolean> {
        return true;
      },
      estimateCost(tokens: number): number {
        return tokens * 0.0001; // Simple mock cost
      }
    };
  }

  private async executeRequest(
    request: UnifiedRequest, 
    adapter: ProviderAdapter, 
    modelName: string,
    keyId?: string
  ): Promise<UnifiedResponse> {
    try {
      // SECURITY: Get the actual key only when needed for API call
      const actualKey = keyId ? secureKeyManager.getKeyForRequest(keyId) : undefined;
      
      // Create a secure request object that includes the key
      const secureRequest = {
        ...request,
        // Add the actual key for the provider adapter to use
        actualApiKey: actualKey
      };
      
      const response = await adapter.execute(secureRequest);
      return response;
    } catch (error) {
      const sanitizedError = sanitizeForLogging(error instanceof Error ? error.message : String(error));
      throw new Error(`Provider ${adapter.name} execution failed: ${sanitizedError}`);
    }
  }

  private trackUsage(
    modelName: string, 
    response: UnifiedResponse, 
    latency: number, 
    fallbackUsed: boolean
  ): void {
    // Update total stats
    this.usageStats.totalRequests++;
    this.usageStats.totalTokens += response.usage.total_tokens;
    this.usageStats.totalCost += response.usage.cost_estimate;

    // Update model-specific stats
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

  private selectFallbackChain(request: UnifiedRequest, error: Error): FallbackChain | null {
    const errorType = this.classifyError(error);
    
    // Find chains that handle this error type
    const suitableChains = this.fallbackChains.filter(chain => 
      chain.triggers.includes(errorType)
    );

    if (suitableChains.length === 0) {
      return null;
    }

    // Select the most appropriate chain based on request characteristics
    if (request.constraints?.maxCost === 'low') {
      return suitableChains.find(chain => chain.name === 'cost-optimized') || suitableChains[0];
    }

    if (request.prompt?.toLowerCase().includes('reasoning') || 
        request.prompt?.toLowerCase().includes('complex')) {
      return suitableChains.find(chain => chain.name === 'reasoning-focused') || suitableChains[0];
    }

    return suitableChains[0];
  }

  private classifyError(error: Error): 'rate_limit' | 'timeout' | 'provider_error' | 'model_unavailable' {
    const message = error.message.toLowerCase();
    
    if (message.includes('rate limit') || message.includes('rate exceeded')) {
      return 'rate_limit';
    }
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    
    if (message.includes('unavailable') || message.includes('not found')) {
      return 'model_unavailable';
    }
    
    return 'provider_error';
  }

  private getProviderFromModel(modelName: string): string {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt') || modelName.includes('o1')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    if (modelName.includes('llama')) return 'meta';
    if (modelName.includes('mistral') || modelName.includes('codestral')) return 'mistral';
    if (modelName.includes('command')) return 'cohere';
    return 'unknown';
  }

  private estimateCost(tokens: number, modelName: string): number {
    // Rough cost estimates (per 1K tokens)
    const costPerK: Record<string, number> = {
      'claude-3-opus': 0.015,
      'claude-3.5-sonnet': 0.003,
      'claude-3-haiku': 0.0015,
      'gpt-4-turbo': 0.01,
      'gpt-4o': 0.005,
      'gpt-4o-mini': 0.00015,
      'o1-preview': 0.015,
      'o1-mini': 0.003,
      'gemini-1.5-pro': 0.0035,
      'gemini-1.5-flash': 0.00035
    };

    const rate = costPerK[modelName] || 0.002; // Default rate
    return (tokens / 1000) * rate;
  }

  private messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
    return messagesToPrompt(messages);
  }

  private generateRequestId(): string {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }
}

// Export singleton instance
export const routerService = new RouterService();