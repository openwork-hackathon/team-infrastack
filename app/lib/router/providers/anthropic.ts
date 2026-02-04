import {
  ProviderAdapter,
  UnifiedRequest,
  UnifiedResponse,
  StreamChunk,
  Message,
  Tool,
  TokenUsage,
  Cost,
  ProviderError,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamChunk,
  AnthropicMessage,
  AnthropicTool,
  ANTHROPIC_PRICING,
  AnthropicModel,
  ProviderConfig
} from '../types';

export class AnthropicAdapter  {
  name = 'anthropic';
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.timeout = config.timeout || 60000;
    this.retries = config.retries || 3;
  }

  getSupportedModels(): string[] {
    return Object.keys(ANTHROPIC_PRICING);
  }

  calculateCost(model: string, usage: TokenUsage): Cost {
    const pricing = ANTHROPIC_PRICING[model as AnthropicModel];
    if (!pricing) {
      throw new Error(`Unknown model: ${model}`);
    }

    const input_cost = (usage.prompt_tokens / 1_000_000) * pricing.input;
    const output_cost = (usage.completion_tokens / 1_000_000) * pricing.output;
    
    return {
      input_cost: parseFloat(input_cost.toFixed(6)),
      output_cost: parseFloat(output_cost.toFixed(6)),
      total_cost: parseFloat((input_cost + output_cost).toFixed(6)),
      currency: 'USD'
    };
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      return response.status !== 401 && response.status !== 403;
    } catch (error) {
      return false;
    }
  }

  private convertMessages(messages: Message[]): { system?: string; messages: AnthropicMessage[] } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Anthropic handles system messages separately
        if (typeof message.content === 'string') {
          system = system ? `${system}\n\n${message.content}` : message.content;
        } else if (message.content && Array.isArray(message.content)) {
          // Extract text from content array for system messages
          const contentArray = message.content as Array<any>;
          const textContent = contentArray
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          system = system ? `${system}\n\n${textContent}` : textContent;
        }
        continue;
      }

      if (message.role === 'tool') {
        // Convert tool response to user message in Anthropic format
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Tool result: ${message.content}`
            }
          ]
        });
        continue;
      }

      if (message.role === 'user' || message.role === 'assistant') {
        let content: string | Array<{ type: 'text' | 'image'; text?: string; source?: any }>;

        if (typeof message.content === 'string') {
          content = message.content;
        } else if (message.content && Array.isArray(message.content)) {
          // Convert content array
          content = (message.content as Array<any>).map(c => {
            if (c.type === 'text') {
              return { type: 'text', text: c.text || '' };
            } else if (c.type === 'image' && c.image_url) {
              // Convert image URL to base64 format expected by Anthropic
              const url = c.image_url.url;
              if (url.startsWith('data:')) {
                const [header, base64Data] = url.split(',');
                const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
                return {
                  type: 'image' as const,
                  source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64Data
                  }
                };
              } else {
                // For HTTP URLs, we'd need to fetch and convert to base64
                // For now, convert to text description
                return {
                  type: 'text',
                  text: `[Image: ${url}]`
                };
              }
            }
            return { type: 'text', text: '[Unsupported content type]' };
          });
        } else {
          // Default to empty string if content is null/undefined
          content = '';
        }

        // Handle tool calls for assistant messages
        if (message.tool_calls && message.tool_calls.length > 0) {
          const textContent = typeof content === 'string' ? content : 
            content.filter(c => c.type === 'text').map(c => c.text).join('\n');
          
          const toolContent = message.tool_calls.map(tc => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          }));

          // Anthropic expects content to be array format for tool use
          content = [
            ...(textContent ? [{ type: 'text' as const, text: textContent }] : []),
            ...toolContent
          ] as any;
        }

        anthropicMessages.push({
          role: message.role,
          content: content as any
        });
      }
    }

    return { system, messages: anthropicMessages };
  }

  private convertTools(tools: Tool[]): AnthropicTool[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }

  private convertToolChoice(toolChoice: UnifiedRequest['tool_choice']): AnthropicRequest['tool_choice'] {
    if (!toolChoice || toolChoice === 'none') {
      return undefined;
    }
    if (toolChoice === 'auto') {
      return { type: 'auto' };
    }
    if (toolChoice === 'required') {
      return { type: 'any' };
    }
    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return { type: 'tool', name: toolChoice.function.name };
    }
    return { type: 'auto' };
  }

  private createProviderError(error: any): ProviderError {
    const providerError = new Error(error.message || 'Unknown Anthropic API error') as ProviderError;
    
    if (error.status === 429 || error.type === 'rate_limit_error') {
      providerError.type = 'rate_limit';
      providerError.retryable = true;
      providerError.retryAfter = error.retry_after || 60;
    } else if (error.status === 401 || error.status === 403) {
      providerError.type = 'auth_error';
      providerError.retryable = false;
    } else if (error.code === 'TIMEOUT' || error.name === 'TimeoutError') {
      providerError.type = 'timeout';
      providerError.retryable = true;
    } else if (error.status >= 400 && error.status < 500) {
      providerError.type = 'invalid_request';
      providerError.retryable = false;
    } else {
      providerError.type = 'server_error';
      providerError.retryable = true;
    }

    providerError.code = error.code;
    providerError.status = error.status;
    
    return providerError;
  }

  private async makeRequest(anthropicRequest: AnthropicRequest, stream: boolean = false): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01'
    };

    if (stream) {
      headers['Accept'] = 'text/event-stream';
    }

    const body = {
      ...anthropicRequest,
      stream
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createProviderError({
          status: response.status,
          message: errorData.error?.message || `HTTP ${response.status}`,
          type: errorData.error?.type,
          code: errorData.error?.code
        });
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw this.createProviderError({ code: 'TIMEOUT', message: 'Request timeout' });
      }
      if (error.type) {
        throw error; // Already a ProviderError
      }
      throw this.createProviderError(error);
    }
  }

  async execute(request: UnifiedRequest): Promise<UnifiedResponse> {
    const { system, messages } = this.convertMessages(request.messages);
    
    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages,
      temperature: request.temperature,
      top_p: request.top_p,
      thinking: request.thinking
    };

    if (system) {
      anthropicRequest.system = system;
    }

    if (request.tools && request.tools.length > 0) {
      anthropicRequest.tools = this.convertTools(request.tools);
      anthropicRequest.tool_choice = this.convertToolChoice(request.tool_choice);
    }

    const response = await this.makeRequest(anthropicRequest, false);
    const anthropicResponse: AnthropicResponse = await response.json();

    // Convert response back to unified format
    const usage: TokenUsage = {
      prompt_tokens: anthropicResponse.usage.input_tokens,
      completion_tokens: anthropicResponse.usage.output_tokens,
      total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
    };

    const cost = this.calculateCost(request.model, usage);

    // Convert content blocks to message format
    let messageContent = '';
    const toolCalls: any[] = [];

    for (const content of anthropicResponse.content) {
      if (content.type === 'text') {
        messageContent += content.text || '';
      } else if (content.type === 'tool_use') {
        toolCalls.push({
          id: content.id,
          type: 'function',
          function: {
            name: content.name,
            arguments: JSON.stringify(content.input || {})
          }
        });
      }
    }

    const message: Message = {
      role: 'assistant',
      content: messageContent
    };

    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    const finishReason = anthropicResponse.stop_reason === 'tool_use' ? 'tool_calls' :
                        anthropicResponse.stop_reason === 'max_tokens' ? 'length' : 'stop';

    return {
      id: anthropicResponse.id,
      object: 'chat.completion' as const,
      model: anthropicResponse.model,
      usage,
      cost,
      latency: {
        total_time_ms: 0, // Will be set by router service
        ttfb_ms: 0
      },
      choices: [{
        index: 0,
        message,
        finish_reason: finishReason
      }],
      created: Math.floor(Date.now() / 1000),
      provider: this.name
    };
  }

  async* stream(request: UnifiedRequest): AsyncGenerator<StreamChunk> {
    const { system, messages } = this.convertMessages(request.messages);
    
    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages,
      temperature: request.temperature,
      top_p: request.top_p,
      thinking: request.thinking
    };

    if (system) {
      anthropicRequest.system = system;
    }

    if (request.tools && request.tools.length > 0) {
      anthropicRequest.tools = this.convertTools(request.tools);
      anthropicRequest.tool_choice = this.convertToolChoice(request.tool_choice);
    }

    const response = await this.makeRequest(anthropicRequest, true);
    
    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageId = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const chunk: AnthropicStreamChunk = JSON.parse(data);
            
            if (chunk.type === 'message_start' && chunk.message) {
              messageId = chunk.message.id || '';
            }
            
            if (chunk.type === 'content_block_delta' && chunk.delta) {
              const streamChunk: StreamChunk = {
                id: messageId,
                model: request.model,
                provider: this.name,
                choices: [{
                  index: 0,
                  delta: {
                    content: chunk.delta.text || chunk.delta.partial_json || ''
                  }
                }],
                created: Math.floor(Date.now() / 1000)
              };
              
              yield streamChunk;
            }
            
            if (chunk.type === 'message_stop') {
              const streamChunk: StreamChunk = {
                id: messageId,
                model: request.model,
                provider: this.name,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: 'stop'
                }],
                created: Math.floor(Date.now() / 1000)
              };
              
              yield streamChunk;
            }
          } catch (parseError) {
            console.warn('Failed to parse streaming chunk:', parseError);
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// Export factory function for easy instantiation
export function createAnthropicAdapter(config: ProviderConfig): AnthropicAdapter {
  return new AnthropicAdapter(config);
}

// Export supported models
export const ANTHROPIC_MODELS = Object.keys(ANTHROPIC_PRICING);
