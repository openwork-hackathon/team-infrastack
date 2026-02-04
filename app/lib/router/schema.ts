/**
 * Unified LLM Gateway Zod Validation Schemas
 * 
 * Provides runtime validation for all API requests and responses
 * ensuring type safety and data integrity across the unified interface.
 */

import { z } from 'zod';

// Core Message Schemas
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
  content: z.string().nullable(),
  name: z.string().optional(),
  function_call: z.object({
    name: z.string(),
    arguments: z.string(),
  }).optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
  tool_call_id: z.string().optional(),
});

export const FunctionCallSchema = z.object({
  name: z.string(),
  arguments: z.string(),
});

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

export const ToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.any()).optional(),
  }),
});

export const ToolChoiceSchema = z.union([
  z.enum(['none', 'auto']),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
    }),
  }),
]);

// Budget and Routing Schemas
export const BudgetSchema = z.object({
  max_cost: z.number().positive().optional(),
  cost_alert_threshold: z.number().positive().optional(),
  tracking_id: z.string().optional(),
  user_id: z.string().optional(),
  project_id: z.string().optional(),
});

export const RoutingSchema = z.object({
  strategy: z.enum(['cost', 'speed', 'quality', 'auto']).optional(),
  max_cost_per_1k_tokens: z.number().positive().optional(),
  max_latency_ms: z.number().positive().optional(),
  preferred_providers: z.array(z.string()).optional(),
  fallback_models: z.array(z.string()).optional(),
  enable_caching: z.boolean().optional(),
});

export const ResponsePreferencesSchema = z.object({
  include_usage: z.boolean().optional(),
  include_cost: z.boolean().optional(),
  include_latency: z.boolean().optional(),
  include_model_info: z.boolean().optional(),
});

// Main Request Schema
export const UnifiedRequestSchema = z.object({
  // Core OpenAI parameters
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional(),
  
  // Function/Tool calling
  functions: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.any()).optional(),
  })).optional(),
  function_call: z.union([
    z.enum(['none', 'auto']),
    z.object({ name: z.string() })
  ]).optional(),
  tools: z.array(ToolSchema).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  
  // Extended parameters
  top_k: z.number().positive().optional(),
  repetition_penalty: z.number().min(0).max(2).optional(),
  min_p: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  
  // Extensions
  extra: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  routing: RoutingSchema.optional(),
  budget: BudgetSchema.optional(),
  response: ResponsePreferencesSchema.optional(),
});

// Usage and Metrics Schemas
export const TokenUsageSchema = z.object({
  prompt_tokens: z.number().nonnegative(),
  completion_tokens: z.number().nonnegative(),
  total_tokens: z.number().nonnegative(),
  cache_hit_tokens: z.number().nonnegative().optional(),
  cache_creation_tokens: z.number().nonnegative().optional(),
});

export const LatencyMetricsSchema = z.object({
  total_time_ms: z.number().nonnegative(),
  ttfb_ms: z.number().nonnegative().optional(),
  queue_time_ms: z.number().nonnegative().optional(),
  processing_time_ms: z.number().nonnegative().optional(),
  network_time_ms: z.number().nonnegative().optional(),
});

export const CostBreakdownSchema = z.object({
  input_cost: z.number().nonnegative(),
  output_cost: z.number().nonnegative(),
  total_cost: z.number().nonnegative(),
  cost_per_1k_tokens: z.number().nonnegative(),
  currency: z.string().default('USD'),
  provider_cost: z.number().nonnegative().optional(),
  markup: z.number().nonnegative().optional(),
  cache_savings: z.number().nonnegative().optional(),
});

// Model Capabilities Schema
export const ModelCapabilitiesSchema = z.object({
  max_tokens: z.number().positive(),
  context_window: z.number().positive(),
  supports_vision: z.boolean(),
  supports_function_calling: z.boolean(),
  supports_streaming: z.boolean(),
  supports_system_prompts: z.boolean(),
  supports_json_mode: z.boolean(),
  supports_logprobs: z.boolean(),
  input_modalities: z.array(z.enum(['text', 'image', 'audio', 'video'])),
  output_modalities: z.array(z.enum(['text', 'image', 'audio'])),
  cost_per_1k_input_tokens: z.number().nonnegative(),
  cost_per_1k_output_tokens: z.number().nonnegative(),
  avg_latency_ms: z.number().nonnegative(),
  rate_limit_rpm: z.number().positive().optional(),
  rate_limit_tpm: z.number().positive().optional(),
});

// Response Schemas
export const ChoiceSchema = z.object({
  index: z.number().nonnegative(),
  message: ChatMessageSchema,
  finish_reason: z.enum(['stop', 'length', 'function_call', 'tool_calls', 'content_filter']),
});

export const ModelInfoSchema = z.object({
  provider_model_name: z.string(),
  capabilities: ModelCapabilitiesSchema,
  version: z.string().optional(),
});

export const RoutingInfoSchema = z.object({
  selected_provider: z.string(),
  routing_reason: z.string(),
  considered_models: z.array(z.string()),
  fallback_used: z.boolean().optional(),
  cache_hit: z.boolean().optional(),
});

export const GatewayInfoSchema = z.object({
  request_id: z.string(),
  gateway_version: z.string(),
  processed_at: z.string(),
  region: z.string().optional(),
});

export const UnifiedResponseSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  provider: z.string(),
  choices: z.array(ChoiceSchema),
  usage: TokenUsageSchema,
  cost: CostBreakdownSchema,
  latency: LatencyMetricsSchema,
  model_info: ModelInfoSchema.optional(),
  routing: RoutingInfoSchema.optional(),
  gateway: GatewayInfoSchema.optional(),
});

// Error Schema
export const UnifiedErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.enum([
      'invalid_request_error',
      'authentication_error', 
      'permission_error',
      'not_found_error',
      'rate_limit_error',
      'server_error',
      'provider_error'
    ]),
    param: z.string().optional(),
    code: z.string().optional(),
    provider: z.string().optional(),
    provider_error: z.any().optional(),
    request_id: z.string().optional(),
    retry_after_ms: z.number().positive().optional(),
  }),
});

// Streaming Schema
export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number().nonnegative(),
    delta: z.object({
      role: z.literal('assistant').optional(),
      content: z.string().optional(),
      function_call: FunctionCallSchema.partial().optional(),
      tool_calls: z.array(ToolCallSchema.partial()).optional(),
    }),
    finish_reason: z.enum(['stop', 'length', 'function_call', 'tool_calls', 'content_filter']).optional(),
  })),
  usage: TokenUsageSchema.optional(),
  latency: LatencyMetricsSchema.optional(),
  cost: CostBreakdownSchema.optional(),
});

// Model Registry Schema
export const ModelInfoRegistrySchema = z.object({
  id: z.string(),
  provider: z.string(),
  provider_model_name: z.string(),
  display_name: z.string(),
  description: z.string(),
  capabilities: ModelCapabilitiesSchema,
  category: z.enum(['text', 'code', 'vision', 'reasoning', 'creative', 'general']),
  tier: z.enum(['free', 'basic', 'premium', 'enterprise']),
  available: z.boolean(),
  maintenance_mode: z.boolean().optional(),
  deprecation_date: z.string().optional(),
  avg_latency_p50_ms: z.number().nonnegative(),
  avg_latency_p95_ms: z.number().nonnegative(),
  success_rate: z.number().min(0).max(1),
  popularity_score: z.number().min(0).max(1),
  quality_score: z.number().min(0).max(1),
});

// Configuration Schemas
export const RouterConfigSchema = z.object({
  default_strategy: z.enum(['cost', 'speed', 'quality', 'auto']),
  preferred_providers: z.array(z.string()),
  blocked_providers: z.array(z.string()),
  enable_fallbacks: z.boolean(),
  max_fallback_attempts: z.number().positive(),
  fallback_delay_ms: z.number().nonnegative(),
  max_cost_per_request: z.number().positive(),
  cost_alert_threshold: z.number().positive(),
  enable_cost_optimization: z.boolean(),
  cache_enabled: z.boolean(),
  cache_ttl_seconds: z.number().positive(),
  load_balancing_enabled: z.boolean(),
  enable_metrics: z.boolean(),
  enable_request_logging: z.boolean(),
  log_level: z.enum(['debug', 'info', 'warn', 'error']),
});

// Analytics Schema
export const UsageAnalyticsSchema = z.object({
  period: z.enum(['hour', 'day', 'week', 'month']),
  start_time: z.string(),
  end_time: z.string(),
  total_requests: z.number().nonnegative(),
  successful_requests: z.number().nonnegative(),
  failed_requests: z.number().nonnegative(),
  cached_requests: z.number().nonnegative(),
  total_cost: z.number().nonnegative(),
  cost_by_provider: z.record(z.string(), z.number().nonnegative()),
  cost_by_model: z.record(z.string(), z.number().nonnegative()),
  cost_savings_from_cache: z.number().nonnegative(),
  avg_latency_ms: z.number().nonnegative(),
  p95_latency_ms: z.number().nonnegative(),
  avg_tokens_per_request: z.number().nonnegative(),
  top_models: z.array(z.object({
    model: z.string(),
    usage_count: z.number().nonnegative(),
    cost: z.number().nonnegative(),
  })),
  top_users: z.array(z.object({
    user_id: z.string(),
    requests: z.number().nonnegative(),
    cost: z.number().nonnegative(),
  })),
  requests_by_hour: z.array(z.number().nonnegative()),
  avg_success_rate: z.number().min(0).max(1),
  error_breakdown: z.record(z.string(), z.number().nonnegative()),
});

// Batch Processing Schemas
export const BatchRequestSchema = z.object({
  batch_id: z.string().optional(),
  requests: z.array(UnifiedRequestSchema).min(1),
  max_concurrent_requests: z.number().positive().optional(),
  retry_failed_requests: z.boolean().optional(),
  return_individual_costs: z.boolean().optional(),
  progress_webhook_url: z.string().url().optional(),
  completion_webhook_url: z.string().url().optional(),
});

export const BatchResponseSchema = z.object({
  batch_id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  created_at: z.string(),
  completed_at: z.string().optional(),
  total_requests: z.number().nonnegative(),
  completed_requests: z.number().nonnegative(),
  failed_requests: z.number().nonnegative(),
  responses: z.array(z.object({
    request_index: z.number().nonnegative(),
    response: UnifiedResponseSchema.optional(),
    error: UnifiedErrorSchema.optional(),
  })),
  total_cost: z.number().nonnegative(),
  total_tokens: z.number().nonnegative(),
  avg_latency_ms: z.number().nonnegative(),
});

// Streaming Event Schema
export const StreamingEventSchema = z.object({
  type: z.enum(['chunk', 'error', 'done', 'cost_update', 'latency_update']),
  data: z.union([
    ChatCompletionChunkSchema,
    UnifiedErrorSchema,
    UsageAnalyticsSchema,
  ]),
  timestamp: z.number(),
});

// Health Check Schema
export const HealthCheckSchema = z.object({
  healthy: z.boolean(),
  latency_ms: z.number().nonnegative(),
  error: z.string().optional(),
});

// Rate Limit Schema
export const RateLimitSchema = z.object({
  requests_per_minute: z.number().positive().optional(),
  tokens_per_minute: z.number().positive().optional(),
  requests_per_day: z.number().positive().optional(),
});

// Utility functions for validation
export function validateUnifiedRequest(data: unknown) {
  return UnifiedRequestSchema.parse(data);
}

export function validateUnifiedResponse(data: unknown) {
  return UnifiedResponseSchema.parse(data);
}

export function validateModelCapabilities(data: unknown) {
  return ModelCapabilitiesSchema.parse(data);
}

export function validateRouterConfig(data: unknown) {
  return RouterConfigSchema.parse(data);
}

// Safe parsing functions that return results instead of throwing
export function safeValidateUnifiedRequest(data: unknown) {
  return UnifiedRequestSchema.safeParse(data);
}

export function safeValidateUnifiedResponse(data: unknown) {
  return UnifiedResponseSchema.safeParse(data);
}

export function safeValidateModelInfo(data: unknown) {
  return ModelInfoRegistrySchema.safeParse(data);
}

// Type inference helpers
export type ValidatedUnifiedRequest = z.infer<typeof UnifiedRequestSchema>;
export type ValidatedUnifiedResponse = z.infer<typeof UnifiedResponseSchema>;
export type ValidatedModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
export type ValidatedRouterConfig = z.infer<typeof RouterConfigSchema>;
export type ValidatedUsageAnalytics = z.infer<typeof UsageAnalyticsSchema>;
export type ValidatedBatchRequest = z.infer<typeof BatchRequestSchema>;
export type ValidatedBatchResponse = z.infer<typeof BatchResponseSchema>;

// Schema registry for dynamic validation
export const SCHEMA_REGISTRY = {
  'unified-request': UnifiedRequestSchema,
  'unified-response': UnifiedResponseSchema,
  'model-capabilities': ModelCapabilitiesSchema,
  'router-config': RouterConfigSchema,
  'usage-analytics': UsageAnalyticsSchema,
  'batch-request': BatchRequestSchema,
  'batch-response': BatchResponseSchema,
  'error': UnifiedErrorSchema,
  'streaming-chunk': ChatCompletionChunkSchema,
} as const;

export type SchemaName = keyof typeof SCHEMA_REGISTRY;

export function validateBySchemaName(schemaName: SchemaName, data: unknown) {
  const schema = SCHEMA_REGISTRY[schemaName];
  return schema.parse(data);
}

export function safeValidateBySchemaName(schemaName: SchemaName, data: unknown) {
  const schema = SCHEMA_REGISTRY[schemaName];
  return schema.safeParse(data);
}
