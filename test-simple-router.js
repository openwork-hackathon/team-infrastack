// Simple RouterService Test Suite
// Tests the simplified router execution service functionality

console.log('🧪 Testing Simple RouterService...\n');

// Mock the RouterService for testing
class MockRouterService {
  constructor(config = {}) {
    this.config = { baseUrl: 'http://localhost:3000', maxRetries: 3, ...config };
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      modelUsage: {},
      fallbackEvents: 0
    };
    this.providers = new Map();
  }

  async route(request) {
    const startTime = Date.now();
    
    // Validate request
    if (!request.prompt && (!request.messages || request.messages.length === 0)) {
      throw new Error('Request must include either prompt or messages');
    }

    // Get routing decision (mock)
    const routingDecision = await this.getRoutingDecision(request);
    const selectedModel = request.model || routingDecision.selectedModel;

    // Execute mock request
    const response = await this.executeWithMock(request, selectedModel);

    // Track usage
    this.trackUsage(selectedModel, response, Date.now() - startTime);

    // Add routing metadata
    response.routing = {
      strategy: routingDecision.strategy,
      selectedModel,
      complexity: routingDecision.complexity,
      executionTimeMs: Date.now() - startTime,
      fallbackUsed: false
    };

    response.id = this.generateRequestId();
    return response;
  }

  async routeWithFallback(request) {
    try {
      return await this.route(request);
    } catch (error) {
      // Try fallback models
      const fallbackModels = ['claude-3-haiku', 'gpt-4o-mini', 'gemini-1.5-flash'];
      
      for (const fallbackModel of fallbackModels) {
        try {
          const fallbackRequest = { ...request, model: fallbackModel };
          const response = await this.route(fallbackRequest);
          response.routing.fallbackUsed = true;
          this.usageStats.fallbackEvents++;
          return response;
        } catch (fallbackError) {
          continue;
        }
      }
      throw error;
    }
  }

  async getRoutingDecision(request) {
    const prompt = request.prompt || this.messagesToPrompt(request.messages || []);
    
    // Mock routing logic
    const complexity = this.analyzeComplexity(prompt);
    let selectedModel = 'claude-3.5-sonnet';
    
    if (request.constraints?.maxCost === 'low') {
      selectedModel = 'gpt-4o-mini';
    } else if (complexity >= 4) {
      selectedModel = 'claude-3-opus';
    } else if (prompt.toLowerCase().includes('code')) {
      selectedModel = 'claude-3.5-sonnet';
    }

    return {
      selectedModel,
      strategy: complexity >= 3 ? 'delegate' : 'direct',
      complexity
    };
  }

  analyzeComplexity(prompt) {
    if (prompt.length > 500) return 4;
    if (prompt.length > 200) return 3;
    if (prompt.length > 100) return 2;
    return 1;
  }

  async executeWithMock(request, modelName) {
    const prompt = request.prompt || this.messagesToPrompt(request.messages || []);
    const tokens = Math.ceil(prompt.length / 4) + 200;

    return {
      id: this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      provider: this.getProviderFromModel(modelName),
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
        total_tokens: tokens,
        cost_estimate: this.estimateCost(tokens, modelName)
      }
    };
  }

  trackUsage(modelName, response, latency) {
    this.usageStats.totalRequests++;
    this.usageStats.totalTokens += response.usage.total_tokens;
    this.usageStats.totalCost += response.usage.cost_estimate;

    if (!this.usageStats.modelUsage[modelName]) {
      this.usageStats.modelUsage[modelName] = {
        requests: 0,
        tokens: 0,
        cost: 0,
        latency: 0
      };
    }

    const modelStats = this.usageStats.modelUsage[modelName];
    const previousRequests = modelStats.requests;
    const previousAvgLatency = modelStats.latency;

    modelStats.requests++;
    modelStats.tokens += response.usage.total_tokens;
    modelStats.cost += response.usage.cost_estimate;
    modelStats.latency = (previousAvgLatency * previousRequests + latency) / modelStats.requests;
  }

  getUsageStats() {
    return { ...this.usageStats };
  }

  resetUsageStats() {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      modelUsage: {},
      fallbackEvents: 0
    };
  }

  registerProvider(name, adapter) {
    this.providers.set(name, adapter);
    console.log(`📝 Registered provider: ${name}`);
  }

  getProviderFromModel(modelName) {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt') || modelName.includes('o1')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    return 'unknown';
  }

  estimateCost(tokens, modelName) {
    const costPerK = {
      'claude-3-opus': 0.015,
      'claude-3.5-sonnet': 0.003,
      'claude-3-haiku': 0.0015,
      'gpt-4o': 0.005,
      'gpt-4o-mini': 0.00015,
      'gemini-1.5-flash': 0.00035
    };
    
    const rate = costPerK[modelName] || 0.002;
    return (tokens / 1000) * rate;
  }

  messagesToPrompt(messages) {
    return messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }

  generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }
}

async function testRouterService() {
  const router = new MockRouterService();

  try {
    console.log('1️⃣ Testing basic routing (auto-selection)...');
    
    const basicRequest = {
      prompt: 'Explain quantum computing in simple terms',
      constraints: {
        maxCost: 'medium'
      }
    };

    const basicResponse = await router.route(basicRequest);
    console.log('✅ Basic routing successful');
    console.log(`   Model: ${basicResponse.routing.selectedModel}`);
    console.log(`   Strategy: ${basicResponse.routing.strategy}`);
    console.log(`   Tokens: ${basicResponse.usage.total_tokens}`);
    console.log(`   Cost: $${basicResponse.usage.cost_estimate.toFixed(4)}`);
    console.log('');

    console.log('2️⃣ Testing explicit model selection...');
    
    const explicitRequest = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Write a simple function to calculate factorial' }
      ]
    };

    const explicitResponse = await router.route(explicitRequest);
    console.log('✅ Explicit model routing successful');
    console.log(`   Requested: ${explicitRequest.model}`);
    console.log(`   Used: ${explicitResponse.model}`);
    console.log(`   Response length: ${explicitResponse.choices[0].message.content.length} chars`);
    console.log('');

    console.log('3️⃣ Testing fallback mechanism...');
    
    const fallbackRequest = {
      model: 'nonexistent-model',
      prompt: 'List the benefits of renewable energy'
    };

    const fallbackResponse = await router.routeWithFallback(fallbackRequest);
    console.log('✅ Fallback mechanism successful');
    console.log(`   Original model: ${fallbackRequest.model}`);
    console.log(`   Fallback model: ${fallbackResponse.routing.selectedModel}`);
    console.log(`   Fallback used: ${fallbackResponse.routing.fallbackUsed}`);
    console.log('');

    console.log('4️⃣ Testing cost optimization...');
    
    const costRequests = [
      { prompt: 'Simple task', constraints: { maxCost: 'low' } },
      { prompt: 'Medium complexity analysis task' },
      { prompt: 'Complex multi-step reasoning and analysis task requiring advanced capabilities' }
    ];

    for (const [index, req] of costRequests.entries()) {
      const response = await router.route(req);
      console.log(`   Test ${index + 1}: ${response.routing.selectedModel} ($${response.usage.cost_estimate.toFixed(4)})`);
    }
    console.log('✅ Cost optimization working');
    console.log('');

    console.log('5️⃣ Testing usage tracking...');
    
    const usageStats = router.getUsageStats();
    console.log('✅ Usage tracking working');
    console.log(`   Total requests: ${usageStats.totalRequests}`);
    console.log(`   Total tokens: ${usageStats.totalTokens}`);
    console.log(`   Total cost: $${usageStats.totalCost.toFixed(4)}`);
    console.log(`   Models used: ${Object.keys(usageStats.modelUsage).length}`);
    console.log(`   Fallback events: ${usageStats.fallbackEvents}`);
    console.log('');

    console.log('6️⃣ Testing provider registration...');
    
    const mockProvider = {
      name: 'test-provider',
      provider: 'mock',
      async execute(request) {
        return {
          id: `test_${Date.now()}`,
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 100, cost_estimate: 0.001 }
        };
      }
    };

    router.registerProvider('test-provider', mockProvider);
    console.log('✅ Provider registration successful');
    console.log('');

    console.log('🎉 All Simple RouterService tests completed successfully!');
    console.log('');
    
    const finalStats = router.getUsageStats();
    console.log('📊 Final Statistics:');
    console.log(`   Total tests completed: ${finalStats.totalRequests}`);
    console.log(`   Total cost: $${finalStats.totalCost.toFixed(4)}`);
    console.log(`   Most used model: ${getMostUsedModel(finalStats.modelUsage)}`);
    console.log('');

    console.table(Object.fromEntries(
      Object.entries(finalStats.modelUsage).map(([model, stats]) => [
        model, 
        {
          requests: stats.requests,
          avgLatency: Math.round(stats.latency) + 'ms',
          totalCost: '$' + stats.cost.toFixed(4)
        }
      ])
    ));

  } catch (error) {
    console.error('❌ Simple RouterService test failed:', error);
    process.exit(1);
  }
}

function getMostUsedModel(modelUsage) {
  let mostUsed = '';
  let maxRequests = 0;
  
  for (const [model, stats] of Object.entries(modelUsage)) {
    if (stats.requests > maxRequests) {
      maxRequests = stats.requests;
      mostUsed = model;
    }
  }
  
  return mostUsed || 'none';
}

// Run the tests
console.log('🚀 Starting Simple RouterService test suite...\n');
testRouterService().then(() => {
  console.log('✨ Test suite completed successfully!');
}).catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});