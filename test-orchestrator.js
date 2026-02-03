// Test script for AgentOrchestrator API
// Demonstrates auto-execution of router recommendations

const API_BASE = 'http://localhost:3000';

// Test scenarios covering different orchestration strategies
const testScenarios = [
  {
    name: "Simple Task (Direct Strategy)",
    request: {
      task: "What is the capital of France?",
      constraints: { maxCost: "low" }
    }
  },
  {
    name: "Code Task (Delegate Strategy)", 
    request: {
      task: "Write a React component for user authentication with form validation",
      constraints: { maxCost: "medium" }
    }
  },
  {
    name: "Complex Project (Parallel Strategy)",
    request: {
      task: "Build a landing page with token section, payment integration, and user dashboard",
      constraints: { maxCost: "medium" }
    }
  },
  {
    name: "Research Task (Parallel Strategy)",
    request: {
      task: "Compare React, Vue, and Angular frameworks for enterprise applications with detailed analysis",
      constraints: { maxCost: "high" }
    }
  },
  {
    name: "High Risk Task (Escalate Strategy)",
    request: {
      task: "Design a cryptocurrency trading algorithm with automated high-frequency transactions",
      constraints: { maxCost: "high" }
    }
  }
];

async function testOrchestrator() {
  console.log('🤖 Testing AgentOrchestrator API\n');
  
  try {
    // Test health check
    console.log('📍 Health Check...');
    const healthResponse = await fetch(`${API_BASE}/api/orchestrate`);
    const healthData = await healthResponse.json();
    console.log('✅ Health:', healthData.status);
    console.log(`📋 Strategies: ${Object.keys(healthData.strategies).join(', ')}\n`);
    
    // Test orchestration scenarios
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`🎯 Test ${i + 1}: ${scenario.name}`);
      console.log(`📝 Task: "${scenario.request.task}"`);
      
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
          
          // Show sub-task details
          data.subTasks.forEach(subTask => {
            console.log(`  └─ Task ${subTask.id}: ${subTask.model} - ${subTask.status}`);
            if (subTask.result) {
              console.log(`     Result: ${subTask.result.substring(0, 80)}...`);
            }
          });
          
          console.log(`📄 Result: ${data.result.substring(0, 120)}...`);
          
        } else {
          console.log(`❌ Error: ${data.error}`);
        }
        
      } catch (error) {
        console.log(`💥 Request failed: ${error.message}`);
      }
      
      console.log(''); // Empty line between tests
    }
    
    // Test error handling
    console.log('🚫 Testing Error Handling...');
    
    const errorTests = [
      { name: 'Empty task', body: { task: '' } },
      { name: 'Missing task', body: { constraints: { maxCost: 'low' } } },
      { name: 'Invalid cost', body: { task: 'Test', constraints: { maxCost: 'invalid' } } }
    ];
    
    for (const errorTest of errorTests) {
      try {
        const response = await fetch(`${API_BASE}/api/orchestrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorTest.body)
        });
        
        const data = await response.json();
        console.log(`${errorTest.name}: ${response.status} - ${data.error || data.details}`);
        
      } catch (error) {
        console.log(`${errorTest.name}: Request failed - ${error.message}`);
      }
    }
    
    console.log('\n🎉 AgentOrchestrator testing complete!');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error.message);
    console.log('\n💡 Make sure the development server is running: npm run dev');
  }
}

// Performance test
async function performanceTest() {
  console.log('\n⚡ Performance Test: 5 concurrent orchestrations...');
  
  const concurrentTasks = Array(5).fill().map((_, i) => ({
    task: `Generate a React component for feature ${i + 1}`,
    constraints: { maxCost: 'medium' }
  }));
  
  const startTime = Date.now();
  
  try {
    const promises = concurrentTasks.map(task =>
      fetch(`${API_BASE}/api/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      }).then(r => r.json())
    );
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ All ${results.length} tasks completed in ${totalTime}ms`);
    console.log(`📊 Average: ${Math.round(totalTime / results.length)}ms per task`);
    
    const strategies = results.map(r => r.strategy).reduce((acc, strategy) => {
      acc[strategy] = (acc[strategy] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`📋 Strategies used:`, strategies);
    
  } catch (error) {
    console.log(`💥 Performance test failed: ${error.message}`);
  }
}

// Run tests
async function runAllTests() {
  await testOrchestrator();
  await performanceTest();
}

// Check if running directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testOrchestrator, performanceTest };