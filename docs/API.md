# AgentRouter API Documentation

## Overview

AgentRouter is an intelligent routing service that automatically selects the optimal AI model for any given task or prompt. It analyzes prompt complexity, performance requirements, and resource constraints to route requests to the most suitable AI provider and model configuration.

The service acts as a unified gateway, abstracting away the complexity of choosing between different AI providers (Anthropic, OpenAI, Google) and their various models, while optimizing for cost, latency, and task-specific performance.

## Why Agents Need Smart Routing

Modern AI applications often require different capabilities for different tasks:

- **Simple queries** can be handled efficiently by lightweight, fast models
- **Complex reasoning tasks** need more powerful (and expensive) models
- **Real-time applications** require low-latency responses
- **Cost-sensitive operations** need budget-optimized routing

AgentRouter eliminates the need for manual model selection by:

✅ **Automatically analyzing prompt complexity**  
✅ **Matching tasks to optimal models**  
✅ **Balancing cost vs. performance trade-offs**  
✅ **Providing consistent API across providers**  
✅ **Enabling intelligent fallback strategies**

## API Reference

### Base URL
```
https://api.infrastack.dev
```

### Authentication
Include your API key in the Authorization header:
```
Authorization: Bearer YOUR_API_KEY
```

---

## POST /api/route

Routes a prompt to the optimal AI model based on the task requirements and specified constraints.

### Request

**Content-Type:** `application/json`

```json
{
  "prompt": "string - the task/prompt to route",
  "constraints": {
    "maxCost": "low|medium|high (optional)",
    "maxLatency": "number in ms (optional)",
    "preferredProvider": "anthropic|openai|google (optional)"
  }
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | **Yes** | The task or prompt to be routed |
| `constraints` | object | No | Optional routing constraints |
| `constraints.maxCost` | string | No | Maximum acceptable cost tier (`low`, `medium`, `high`) |
| `constraints.maxLatency` | number | No | Maximum acceptable response time in milliseconds |
| `constraints.preferredProvider` | string | No | Preferred AI provider (`anthropic`, `openai`, `google`) |

### Response

**Content-Type:** `application/json`

```json
{
  "selectedModel": "model-id",
  "reason": "explanation of selection",
  "estimatedCost": "low|medium|high",
  "complexity": 1
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `selectedModel` | string | The ID of the selected model (e.g., `claude-3-haiku`, `gpt-4o-mini`) |
| `reason` | string | Human-readable explanation for why this model was selected |
| `estimatedCost` | string | Estimated cost tier for this routing decision |
| `complexity` | number | Assessed complexity score from 1 (simple) to 5 (highly complex) |

---

## Examples

### Example 1: Simple Question

**Request:**
```bash
curl -X POST https://api.infrastack.dev/api/route \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?"
  }'
```

**Response:**
```json
{
  "selectedModel": "claude-3-haiku",
  "reason": "Simple factual query suitable for fast, cost-effective model",
  "estimatedCost": "low",
  "complexity": 1
}
```

### Example 2: Complex Analysis with Constraints

**Request:**
```bash
curl -X POST https://api.infrastack.dev/api/route \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Analyze the economic implications of implementing a carbon tax in developing nations, considering geopolitical factors and trade relationships.",
    "constraints": {
      "maxCost": "medium",
      "maxLatency": 5000
    }
  }'
```

**Response:**
```json
{
  "selectedModel": "claude-3-sonnet",
  "reason": "Complex analytical task requiring advanced reasoning within medium cost constraints",
  "estimatedCost": "medium",
  "complexity": 4
}
```

### Example 3: Real-time Application

**Request:**
```bash
curl -X POST https://api.infrastack.dev/api/route \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Generate a brief welcome message for a new user signup",
    "constraints": {
      "maxLatency": 1000,
      "preferredProvider": "openai"
    }
  }'
```

**Response:**
```json
{
  "selectedModel": "gpt-4o-mini",
  "reason": "Low-latency requirement met with preferred provider for simple text generation",
  "estimatedCost": "low",
  "complexity": 1
}
```

---

## Error Responses

The API returns standard HTTP status codes with detailed error information.

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "message": "Missing required field: prompt",
  "code": "MISSING_REQUIRED_FIELD"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key",
  "code": "INVALID_API_KEY"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 100 requests per minute exceeded. Try again in 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Unable to route request at this time",
  "code": "ROUTING_ERROR"
}
```

### 503 Service Unavailable
```json
{
  "error": "Service temporarily unavailable",
  "message": "All AI providers are currently unavailable",
  "code": "PROVIDERS_UNAVAILABLE"
}
```

---

## Rate Limits

- **Rate Limit:** 100 requests per minute per API key
- **Reset:** Rate limits reset at the beginning of each minute
- **Headers:** Rate limit information is included in response headers:
  - `X-RateLimit-Limit`: Maximum requests per minute
  - `X-RateLimit-Remaining`: Requests remaining in current window
  - `X-RateLimit-Reset`: Timestamp when the rate limit resets

---

## Model Selection Logic

AgentRouter uses a sophisticated scoring algorithm that considers:

1. **Prompt Analysis**
   - Text length and complexity
   - Required reasoning depth
   - Domain-specific requirements

2. **Performance Metrics**
   - Historical model performance on similar tasks
   - Current provider latency and availability
   - Quality scores for task categories

3. **Constraint Optimization**
   - Cost vs. performance trade-offs
   - Latency requirements
   - Provider preferences and availability

4. **Fallback Strategy**
   - Primary model selection
   - Backup options if primary fails
   - Graceful degradation paths

---

## Getting Started

1. **Get an API key** from the [InfraStack Dashboard](https://dashboard.infrastack.dev)
2. **Test the endpoint** with a simple prompt
3. **Integrate** into your application using the examples above
4. **Monitor usage** via the dashboard analytics

For additional support and advanced features, visit our [documentation portal](https://docs.infrastack.dev) or contact support at support@infrastack.dev.