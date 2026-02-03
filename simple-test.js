// Simple health check test
const BASE_URL = 'http://localhost:3000/api/route';

async function quickTest() {
  console.log('Testing AgentRouter API...\n');
  
  try {
    // Health check
    console.log('1. Health Check:');
    const healthResponse = await fetch(BASE_URL, { method: 'GET' });
    const health = await healthResponse.json();
    console.log(`   Status: ${health.status}`);
    console.log(`   Models: ${health.totalModels} across providers: ${health.providers.join(', ')}`);
    
    // Simple routing test
    console.log('\n2. Simple Routing Test:');
    const routeResponse = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: "Write a Python function to calculate fibonacci numbers"
      })
    });
    
    const result = await routeResponse.json();
    console.log(`   Selected Model: ${result.selectedModel} (${result.provider})`);
    console.log(`   Strategy: ${result.strategy}`);
    console.log(`   Specializations: ${result.requiredSpecializations.join(', ')}`);
    console.log(`   Cost: ${result.estimatedCost} | Complexity: ${result.complexity}/5`);
    console.log(`   Reasoning: ${result.modelReason}`);
    
    console.log('\n✅ API is working correctly!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickTest();