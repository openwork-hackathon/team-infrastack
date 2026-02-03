// Demonstration of AgentRouter capabilities
const BASE_URL = 'http://localhost:3000/api/route';

const demoTests = [
  {
    name: "🏃‍♂️ Speed Task",
    prompt: "Quick summary of the main points"
  },
  {
    name: "💻 Code Generation", 
    prompt: "Write a React component with TypeScript for a user dashboard"
  },
  {
    name: "🖼️ Vision Task",
    prompt: "Analyze this image and describe what you see in detail"
  },
  {
    name: "🧠 Complex Reasoning",
    prompt: "Solve this complex mathematical proof step by step involving advanced calculus and logic"
  },
  {
    name: "🔍 Research Task",
    prompt: "Compare the advantages and disadvantages of React, Vue, Angular, and Svelte frameworks"
  },
  {
    name: "🎨 Creative Task", 
    prompt: "Write a creative short story about AI and humans working together"
  },
  {
    name: "🐛 Debug Complex Code",
    prompt: "Debug this complex multi-threaded application with race conditions and memory leaks"
  }
];

async function runDemo() {
  console.log('🚀 AgentRouter Enhanced API Demo\n');
  console.log('=' .repeat(70));
  
  for (const test of demoTests) {
    console.log(`\n${test.name}`);
    console.log(`📝 "${test.prompt}"`);
    console.log('-'.repeat(50));
    
    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: test.prompt })
      });
      
      const result = await response.json();
      
      console.log(`🤖 Model: ${result.selectedModel} (${result.provider})`);
      console.log(`⚡ Strategy: ${result.strategy}`);
      console.log(`🔧 Specializations: ${result.requiredSpecializations.join(', ')}`);
      console.log(`💰 Cost: ${result.estimatedCost} | 🧠 Complexity: ${result.complexity}/5`);
      console.log(`🎯 Specialization Match: ${result.specializationMatch ? '✅' : '❌'}`);
      console.log(`📊 Tokens: ${result.tokenEstimate.direct} | Context: ${result.contextWindow.toLocaleString()}`);
      console.log(`💡 Reason: ${result.modelReason}`);
      
      // Delay between tests for readability
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('🎉 Demo completed! AgentRouter successfully routes to 21 models across 6 providers');
}

runDemo();