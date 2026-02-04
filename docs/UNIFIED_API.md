# Unified LLM Gateway API

The Unified LLM Gateway provides a single, OpenAI-compatible interface to access all major LLM providers with enhanced cost tracking, latency monitoring, and intelligent routing for agent workflows.

## Quick Start

### Basic Request

```typescript
const response = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  },
  body: JSON.stringify({
    model: 'claude-3.5-sonnet',
    messages: [{
      role: 'user',
      content: 'Explain quantum computing in simple terms'
    }],
    max_tokens: 500,
    temperature: 0.7
  })
});

const data = await response.json();
```

### Response Format

```json
{
  "id": "chatcmpl-123abc",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "claude-3.5-sonnet",
  "provider": "anthropic",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Quantum computing is like having a super-powered calculator..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 45,
    "total_tokens": 57
  },
  "cost": {
    "input_cost": 0.0036,
    "output_cost": 0.0135,
    "total_cost": 0.0171,
    "cost_per_1k_tokens": 0.30,
    "currency": "USD"
  },
  "latency": {
    "total_time_ms": 1247,
    "ttfb_ms": 234,
    "processing_time_ms": 1013
  }
}
```

## Core Features

### 🎯 OpenAI-Compatible Interface
- Drop-in replacement for OpenAI API
- Consistent request/response format across all providers
- Support for all major parameters: `temperature`, `max_tokens`, `stop`, etc.

### 💰 Built-in Cost Tracking
- Real-time cost calculation for every request
- Per-token pricing breakdown
- Budget controls and alerts
- Cost optimization recommendations

### ⚡ Latency Monitoring
- Time-to-first-byte (TTFB) tracking
- Processing time breakdown
- Network overhead measurement
- Performance optimization insights

### 🔀 Intelligent Routing
- Automatic model selection based on cost, speed, or quality
- Fallback handling for reliability
- Load balancing across providers
- Cache optimization

## Supported Models

| Provider | Models | Specialties |
|----------|--------|------------|
| **Anthropic** | Claude 3 Opus, Claude 3.5 Sonnet, Claude 3 Haiku | Reasoning, coding, analysis |
| **OpenAI** | GPT-4 Turbo, GPT-4o, GPT-3.5 Turbo, o1-preview | General purpose, vision |
| **Google** | Gemini 1.5 Pro, Gemini 1.5 Flash | Large context, speed |
| **Meta** | Llama 3.1 70B, Llama 3.1 8B, Code Llama | Open source, coding |
| **Mistral** | Mistral Large, Mistral Medium, Codestral | European compliance |
| **Cohere** | Command R+, Command R | Enterprise, reasoning |

## API Endpoints

### Chat Completions

**POST** `/api/v1/chat/completions`

Create a chat completion with automatic provider routing.

#### Request Body

```typescript
interface UnifiedRequest {
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
  tools?: Tool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  
  // Gateway extensions
  routing?: {
    strategy?: 'cost' | 'speed' | 'quality' | 'auto';
    max_cost_per_1k_tokens?: number;
    max_latency_ms?: number;
    preferred_providers?: string[];
    fallback_models?: string[];
    enable_caching?: boolean;
  };
  
  budget?: {
    max_cost?: number;
    cost_alert_threshold?: number;
    tracking_id?: string;
    user_id?: string;
    project_id?: string;
  };
  
  response?: {
    include_usage?: boolean; // default: true
    include_cost?: boolean; // default: true
    include_latency?: boolean; // default: true
    include_model_info?: boolean; // default: false
  };
}
```

#### Response

```typescript
interface UnifiedResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  provider: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls';
  }>;
  
  // Always included
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cache_hit_tokens?: number;
  };
  
  cost: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
    cost_per_1k_tokens: number;
    currency: string;
    cache_savings?: number;
  };
  
  latency: {
    total_time_ms: number;
    ttfb_ms?: number;
    processing_time_ms?: number;
    network_time_ms?: number;
  };
  
  // Optional metadata
  routing?: {
    selected_provider: string;
    routing_reason: string;
    considered_models: string[];
    fallback_used?: boolean;
    cache_hit?: boolean;
  };
}
```

### Streaming

Add `"stream": true` to your request for Server-Sent Events:

```typescript
const response = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Write a story' }],
    stream: true
  })
});

// Handle streaming response
const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      const parsed = JSON.parse(data);
      // Handle streaming chunk
      console.log(parsed.choices[0].delta.content);
    }
  }
}
```

### Models List

**GET** `/api/v1/models`

Get available models with capabilities and pricing.

```json
{
  "data": [{
    "id": "claude-3.5-sonnet",
    "object": "model",
    "provider": "anthropic",
    "display_name": "Claude 3.5 Sonnet",
    "capabilities": {
      "max_tokens": 4096,
      "context_window": 200000,
      "supports_vision": false,
      "supports_function_calling": true,
      "supports_streaming": true,
      "cost_per_1k_input_tokens": 0.003,
      "cost_per_1k_output_tokens": 0.015,
      "avg_latency_ms": 1200
    },
    "category": "reasoning",
    "tier": "premium"
  }]
}
```

### Usage Analytics

**GET** `/api/v1/analytics/usage?period=day&start=2024-01-01&end=2024-01-02`

Get detailed usage analytics for monitoring and optimization.

```json
{
  "period": "day",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-02T00:00:00Z",
  "total_requests": 1523,
  "total_cost": 45.67,
  "avg_latency_ms": 1247,
  "cost_by_provider": {
    "anthropic": 25.43,
    "openai": 15.24,
    "google": 5.00
  },
  "top_models": [
    { "model": "claude-3.5-sonnet", "usage_count": 456, "cost": 18.24 },
    { "model": "gpt-4o", "usage_count": 334, "cost": 12.67 }
  ]
}
```

## Advanced Features

### Cost Control

Set spending limits and get alerts:

```typescript
{
  "model": "gpt-4-turbo",
  "messages": [...],
  "budget": {
    "max_cost": 0.50,
    "cost_alert_threshold": 0.40,
    "user_id": "user_123",
    "project_id": "project_ai_assistant"
  }
}
```

### Intelligent Routing

Optimize for your priorities:

```typescript
{
  "model": "auto", // Let the router choose
  "messages": [...],
  "routing": {
    "strategy": "cost", // or 'speed', 'quality', 'auto'
    "max_cost_per_1k_tokens": 0.01,
    "max_latency_ms": 2000,
    "preferred_providers": ["anthropic", "openai"],
    "fallback_models": ["claude-3-haiku", "gpt-4o-mini"]
  }
}
```

### Function Calling

Standard OpenAI-compatible function calling:

```typescript
{
  "model": "claude-3.5-sonnet",
  "messages": [{
    "role": "user",
    "content": "What's the weather in San Francisco?"
  }],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name"
          }
        },
        "required": ["location"]
      }
    }
  }],
  "tool_choice": "auto"
}
```

### Caching

Reduce costs and latency with intelligent caching:

```typescript
{
  "model": "gpt-4o",
  "messages": [...],
  "routing": {
    "enable_caching": true
  }
}
```

Cache hits are reflected in usage and cost:

```json
{
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200,
    "cache_hit_tokens": 120
  },
  "cost": {
    "total_cost": 0.008,
    "cache_savings": 0.012
  }
}
```

## Batch Processing

Process multiple requests efficiently:

**POST** `/api/v1/batches`

```typescript
{
  "requests": [
    {
      "model": "claude-3-haiku",
      "messages": [{ "role": "user", "content": "Summarize this: ..." }]
    },
    {
      "model": "gpt-4o-mini", 
      "messages": [{ "role": "user", "content": "Translate this: ..." }]
    }
  ],
  "max_concurrent_requests": 5,
  "return_individual_costs": true
}
```

## Error Handling

Consistent error format across all providers:

```json
{
  "error": {
    "message": "The model 'invalid-model' does not exist",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found",
    "provider": "anthropic",
    "request_id": "req_123abc"
  }
}
```

### Error Types

- `invalid_request_error` - Invalid request parameters
- `authentication_error` - Invalid API key
- `permission_error` - Insufficient permissions
- `not_found_error` - Model or resource not found
- `rate_limit_error` - Rate limit exceeded
- `server_error` - Gateway internal error
- `provider_error` - Upstream provider error

### Retry Logic

The gateway automatically retries failed requests:
- Network errors: Up to 3 retries with exponential backoff
- Rate limits: Intelligent backoff based on provider headers
- Provider errors: Automatic failover to backup models

## Authentication

All requests require authentication via API key:

```bash
curl -H "Authorization: Bearer your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"model": "gpt-4o", "messages": [...]}' \
     https://your-gateway.com/api/v1/chat/completions
```

## Rate Limits

Default rate limits per API key:
- **Free tier**: 100 requests/hour, 50,000 tokens/hour
- **Pro tier**: 1,000 requests/hour, 500,000 tokens/hour  
- **Enterprise**: Custom limits

Rate limit headers are included in responses:
```
X-RateLimit-Limit-Requests: 1000
X-RateLimit-Remaining-Requests: 999
X-RateLimit-Reset-Requests: 1677652400
X-RateLimit-Limit-Tokens: 500000
X-RateLimit-Remaining-Tokens: 499850
```

## Webhooks

Configure webhooks for cost alerts and batch completion:

```typescript
// Cost alert webhook payload
{
  "type": "cost_alert",
  "user_id": "user_123", 
  "project_id": "project_ai",
  "current_cost": 45.67,
  "threshold": 40.00,
  "period": "day"
}

// Batch completion webhook payload  
{
  "type": "batch_completed",
  "batch_id": "batch_123",
  "status": "completed",
  "total_requests": 100,
  "successful_requests": 98,
  "total_cost": 5.67
}
```

## SDKs & Libraries

### Python

```bash
pip install infrastack-llm-client
```

```python
from infrastack import UnifiedLLM

client = UnifiedLLM(api_key="your-api-key")

response = client.chat.completions.create(
    model="claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Hello!"}],
    routing={"strategy": "cost"}
)

print(f"Cost: ${response.cost.total_cost}")
print(f"Latency: {response.latency.total_time_ms}ms")
```

### TypeScript/Node.js

```bash
npm install infrastack-llm-client
```

```typescript
import { UnifiedLLM } from 'infrastack-llm-client';

const client = new UnifiedLLM({ apiKey: 'your-api-key' });

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  budget: { max_cost: 0.10 }
});
```

### cURL Examples

#### Basic completion
```bash
curl -X POST https://your-gateway.com/api/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3.5-sonnet",
    "messages": [{"role": "user", "content": "Write a haiku about AI"}],
    "max_tokens": 100
  }'
```

#### With cost optimization
```bash
curl -X POST https://your-gateway.com/api/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Explain machine learning"}],
    "routing": {
      "strategy": "cost",
      "max_cost_per_1k_tokens": 0.01
    },
    "budget": {
      "max_cost": 0.05,
      "user_id": "demo_user"
    }
  }'
```

## Configuration

### Environment Variables

```bash
# Gateway Configuration
UNIFIED_GATEWAY_PORT=3000
UNIFIED_GATEWAY_HOST=0.0.0.0

# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=...
MISTRAL_API_KEY=...
COHERE_API_KEY=...

# Database (for usage tracking)
DATABASE_URL=postgresql://...
REDIS_URL=redis://... # For caching

# Monitoring
ENABLE_METRICS=true
ENABLE_LOGGING=true
LOG_LEVEL=info
```

### Router Configuration

```typescript
// config/router.ts
export const routerConfig = {
  default_strategy: 'auto',
  preferred_providers: ['anthropic', 'openai'],
  blocked_providers: [],
  enable_fallbacks: true,
  max_fallback_attempts: 3,
  fallback_delay_ms: 1000,
  max_cost_per_request: 1.00,
  cost_alert_threshold: 0.50,
  enable_cost_optimization: true,
  cache_enabled: true,
  cache_ttl_seconds: 3600,
  load_balancing_enabled: true
};
```

## Monitoring & Observability

### Health Check

**GET** `/api/v1/health`

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_ms": 123456789,
  "providers": {
    "anthropic": { "status": "healthy", "latency_ms": 234 },
    "openai": { "status": "healthy", "latency_ms": 187 },
    "google": { "status": "degraded", "latency_ms": 2100 }
  }
}
```

### Metrics

The gateway exposes Prometheus metrics:
- `unified_requests_total` - Total requests by model/provider
- `unified_request_duration_seconds` - Request latency histogram
- `unified_tokens_total` - Token usage by model/provider
- `unified_cost_total` - Cost by model/provider
- `unified_errors_total` - Errors by type/provider
- `unified_cache_hits_total` - Cache hit rate

## Migration Guide

### From OpenAI API

No changes needed! Just update your base URL:

```diff
- const openai = new OpenAI({ baseURL: 'https://api.openai.com/v1' });
+ const openai = new OpenAI({ baseURL: 'https://your-gateway.com/api/v1' });
```

### From LangChain

```python
from langchain.llms import OpenAI

llm = OpenAI(
    openai_api_base="https://your-gateway.com/api/v1",
    openai_api_key="your-gateway-key",
    model_name="claude-3.5-sonnet"  # Use any supported model
)
```

### From LiteLLM

```python
# Before
import litellm
response = litellm.completion(
    model="anthropic/claude-3-sonnet",
    messages=[{"role": "user", "content": "Hello"}]
)

# After  
import openai
client = openai.OpenAI(
    base_url="https://your-gateway.com/api/v1",
    api_key="your-gateway-key"
)
response = client.chat.completions.create(
    model="claude-3-sonnet",  # Simplified model names
    messages=[{"role": "user", "content": "Hello"}]
)
# Plus automatic cost tracking!
print(f"Cost: ${response.cost.total_cost}")
```

## Best Practices

### Cost Optimization
1. **Use routing strategies**: Let the gateway choose the most cost-effective model
2. **Set budget limits**: Prevent runaway costs with `budget.max_cost`
3. **Enable caching**: Reduce repeat costs with `routing.enable_caching`
4. **Monitor usage**: Check analytics regularly for optimization opportunities

### Performance Optimization  
1. **Use streaming**: For user-facing applications, enable `stream: true`
2. **Choose appropriate models**: Use faster models for simple tasks
3. **Set latency limits**: Use `routing.max_latency_ms` for time-sensitive apps
4. **Implement retries**: Handle provider outages gracefully

### Security
1. **Rotate API keys**: Regularly rotate your gateway API keys
2. **Use project IDs**: Isolate costs and usage by project
3. **Monitor usage**: Watch for unusual patterns that might indicate compromise
4. **Validate inputs**: Always validate user inputs before sending to models

## FAQ

**Q: How does pricing compare to calling providers directly?**
A: The gateway adds a small markup (typically 5-10%) but often saves money through intelligent routing, caching, and bulk pricing with providers.

**Q: What happens if a provider is down?**
A: The gateway automatically fails over to backup providers and models based on your configuration.

**Q: Can I use my own provider API keys?**  
A: Yes, you can bring your own keys (BYOK) for any provider while still using the unified interface.

**Q: Is streaming supported for all providers?**
A: Yes, the gateway normalizes streaming responses across all providers that support it.

**Q: How accurate is the cost tracking?**
A: Cost calculations are updated in real-time based on current provider pricing and are accurate to the cent.

## Support

- **Documentation**: [docs.infrastack.ai](https://docs.infrastack.ai)
- **Discord**: [discord.gg/infrastack](https://discord.gg/infrastack)
- **Email**: support@infrastack.ai
- **Status**: [status.infrastack.ai](https://status.infrastack.ai)

## Changelog

### v1.0.0 (Latest)
- ✅ Initial release with OpenAI-compatible API
- ✅ Support for 6 major providers, 20+ models  
- ✅ Real-time cost and latency tracking
- ✅ Intelligent routing and fallback handling
- ✅ Function calling support
- ✅ Streaming responses
- ✅ Batch processing
- ✅ Usage analytics and monitoring

---

*The Unified LLM Gateway - One API to rule them all* 🚀