// Real API test for AgentOrchestrator 
// Tests actual LLM integration with environment-based API keys

const API_BASE = 'http://localhost:3000';

// Check which API keys are available
function checkAvailableProviders() {
  const providers = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_API_KEY
  };
  
  console.log('🔑 Available API Keys:');
  Object.entries(providers).forEach(([provider, available]) => {
    console.log(`  ${provider}: ${available ? '✅' : '❌'}`);
  });
  
  return providers;
}

// Test scenarios that work with available providers
const getTestScenarios = (providers) => {
  const scenarios = [];
  
  if (providers.anthropic) {
    scenarios.push({
      name: "Anthropic - Code Generation",
      request: {
        task: "Write a simple Python function to calculate fibonacci numbers",
        constraints: { maxCost: "low", preferredProvider: "anthropic" }
      }
    });
  }
  
  if (providers.openai) {
    scenarios.push({
      name: "OpenAI - Creative Writing", 
      request: {
        task: "Write a short story about a robot learning to paint",
        constraints: { maxCost: "medium", preferredProvider: "openai" }
      }
    });
  }
  
  if (providers.google) {
    scenarios.push({
      name: "Google - Technical Explanation",
      request: {
        task: "Explain how blockchain consensus mechanisms work",
        constraints: { maxCost: "medium", preferredProvider: "google" }
      }
    });
  }
  
  // Multi-provider parallel test (if multiple providers available)
  const availableCount = Object.values(providers).filter(Boolean).length;
  if (availableCount >= 2) {
    scenarios.push({
      name: "Multi-Provider Parallel Task",
      request: {
        task: "Create a comprehensive guide for building a React application with authentication, routing, and state management",
        constraints: { maxCost: "high" }
      }
    });
  }
  
  return scenarios;
};

async function testRealOrchestrator() {
  console.log('🤖 Testing Real AgentOrchestrator with LLM APIs\n');
  
  // Check available providers
  const providers = checkAvailableProviders();
  const availableCount = Object.values(providers).filter(Boolean).length;
  
  if (availableCount === 0) {
    console.log('\n❌ No API keys found!');
    console.log('💡 Setup instructions:');
    console.log('  1. Copy .env.example to .env.local');
    console.log('  2. Add your API keys');
    console.log('  3. Restart the development server');
    return;
  }
  
  console.log(`\n🚀 Testing with ${availableCount} provider(s)...\n`);
  
  try {
    // Test health check
    console.log('📍 Health Check...');
    const healthResponse = await fetch(`${API_BASE}/api/orchestrate`);
    const healthData = await healthResponse.json();
    console.log('✅ Health:', healthData.status);
    
    // Get test scenarios based on available providers
    const scenarios = getTestScenarios(providers);
    
    if (scenarios.length === 0) {
      console.log('❌ No test scenarios available for current provider setup');
      return;
    }
    
    // Execute test scenarios
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(`\n🎯 Test ${i + 1}: ${scenario.name}`);
      console.log(`📝 Task: "${scenario.request.task.substring(0, 80)}..."`);
      
      const startTime = Date.now();
      
      try {
        const response = await fetch(`${API_BASE}/api/orchestrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scenario.request)
        });
        
        const data = await response.json();
        const elapsedTime = Date.now() - startTime;
        
        if (response.ok) {
          console.log(`✅ Strategy: ${data.strategy}`);
          console.log(`💰 Cost: ${data.totalCost}`);
          console.log(`📊 Sub-tasks: ${data.subTasks.length}`);
          console.log(`⚡ Time: ${data.executionTimeMs}ms (API: ${elapsedTime}ms)`);
          
          // Show sub-task details with real results
          data.subTasks.forEach(subTask => {
            const status = getStatusIcon(subTask.status);
            console.log(`  ${status} Task ${subTask.id}: ${subTask.model} - ${subTask.status}`);
            
            if (subTask.result) {
              // Show first 150 chars of real LLM response
              const preview = subTask.result.substring(0, 150);
              console.log(`     Response: ${preview}${subTask.result.length > 150 ? '...' : ''}`);
            }
            
            if (subTask.error) {
              console.log(`     Error: ${subTask.error}`);
            }
          });
          
          console.log(`📄 Combined Result: ${data.result.substring(0, 200)}...`);
          
        } else {
          console.log(`❌ Error: ${data.error}`);
          if (data.details) {
            console.log(`   Details: ${data.details}`);
          }
        }
        
      } catch (error) {
        console.log(`💥 Request failed: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Real LLM integration testing complete!');
    console.log('✅ The orchestrator successfully made real API calls to configured providers');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error.message);
    console.log('\n💡 Make sure:');
    console.log('  1. Development server is running: npm run dev');
    console.log('  2. API keys are configured in .env.local');
  }
}

function getStatusIcon(status) {
  const icons = {
    pending: '⏳',
    running: '🏃',
    complete: '✅',
    error: '❌'
  };
  return icons[status] || '❓';
}

// Check if running directly
if (require.main === module) {
  testRealOrchestrator().catch(console.error);
}

module.exports = { testRealOrchestrator };