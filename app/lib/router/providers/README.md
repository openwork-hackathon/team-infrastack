# Provider Adapters

This directory contains provider adapters that convert between the unified request/response format and provider-specific APIs.

## Anthropic Adapter

The Anthropic adapter implements the `ProviderAdapter` interface to work with Claude models.

### Features

- ✅ **Message Format Conversion**: Converts OpenAI-style messages to Anthropic format
- ✅ **System Prompt Handling**: Properly handles system messages as separate parameter
- ✅ **Vision Support**: Converts image inputs to Anthropic's base64 format
- ✅ **Function Calling**: Maps between OpenAI and Anthropic tool formats
- ✅ **Streaming**: Server-Sent Events streaming support
- ✅ **Cost Calculation**: Accurate cost calculation using latest Anthropic pricing
- ✅ **Error Handling**: Comprehensive error handling with retry logic
- ✅ **Extended Thinking**: Support for extended thinking mode

### Usage

```typescript
import { createAnthropicAdapter } from './app/lib/router/providers/anthropic';

const adapter = createAnthropicAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Non-streaming request
const response = await adapter.execute({
  model: 'claude-3.5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'Hello, Claude!' }
  ],
  max_tokens: 100
});

// Streaming request
for await (const chunk of adapter.stream(request)) {
  console.log(chunk.choices[0].delta.content);
}

// Vision request
const visionResponse = await adapter.execute({
  model: 'claude-3.5-sonnet-20241022',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image', image_url: { url: 'data:image/jpeg;base64,...' } }
      ]
    }
  ]
});

// Function calling
const toolResponse = await adapter.execute({
  model: 'claude-3.5-sonnet-20241022',
  messages: [{ role: 'user', content: 'What is the weather like?' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        }
      }
    }
  }]
});
```

### Supported Models

- `claude-3-opus-20240229` - Most capable, highest cost ($15/$75 per 1M tokens)
- `claude-3.5-sonnet-20241022` - Excellent balance ($3/$15 per 1M tokens)
- `claude-3-sonnet-20240229` - Good balance ($3/$15 per 1M tokens)
- `claude-3.5-haiku-20241022` - Fast and efficient ($1/$5 per 1M tokens)
- `claude-3-haiku-20240307` - Fastest, lowest cost ($0.25/$1.25 per 1M tokens)

### Error Handling

The adapter throws `ProviderError` instances with specific types:

- `rate_limit` - Rate limit exceeded (retryable)
- `auth_error` - Invalid API key (not retryable)
- `timeout` - Request timeout (retryable)
- `invalid_request` - Bad request (not retryable)
- `server_error` - Server error (retryable)

### Configuration

```typescript
interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;     // Default: 'https://api.anthropic.com'
  timeout?: number;     // Default: 60000ms
  retries?: number;     // Default: 3
}
```

### Testing

Run the test suite:

```bash
node test-anthropic-adapter.js
```

The test includes mock tests for all major functionality without requiring a real API key.

## Adding New Providers

To add a new provider:

1. Create a new file: `providers/[provider].ts`
2. Implement the `ProviderAdapter` interface
3. Add provider-specific types to `types.ts`
4. Create tests: `test-[provider]-adapter.js`
5. Export from `providers/index.ts`

### Provider Interface

```typescript
interface ProviderAdapter {
  name: string;
  execute(request: UnifiedRequest): Promise<UnifiedResponse>;
  stream(request: UnifiedRequest): AsyncGenerator<StreamChunk>;
  validateApiKey(key: string): Promise<boolean>;
  getSupportedModels(): string[];
  calculateCost(model: string, usage: TokenUsage): Cost;
}
```

Each adapter should handle the conversion between the unified format and the provider's native format.