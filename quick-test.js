// Quick test of AgentOrchestrator API
const API_BASE = 'http://localhost:3000';

async function quickTest() {
  console.log('🚀 Quick AgentOrchestrator Test');
  
  // Check if any API keys are available
  const hasApiKeys = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY);
  
  if (!hasApiKeys) {
    console.log('\n⚠️  No API keys detected - testing will use fallback behavior');
    console.log('💡 For real LLM integration, add API keys to .env.local and run: npm run test:real');
  }
  
  try {
    // Test health check
    console.log('\n📍 Testing health endpoint...');
    const healthResponse = await fetch(`${API_BASE}/api/orchestrate`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check passed:', healthData.status);
    
    // Test simple orchestration
    console.log('\n🎯 Testing simple orchestration...');
    const testTask = {
      task: "Create a simple React component for displaying user profile information",
      constraints: { maxCost: "medium" }
    };
    
    const response = await fetch(`${API_BASE}/api/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testTask)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Orchestration successful!`);
      console.log(`   Strategy: ${result.strategy}`);
      console.log(`   Sub-tasks: ${result.subTasks.length}`);
      console.log(`   Cost: ${result.totalCost}`);
      console.log(`   Time: ${result.executionTimeMs}ms`);
      console.log(`   Result: ${result.result.substring(0, 100)}...`);
    } else {
      console.log(`❌ Error:`, result.error);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

quickTest();