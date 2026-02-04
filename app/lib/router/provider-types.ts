/**
 * Provider-specific types and interfaces
 * 
 * These types are specifically for provider adapters and may differ
 * from the main unified gateway types.
 */

// Import the main types first
import type { 
  UnifiedRequest, 
  UnifiedResponse, 
  TokenUsage,
  ChatCompletionChunk 
} from './types';

// Re-export main types that providers need
export type {  
  UnifiedRequest, 
  UnifiedResponse, 
  ChatMessage,
  Tool,
  ToolCall,
  FunctionCall
} from './types';

// Re-export error types
export * from './errors';

// Usage type alias for backwards compatibility
export type Usage = TokenUsage;

// Stream chunk type alias for backwards compatibility  
export type StreamChunk = ChatCompletionChunk;

// Provider adapter interface that matches what existing providers expect
export interface SimpleProviderAdapter {
  validateApiKey(key?: string): Promise<boolean>;
  execute(request: UnifiedRequest): Promise<UnifiedResponse>;
  stream(request: UnifiedRequest): AsyncGenerator<StreamChunk>;
  calculateCost(usage: Usage, model: string): number;
  getModels(): Promise<string[]>;
}

// Alias for backwards compatibility
export type ProviderAdapter = SimpleProviderAdapter;