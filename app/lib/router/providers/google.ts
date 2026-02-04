import {
  ProviderAdapter,
  UnifiedRequest,
  UnifiedResponse,
  ChatCompletionChunk,
  ChatMessage,
  TokenUsage,
  CostBreakdown,
  LatencyMetrics,
  ModelCapabilities
} from '../types';

// Google Gemini API types
interface GeminiContent {
  parts: Array<{
    text?: string;
    inline_data?: {
      mime_type: string;
      data: string; // base64
    };
    function_call?: {
      name: string;
      args: Record<string, any>;
    };
    function_response?: {
      name: string;
      response: Record<string, any>;
    };
  }>;
  role?: 'user' | 'model' | 'function';
}

interface GeminiTool {
  function_declarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
}

interface GeminiSafetySettings {
  category: 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT' | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
}

interface GeminiRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  tool_config?: {
    function_calling_config: {
      mode: 'AUTO' | 'ANY' | 'NONE';
      allowed_function_names?: string[];
    };
  };
  safety_settings?: GeminiSafetySettings[];
  generation_config?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    candidate_count?: number;
    max_output_tokens?: number;
    stop_sequences?: string[];
  };
  system_instruction?: {
    parts: Array<{ text: string }>;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        function_call?: {
          name: string;
          args: Record<string, any>;
        };
      }>;
      role: string;
    };
    finish_reason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    safety_ratings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usage_metadata?: {
    prompt_token_count: number;
    candidates_token_count: number;
    total_token_count: number;
  };
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts: Array<{
        text?: string;
        function_call?: {
          name: string;
          args: Record<string, any>;
        };
      }>;
      role?: string;
    };
    finish_reason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    safety_ratings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usage_metadata?: {
    prompt_token_count: number;
    candidates_token_count: number;
    total_token_count: number;
  };
}

// Google Gemini pricing (per 1M tokens)
const GOOGLE_PRICING = {
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
  'gemini-1.5-flash': { input: 0.35, output: 1.05 },
  'gemini-pro-vision': { input: 0.25, output: 0.50 }, // Estimated pricing for vision model
} as const;

type GoogleModel = keyof typeof GOOGLE_PRICING;

// Supported models
const SUPPORTED_MODELS = [
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro-vision'
] as const;

// Default safety settings - block only high-risk content
const DEFAULT_SAFETY_SETTINGS: GeminiSafetySettings[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

export class GoogleProvider  {
  public readonly name = 'google';
  public readonly models = [...SUPPORTED_MODELS];
  
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(apiKey: string, options: { baseUrl?: string; timeout?: number } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeout = options.timeout || 30000;
  }

  isSupported(model: string): boolean {
    return SUPPORTED_MODELS.includes(model as any);
  }

  getCapabilities(model: string): ModelCapabilities | null {
    if (!this.isSupported(model)) return null;

    const pricing = GOOGLE_PRICING[model as GoogleModel];
    if (!pricing) return null;

    // Return capabilities based on model
    const baseCapabilities: ModelCapabilities = {
      max_tokens: 4096,
      context_window: model === 'gemini-1.5-pro' || model === 'gemini-1.5-flash' ? 1_000_000 : 32_000,
      supports_vision: model.includes('vision') || model.includes('1.5'),
      supports_function_calling: true,
      supports_streaming: true,
      supports_system_prompts: true,
      supports_json_mode: false,
      supports_logprobs: false,
      input_modalities: model.includes('vision') || model.includes('1.5') ? ['text', 'image'] : ['text'],
      output_modalities: ['text'],
      cost_per_1k_input_tokens: pricing.input / 1000,
      cost_per_1k_output_tokens: pricing.output / 1000,
      avg_latency_ms: 1500,
      rate_limit_rpm: 60,
      rate_limit_tpm: 32000
    };

    return baseCapabilities;
  }

  calculateCost(usage: TokenUsage, model: string): CostBreakdown {
    const pricing = GOOGLE_PRICING[model as GoogleModel];
    if (!pricing) {
      throw new Error(`Unsupported Google model for pricing: ${model}`);
    }

    const input_cost = (usage.prompt_tokens / 1_000_000) * pricing.input;
    const output_cost = (usage.completion_tokens / 1_000_000) * pricing.output;
    const total_cost = input_cost + output_cost;

    return {
      input_cost: parseFloat(input_cost.toFixed(6)),
      output_cost: parseFloat(output_cost.toFixed(6)),
      total_cost: parseFloat(total_cost.toFixed(6)),
      cost_per_1k_tokens: parseFloat(((total_cost * 1000) / usage.total_tokens).toFixed(6)),
      currency: 'USD'
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms: number; error?: string }> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const latency_ms = Date.now() - startTime;
      
      if (response.ok) {
        return { healthy: true, latency_ms };
      } else {
        return { 
          healthy: false, 
          latency_ms, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        };
      }
    } catch (error) {
      return { 
        healthy: false, 
        latency_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  getRateLimits(model: string): { requests_per_minute?: number; tokens_per_minute?: number; requests_per_day?: number } {
    return {
      requests_per_minute: 60,
      tokens_per_minute: 32000,
      requests_per_day: 1000
    };
  }

  supportsStreaming(): boolean {
    return true;
  }

  transformRequest(request: UnifiedRequest): any {
    return this.transformToGeminiRequest(request);
  }

  async callModel(transformedRequest: any): Promise<any> {
    const model = transformedRequest.model || 'gemini-1.5-pro';
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transformedRequest),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw await this.handleApiError(response);
    }

    return response.json();
  }

  async *callModelStream(transformedRequest: any): AsyncIterable<ChatCompletionChunk> {
    const model = transformedRequest.model || 'gemini-1.5-pro';
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transformedRequest),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw await this.handleApiError(response);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') return;

            try {
              const chunk: GeminiStreamChunk = JSON.parse(jsonStr);
              yield this.transformToStreamChunk(chunk, transformedRequest.model || 'gemini-1.5-pro');
            } catch (parseError) {
              console.warn('Failed to parse streaming chunk:', parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  transformResponse(providerResponse: any, request: UnifiedRequest): UnifiedResponse {
    return this.transformToUnifiedResponse(providerResponse, request.model);
  }

  private transformToGeminiRequest(request: UnifiedRequest): GeminiRequest & { model: string } {
    const contents: GeminiContent[] = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    // Extract system message if present
    const systemMessage = request.messages.find(msg => msg.role === 'system');
    if (systemMessage && typeof systemMessage.content === 'string') {
      systemInstruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    // Convert messages (skip system messages as they're handled separately)
    for (const message of request.messages) {
      if (message.role === 'system') continue;

      const content: GeminiContent = {
        parts: [],
        role: message.role === 'assistant' ? 'model' : 
              message.role === 'tool' ? 'function' : 'user'
      };

      if (typeof message.content === 'string') {
        content.parts.push({ text: message.content });
      } else if (Array.isArray(message.content)) {
        for (const part of (message.content as any[])) {
          if (part.type === 'text' && part.text) {
            content.parts.push({ text: part.text });
          } else if (part.type === 'image' && part.image_url?.url) {
            // Handle image data - convert to base64 if needed
            const imageUrl = part.image_url.url;
            if (imageUrl.startsWith('data:')) {
              const [mimeType, base64Data] = imageUrl.split(',');
              const mime = mimeType.replace('data:', '').replace(';base64', '');
              content.parts.push({
                inline_data: {
                  mime_type: mime,
                  data: base64Data
                }
              });
            } else {
              // For external URLs, we'd need to fetch and convert
              console.warn('External image URLs not supported in this implementation');
            }
          }
        }
      }

      // Handle tool calls
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          content.parts.push({
            function_call: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments)
            }
          });
        }
      }

      // Handle tool responses
      if (message.role === 'tool' && message.tool_call_id) {
        content.parts.push({
          function_response: {
            name: message.tool_call_id,
            response: { result: message.content }
          }
        });
      }

      contents.push(content);
    }

    // Build the request
    const geminiRequest: GeminiRequest & { model: string } = {
      model: request.model,
      contents,
      safety_settings: DEFAULT_SAFETY_SETTINGS,
      generation_config: {
        temperature: request.temperature,
        top_p: request.top_p,
        max_output_tokens: request.max_tokens || 4096,
      }
    };

    if (systemInstruction) {
      geminiRequest.system_instruction = systemInstruction;
    }

    // Handle tools
    if (request.tools && request.tools.length > 0) {
      geminiRequest.tools = [{
        function_declarations: request.tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters || {}
        }))
      }];

      // Handle tool choice
      if (request.tool_choice) {
        const mode = request.tool_choice === 'none' ? 'NONE' :
                    (typeof request.tool_choice === 'string' && request.tool_choice === 'auto') ? 'AUTO' : 'ANY';
        
        geminiRequest.tool_config = {
          function_calling_config: { mode }
        };

        if (typeof request.tool_choice === 'object' && request.tool_choice.function) {
          geminiRequest.tool_config.function_calling_config.allowed_function_names = [
            request.tool_choice.function.name
          ];
        }
      }
    }

    return geminiRequest;
  }

  private transformToUnifiedResponse(data: GeminiResponse, model: string): UnifiedResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('No candidates returned from Gemini');
    }

    const usage: TokenUsage = {
      prompt_tokens: data.usage_metadata?.prompt_token_count || 0,
      completion_tokens: data.usage_metadata?.candidates_token_count || 0,
      total_tokens: data.usage_metadata?.total_token_count || 0,
    };

    const cost = this.calculateCost(usage, model);
    
    const latency: LatencyMetrics = {
      total_time_ms: 1000, // Would be measured in real implementation
      ttfb_ms: 500,
      queue_time_ms: 0,
      processing_time_ms: 800,
      network_time_ms: 200
    };

    // Build message content
    const message: ChatMessage = {
      role: 'assistant',
      content: ''
    };

    const textParts: string[] = [];
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    for (let i = 0; i < candidate.content.parts.length; i++) {
      const part = candidate.content.parts[i];
      
      if (part.text) {
        textParts.push(part.text);
      }
      
      if (part.function_call) {
        toolCalls.push({
          id: `call_${i}`,
          type: 'function',
          function: {
            name: part.function_call.name,
            arguments: JSON.stringify(part.function_call.args)
          }
        });
      }
    }

    message.content = textParts.join('');
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    const finishReason = this.mapFinishReason(candidate.finish_reason);

    return {
      id: `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      provider: 'google',
      choices: [{
        index: 0,
        message,
        finish_reason: finishReason || 'stop'
      }],
      usage,
      cost,
      latency
    };
  }

  private transformToStreamChunk(chunk: GeminiStreamChunk, model: string): ChatCompletionChunk {
    const candidate = chunk.candidates?.[0];
    
    const delta: any = {};
    
    if (candidate?.content?.parts) {
      const textParts: string[] = [];
      const toolCalls: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }> = [];

      for (let i = 0; i < candidate.content.parts.length; i++) {
        const part = candidate.content.parts[i];
        
        if (part.text) {
          textParts.push(part.text);
        }
        
        if (part.function_call) {
          toolCalls.push({
            index: i,
            id: `call_${i}`,
            type: 'function',
            function: {
              name: part.function_call.name,
              arguments: JSON.stringify(part.function_call.args)
            }
          });
        }
      }

      if (textParts.length > 0) {
        delta.content = textParts.join('');
        delta.role = 'assistant';
      }

      if (toolCalls.length > 0) {
        delta.tool_calls = toolCalls;
      }
    }

    return {
      id: `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta,
        finish_reason: candidate?.finish_reason ? 
          (this.mapFinishReason(candidate.finish_reason) || 'stop') : undefined
      }]
    };
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        return null;
    }
  }

  private async handleApiError(response: Response): Promise<Error> {
    const errorText = await response.text();
    let errorData;

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }

    const message = errorData.error?.message || errorData.message || 'Unknown Google API error';
    const code = errorData.error?.code || response.status.toString();

    let errorType = 'server_error';
    
    switch (response.status) {
      case 400:
        errorType = 'invalid_request';
        break;
      case 401:
      case 403:
        errorType = 'auth_error';
        break;
      case 429:
        errorType = 'rate_limit';
        break;
      case 408:
        errorType = 'timeout';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorType = 'server_error';
        break;
    }

    const error = new Error(`Google API Error (${response.status}): ${message}`);
    (error as any).type = errorType;
    (error as any).status = response.status;
    (error as any).code = code;
    return error;
  }

}

// Export factory function
export function createGoogleProvider(apiKey: string, options?: { baseUrl?: string; timeout?: number }): GoogleProvider {
  return new GoogleProvider(apiKey, options);
}
