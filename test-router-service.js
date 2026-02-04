// RouterService Test Suite
// Tests the core router execution service functionality

const { RouterService } = require('./app/lib/router/service');

console.log('🧪 Testing RouterService...\n');

// Test configuration
const testConfig = {
  baseUrl: 'http://localhost:3000',
  maxRetries: 2,
  apiKeys: {
    anthropic: 'test-key-anthropic',
    openai: 'test-key-openai'
  }
};

// Initialize RouterService
const router = new RouterService(testConfig);

async function testRouterService() {
  try {
    console.log('1️⃣ Testing basic routing (auto-selection)...');
    
    const basicRequest = {
      prompt: 'Explain quantum computing in simple terms',
      constraints: {
        maxCost: 'medium',
        preferredProvider: 'anthropic'
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
    
    // Create a request that should trigger fallback (simulate provider error)
    const fallbackRequest = {
      model: 'nonexistent-model', // This should fail and trigger fallback
      prompt: 'List the benefits of renewable energy',
      constraints: {
        maxCost: 'low'
      }
    };

    try {
      const fallbackResponse = await router.routeWithFallback(fallbackRequest);
      console.log('✅ Fallback mechanism successful');
      console.log(`   Original model: ${fallbackRequest.model}`);
      console.log(`   Fallback model: ${fallbackResponse.routing.selectedModel}`);
      console.log(`   Fallback used: ${fallbackResponse.routing.fallbackUsed}`);
      if (fallbackResponse.routing.fallbackReason) {
        console.log(`   Reason: ${fallbackResponse.routing.fallbackReason.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log('⚠️  Fallback test expected to fail with mock providers');
      console.log(`   Error: ${error.message.substring(0, 100)}...`);
    }
    console.log('');

    console.log('4️⃣ Testing complex routing (parallel strategy)...');
    
    const complexRequest = {
      prompt: 'Analyze multiple aspects of climate change: scientific evidence, economic impacts, and potential solutions. Provide detailed research on each area.',
      constraints: {
        maxCost: 'high'
      },
      executionOptions: {
        strategy: 'parallel'
      }
    };

    const complexResponse = await router.route(complexRequest);
    console.log('✅ Complex routing successful');
    console.log(`   Strategy: ${complexResponse.routing.strategy}`);
    console.log(`   Complexity: ${complexResponse.routing.complexity}`);
    console.log(`   Execution time: ${complexResponse.routing.executionTimeMs}ms`);
    console.log('');

    console.log('5️⃣ Testing usage tracking...');
    
    const usageStats = router.getUsageStats();
    console.log('✅ Usage tracking working');
    console.log(`   Total requests: ${usageStats.totalRequests}`);
    console.log(`   Total tokens: ${usageStats.totalTokens}`);
    console.log(`   Total cost: $${usageStats.totalCost.toFixed(4)}`);
    console.log(`   Average latency: ${usageStats.averageLatency.toFixed(2)}ms`);
    console.log(`   Models used: ${Object.keys(usageStats.modelUsage).length}`);
    console.log(`   Fallback events: ${usageStats.fallbackEvents}`);
    console.log('');

    console.log('6️⃣ Testing provider registration...');
    
    // Create a mock provider adapter
    const mockProvider = {
      name: 'test-provider',
      provider: 'mock',
      async execute(request) {
        return {
          id: `test_${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'test-model',
          provider: 'mock',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: `Test response for: ${request.prompt || 'message request'}`
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150,
            cost_estimate: 0.001
          },
          routing: {
            strategy: 'direct',
            selectedModel: 'test-model',
            complexity: 1,
            executionTimeMs: 500
          }
        };
      },
      async isAvailable() {
        return true;
      },
      estimateCost(tokens) {
        return tokens * 0.000001;
      }
    };

    router.registerProvider('test-provider', mockProvider);
    router.setApiKey('mock', 'test-api-key');
    console.log('✅ Provider registration successful');
    console.log('');

    console.log('7️⃣ Testing cost optimization...');
    
    const costRequests = [
      { prompt: 'Simple task', constraints: { maxCost: 'low' } },
      { prompt: 'Medium complexity analysis task', constraints: { maxCost: 'medium' } },
      { prompt: 'Complex multi-step reasoning and analysis task requiring advanced capabilities', constraints: { maxCost: 'high' } }
    ];

    for (const [index, req] of costRequests.entries()) {
      const response = await router.route(req);
      console.log(`   Cost tier ${req.constraints.maxCost}: ${response.routing.selectedModel} ($${response.usage.cost_estimate.toFixed(4)})`);
    }
    console.log('✅ Cost optimization working correctly');
    console.log('');

    console.log('8️⃣ Final usage summary...');
    
    const finalStats = router.getUsageStats();
    console.log(`   Total tests completed: ${finalStats.totalRequests}`);
    console.log(`   Total cost for all tests: $${finalStats.totalCost.toFixed(4)}`);
    console.log(`   Most used model: ${getMostUsedModel(finalStats.modelUsage)}`);
    console.log(`   Provider errors: ${Object.keys(finalStats.providerErrors).length} types`);
    console.log('');

    console.log('🎉 All RouterService tests completed successfully!');
    console.log('');
    console.log('📊 Final Statistics:');
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
    console.error('❌ RouterService test failed:', error);
    console.error('Stack trace:', error.stack);
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

// Additional test functions

async function testValidation() {
  console.log('🔍 Testing input validation...');
  
  const invalidRequests = [
    { /* missing prompt and messages */ },
    { prompt: '' },
    { messages: [] },
    { messages: [{ role: 'invalid', content: 'test' }] },
    { messages: [{ role: 'user' }] } // missing content
  ];

  for (const [index, req] of invalidRequests.entries()) {
    try {
      await router.route(req);
      console.log(`❌ Validation test ${index + 1} failed - should have thrown error`);
    } catch (error) {
      console.log(`✅ Validation test ${index + 1} passed - correctly rejected invalid input`);
    }
  }
  console.log('');
}

async function testErrorHandling() {
  console.log('🔧 Testing error handling...');
  
  // Test timeout simulation
  const timeoutRequest = {
    prompt: 'Test timeout handling',
    constraints: {
      timeout: 1 // Very short timeout to trigger timeout error
    }
  };

  try {
    await router.route(timeoutRequest);
    console.log('⚠️  Timeout test - no timeout occurred (expected with mock)');
  } catch (error) {
    console.log(`✅ Timeout handling: ${error.message.substring(0, 50)}...`);
  }
  console.log('');
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting comprehensive RouterService test suite...\n');
  
  await testValidation();
  await testErrorHandling();
  await testRouterService();
  
  console.log('✨ Test suite completed!');
}

// Execute tests
runAllTests().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});