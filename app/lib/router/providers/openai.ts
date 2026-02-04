import OpenAI from 'openai';
import type {  
  UnifiedRequest,
  UnifiedResponse, 
  TokenUsage,
  ChatCompletionChunk,
  CostBreakdown,
  ChatMessage
} from '../types';
import {
  ProviderError,
  AuthenticationError
} from '../errors';

// OpenAI API pricing per 1M tokens (updated 2024)
const OPENAI_PRICING = {
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
} as const;

export class OpenAIAdapter {
  private client: OpenAI;
  
  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new AuthenticationError('openai');
    }
    
    this.client = new OpenAI({ apiKey: key });
  }
  
  async execute(request: UnifiedRequest): Promise<UnifiedResponse> {
    try {
      const startTime = Date.now();
      
      const completion = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages as any, // Type assertion for compatibility
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stop: request.stop,
        tools: request.tools as any,
        tool_choice: request.tool_choice as any
      });
      
      const endTime = Date.now();
      
      return this.convertToUnifiedResponse(completion, request, endTime - startTime);
    } catch (error: any) {
      throw new ProviderError(
        `OpenAI API request failed: ${error.message}`,
        error.status || 500,
        'openai',
        request.model
      );
    }
  }
  
  async* stream(request: UnifiedRequest): AsyncGenerator<ChatCompletionChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages as any,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: true
      });
      
      for await (const chunk of stream) {
        yield this.convertToStreamChunk(chunk);
      }
    } catch (error: any) {
      throw new ProviderError(
        `OpenAI streaming failed: ${error.message}`,
        500,
        'openai',
        request.model
      );
    }
  }
  
  calculateCost(usage: TokenUsage, model: string): number {
    const pricing = OPENAI_PRICING[model as keyof typeof OPENAI_PRICING];
    
    if (!pricing) {
      return 0;
    }
    
    const inputCost = (usage.prompt_tokens / 1000000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1000000) * pricing.output;
    
    return inputCost + outputCost;
  }
  
  private convertToUnifiedResponse(
    openaiResponse: OpenAI.Chat.ChatCompletion, 
    request: UnifiedRequest,
    latencyMs: number
  ): UnifiedResponse {
    const usage: TokenUsage = {
      prompt_tokens: openaiResponse.usage?.prompt_tokens || 0,
      completion_tokens: openaiResponse.usage?.completion_tokens || 0,
      total_tokens: openaiResponse.usage?.total_tokens || 0
    };
    
    const totalCost = this.calculateCost(usage, request.model);
    const pricing = OPENAI_PRICING[request.model as keyof typeof OPENAI_PRICING];
    
    const cost: CostBreakdown = {
      input_cost: pricing ? (usage.prompt_tokens / 1000000) * pricing.input : 0,
      output_cost: pricing ? (usage.completion_tokens / 1000000) * pricing.output : 0,
      total_cost: totalCost,
      cost_per_1k_tokens: usage.total_tokens > 0 ? (totalCost / usage.total_tokens) * 1000 : 0,
      currency: 'USD'
    };
    
    return {
      id: openaiResponse.id,
      object: 'chat.completion',
      created: openaiResponse.created,
      model: openaiResponse.model,
      provider: 'openai',
      choices: openaiResponse.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content,
          function_call: choice.message.function_call,
          tool_calls: choice.message.tool_calls as any
        } as ChatMessage,
        finish_reason: (choice.finish_reason || 'stop') as any
      })),
      usage,
      cost,
      latency: {
        total_time_ms: latencyMs
      }
    };
  }
  
  private convertToStreamChunk(chunk: OpenAI.Chat.ChatCompletionChunk): ChatCompletionChunk {
    return {
      id: chunk.id,
      object: 'chat.completion.chunk',
      created: chunk.created,
      model: chunk.model,
      choices: chunk.choices.map(choice => ({
        index: choice.index,
        delta: {
          role: choice.delta.role as any,
          content: choice.delta.content ?? undefined,
          function_call: choice.delta.function_call as any,
          tool_calls: choice.delta.tool_calls as any
        },
        finish_reason: choice.finish_reason as any
      })),
      usage: chunk.usage ? {
        prompt_tokens: chunk.usage.prompt_tokens || 0,
        completion_tokens: chunk.usage.completion_tokens || 0,
        total_tokens: chunk.usage.total_tokens || 0
      } : undefined
    };
  }
}

export default OpenAIAdapter;
