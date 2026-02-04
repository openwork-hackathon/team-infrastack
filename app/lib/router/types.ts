/**
 * Unified LLM Gateway API Types
 * 
 * Provides OpenAI-compatible interfaces for unified access across all LLM providers
 * with enhanced cost tracking, latency monitoring, and agent routing capabilities.
 */

// Core Message Types (OpenAI compatible)
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: FunctionCall;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

export type ToolChoice = 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };

// Streaming Types
export interface ChatCompletionChunk {
  id: string;
  object?: 'chat.completion.chunk';
  created: number;
  model: string;
  provider?: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      function_call?: Partial<FunctionCall>;
      tool_calls?: Partial<ToolCall>[];
    };
    finish_reason?: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
  }>;
  usage?: TokenUsage;
  latency?: LatencyMetrics;
  cost?: CostBreakdown;
}

// Unified Request Interface (OpenAI compatible + extensions)
export interface UnifiedRequest {
  // Core OpenAI parameters
  model: string;
  messages: ChatMessage[];
  temperature?: number; // 0.0 - 2.0
  max_tokens?: number;
  top_p?: number; // 0.0 - 1.0
  frequency_penalty?: number; // -2.0 - 2.0
  presence_penalty?: number; // -2.0 - 2.0
  stop?: string | string[];
  stream?: boolean;
  
  // Function/Tool calling
  functions?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
  function_call?: 'none' | 'auto' | { name: string };
  tools?: Tool[];
  tool_choice?: ToolChoice;
  
  // Extended parameters for provider flexibility
  top_k?: number; // For non-OpenAI models
  repetition_penalty?: number; // 0.0 - 2.0
  min_p?: number; // 0.0 - 1.0
  seed?: number;
  logit_bias?: Record<number, number>;
  thinking?: any; // For Anthropic extended thinking
  
  // Unified Gateway Extensions
  extra?: {
    // Provider-specific features
    [provider: string]: Record<string, any>;
  };
  
  // Agent routing preferences
  routing?: {
    strategy?: 'cost' | 'speed' | 'quality' | 'auto';
    max_cost_per_1k_tokens?: number;
    max_latency_ms?: number;
    preferred_providers?: string[];
    fallback_models?: string[];
    enable_caching?: boolean;
  };
  
  // Budget and tracking
  budget?: {
    max_cost?: number; // Maximum cost for this request
    cost_alert_threshold?: number; // Alert when cost exceeds this
    tracking_id?: string; // For grouping related requests
    user_id?: string; // For per-user cost tracking
    project_id?: string; // For per-project cost tracking
  };
  
  // Response preferences
  response?: {
    include_usage?: boolean;
    include_cost?: boolean;
    include_latency?: boolean;
    include_model_info?: boolean;
  };
}

// Token Usage Metrics
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_hit_tokens?: number; // Tokens served from cache
  cache_creation_tokens?: number; // Tokens used to create cache
}

// Latency Tracking
export interface LatencyMetrics {
  total_time_ms: number;
  ttfb_ms?: number; // Time to first byte
  queue_time_ms?: number; // Time spent in queue
  processing_time_ms?: number; // Actual model inference time
  network_time_ms?: number; // Network overhead
}

// Cost Breakdown
export interface CostBreakdown {
  input_cost: number;
  output_cost: number;
  total_cost: number;
  cost_per_1k_tokens: number;
  currency: string; // Default: 'USD'
  provider_cost?: number; // Cost charged by provider
  markup?: number; // Gateway markup
  cache_savings?: number; // Savings from cache hits
}

// Model Capabilities
export interface ModelCapabilities {
  max_tokens: number;
  context_window: number;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  supports_system_prompts: boolean;
  supports_json_mode: boolean;
  supports_logprobs: boolean;
  input_modalities: Array<'text' | 'image' | 'audio' | 'video'>;
  output_modalities: Array<'text' | 'image' | 'audio'>;
  
  // Cost information
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
  
  // Performance characteristics
  avg_latency_ms: number;
  rate_limit_rpm?: number; // Requests per minute
  rate_limit_tpm?: number; // Tokens per minute
}

// Unified Response Interface (OpenAI compatible + extensions)
export interface UnifiedResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  provider: string; // Extension: Which provider was actually used
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
  }>;
  
  // Always included for agent cost awareness
  usage: TokenUsage;
  cost: Cost | CostBreakdown;
  latency: LatencyMetrics;
  
  // Optional metadata (based on request.response preferences)
  model_info?: {
    provider_model_name: string;
    capabilities: ModelCapabilities;
    version?: string;
  };
  
  // Routing decision metadata
  routing?: {
    selected_provider: string;
    routing_reason: string;
    considered_models: string[];
    fallback_used?: boolean;
    cache_hit?: boolean;
  };
  
  // Gateway metadata
  gateway?: {
    request_id: string;
    gateway_version: string;
    processed_at: string; // ISO timestamp
    region?: string;
  };
}

// Error Response (OpenAI compatible)
export interface UnifiedError {
  error: {
    message: string;
    type: 'invalid_request_error' | 'authentication_error' | 'permission_error' | 
          'not_found_error' | 'rate_limit_error' | 'server_error' | 'provider_error';
    param?: string;
    code?: string;
    
    // Extensions for better debugging
    provider?: string;
    provider_error?: any;
    request_id?: string;
    retry_after_ms?: number;
  };
}

// Provider Adapter Interface
export interface ProviderAdapter {
  readonly name: string;
  readonly models: string[];
  
  // Core adapter methods
  isSupported(model: string): boolean;
  getCapabilities(model: string): ModelCapabilities | null;
  
  // Request transformation
  transformRequest(request: UnifiedRequest): any;
  
  // API call execution
  callModel(transformedRequest: any): Promise<any>;
  
  // Response transformation
  transformResponse(providerResponse: any, request: UnifiedRequest): UnifiedResponse;
  
  // Cost calculation
  calculateCost(model: string, usage: TokenUsage): Cost | CostBreakdown;
  
  // Streaming support
  supportsStreaming(): boolean;
  callModelStream?(transformedRequest: any): AsyncIterable<ChatCompletionChunk>;
  
  // Health checking
  healthCheck(): Promise<{ healthy: boolean; latency_ms: number; error?: string }>;
  
  // Rate limit information
  getRateLimits(model: string): {
    requests_per_minute?: number;
    tokens_per_minute?: number;
    requests_per_day?: number;
  };
}

// Model Registry Entry
export interface ModelInfo {
  id: string;
  provider: string;
  provider_model_name: string; // The actual model name used by the provider
  display_name: string;
  description: string;
  capabilities: ModelCapabilities;
  
  // Categorization
  category: 'text' | 'code' | 'vision' | 'reasoning' | 'creative' | 'general';
  tier: 'free' | 'basic' | 'premium' | 'enterprise';
  
  // Availability
  available: boolean;
  maintenance_mode?: boolean;
  deprecation_date?: string; // ISO date
  
  // Performance metrics (updated periodically)
  avg_latency_p50_ms: number;
  avg_latency_p95_ms: number;
  success_rate: number; // 0.0 - 1.0
  
  // Usage statistics (for routing decisions)
  popularity_score: number; // 0.0 - 1.0
  quality_score: number; // 0.0 - 1.0, based on user feedback
}

// Router Configuration
export interface RouterConfig {
  // Default routing strategy
  default_strategy: 'cost' | 'speed' | 'quality' | 'auto';
  
  // Global preferences
  preferred_providers: string[];
  blocked_providers: string[];
  
  // Fallback configuration  
  enable_fallbacks: boolean;
  max_fallback_attempts: number;
  fallback_delay_ms: number;
  
  // Cost controls
  max_cost_per_request: number;
  cost_alert_threshold: number;
  enable_cost_optimization: boolean;
  
  // Performance tuning
  cache_enabled: boolean;
  cache_ttl_seconds: number;
  load_balancing_enabled: boolean;
  
  // Monitoring
  enable_metrics: boolean;
  enable_request_logging: boolean;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

// Usage Analytics (for dashboard/monitoring)
export interface UsageAnalytics {
  period: 'hour' | 'day' | 'week' | 'month';
  start_time: string;
  end_time: string;
  
  // Request metrics
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  cached_requests: number;
  
  // Cost metrics
  total_cost: number;
  cost_by_provider: Record<string, number>;
  cost_by_model: Record<string, number>;
  cost_savings_from_cache: number;
  
  // Performance metrics
  avg_latency_ms: number;
  p95_latency_ms: number;
  avg_tokens_per_request: number;
  
  // Usage patterns
  top_models: Array<{ model: string; usage_count: number; cost: number }>;
  top_users: Array<{ user_id: string; requests: number; cost: number }>;
  requests_by_hour: number[];
  
  // Quality metrics
  avg_success_rate: number;
  error_breakdown: Record<string, number>;
}

// Batch Processing (for bulk operations)
export interface BatchRequest {
  batch_id?: string;
  requests: UnifiedRequest[];
  
  // Batch configuration
  max_concurrent_requests?: number;
  retry_failed_requests?: boolean;
  return_individual_costs?: boolean;
  
  // Progress tracking
  progress_webhook_url?: string;
  completion_webhook_url?: string;
}

export interface BatchResponse {
  batch_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  completed_at?: string;
  
  // Progress info
  total_requests: number;
  completed_requests: number;
  failed_requests: number;
  
  // Results
  responses: Array<{
    request_index: number;
    response?: UnifiedResponse;
    error?: UnifiedError;
  }>;
  
  // Aggregated metrics
  total_cost: number;
  total_tokens: number;
  avg_latency_ms: number;
}

// WebSocket streaming types for real-time updates
export interface StreamingEvent {
  type: 'chunk' | 'error' | 'done' | 'cost_update' | 'latency_update';
  data: ChatCompletionChunk | UnifiedError | UsageAnalytics;
  timestamp: number;
}

// Export all types for external use
// Note: Types defined in this file are automatically available for import
// Additional types for provider adapters
export type StreamChunk = ChatCompletionChunk;

// Message is an alias for ChatMessage for adapter compatibility
export type Message = ChatMessage;

export interface Cost {
  input_cost: number;
  output_cost: number;
  total_cost: number;
  currency: string;
}

export class ProviderError extends Error {
  public type?: string;
  public retryAfter?: number;
  public status?: number;
  
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public retryable: boolean = false,
    public provider?: string
  ) {
    super(message);
    this.name = 'ProviderError';
    this.status = statusCode;
  }
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

// Anthropic-specific types
export type AnthropicModel = 'claude-3-5-sonnet-20241022' | 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307' | 'claude-3-5-haiku-20241022';

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: any;
  thinking?: any;
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: any }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicStreamChunk {
  type: string;
  index?: number;
  delta?: { type: string; text?: string; partial_json?: string; [key: string]: any };
  message?: AnthropicResponse;
  usage?: { output_tokens: number };
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: any }>;
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema?: any;
}

export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
};
