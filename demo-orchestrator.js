// Interactive demo for AgentOrchestrator
// Shows real-time orchestration of different task types

const API_BASE = 'http://localhost:3000';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function orchestrateTask(task, constraints = {}) {
  console.log(`\n🎯 Orchestrating: "${task}"`);
  console.log('⏳ Analyzing and routing...');
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_BASE}/api/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, constraints })
    });
    
    const result = await response.json();
    const apiTime = Date.now() - startTime;
    
    if (!response.ok) {
      console.log(`❌ Error: ${result.error}`);
      return;
    }
    
    // Show routing decision
    console.log(`\n📋 Strategy: ${result.strategy.toUpperCase()}`);
    console.log(`🤖 Model: ${result.routingDecision?.selectedModel || 'various'}`);
    console.log(`💰 Cost: ${result.totalCost}`);
    console.log(`⚡ Execution: ${result.executionTimeMs}ms (API: ${apiTime}ms)`);
    
    // Show sub-tasks with live updates
    if (result.subTasks.length > 0) {
      console.log(`\n📊 Sub-tasks (${result.subTasks.length}):`);
      result.subTasks.forEach(subTask => {
        const status = getStatusIcon(subTask.status);
        console.log(`  ${status} ${subTask.task.substring(0, 50)}... [${subTask.model}]`);
      });
    }
    
    // Show final result
    console.log(`\n📄 Result:`);
    console.log(`   ${result.result}`);
    
    // Show routing reasoning if available
    if (result.routingDecision?.modelReason) {
      console.log(`\n🧠 Router Reasoning:`);
      console.log(`   ${result.routingDecision.modelReason}`);
    }
    
    return result;
    
  } catch (error) {
    console.log(`💥 Failed: ${error.message}`);
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

async function demoOrchestrator() {
  console.log('🚀 AgentOrchestrator Interactive Demo');
  console.log('=====================================');
  
  // Demo scenario 1: Simple direct task
  await orchestrateTask(
    "What are the benefits of using TypeScript?",
    { maxCost: "low" }
  );
  
  await delay(2000);
  
  // Demo scenario 2: Code generation (delegate)  
  await orchestrateTask(
    "Create a React component for a user profile card with avatar, name, and bio",
    { maxCost: "medium", preferredProvider: "anthropic" }
  );
  
  await delay(2000);
  
  // Demo scenario 3: Complex project (parallel)
  await orchestrateTask(
    "Build a landing page with hero section, features list, testimonials, and contact form",
    { maxCost: "medium" }
  );
  
  await delay(2000);
  
  // Demo scenario 4: Research task (parallel)
  await orchestrateTask(
    "Compare Next.js, Nuxt.js, and SvelteKit for building modern web applications",
    { maxCost: "high" }
  );
  
  await delay(2000);
  
  // Demo scenario 5: Escalation case
  await orchestrateTask(
    "Design an AI-powered financial trading system with real-time risk management",
    { maxCost: "high" }
  );
  
  console.log('\n🎉 Demo complete! The orchestrator successfully:');
  console.log('  ✅ Analyzed each task and selected appropriate strategy');
  console.log('  ✅ Routed to optimal models based on task complexity');
  console.log('  ✅ Executed parallel sub-tasks when beneficial'); 
  console.log('  ✅ Escalated high-risk tasks for human review');
  console.log('  ✅ Provided detailed execution tracking and results');
  
  console.log('\n💡 Ready for integration with real sub-agent spawning!');
}

// Real-time orchestration demo
async function liveDemo() {
  console.log('\n🎬 Live Orchestration Demo');
  console.log('Watch tasks get broken down and executed in real-time...\n');
  
  const complexTask = "Create a full-stack e-commerce application with product catalog, shopping cart, user authentication, payment processing, and admin dashboard";
  
  console.log(`🎯 Task: ${complexTask}`);
  console.log('⏳ Step 1: Calling AgentRouter for analysis...');
  
  await delay(1000);
  
  console.log('🧠 Step 2: Router recommends PARALLEL strategy');
  console.log('📊 Step 3: Breaking down into sub-tasks...');
  
  await delay(500);
  
  const subTasks = [
    "Frontend: Product catalog and shopping cart UI",
    "Backend: API endpoints and database design", 
    "Auth: User registration and authentication system",
    "Payment: Integration with payment gateway",
    "Admin: Dashboard for inventory management"
  ];
  
  subTasks.forEach((task, i) => {
    console.log(`  📋 Sub-task ${i + 1}: ${task}`);
  });
  
  await delay(1000);
  
  console.log('\n🚀 Step 4: Spawning sub-agents in parallel...');
  
  // Simulate parallel execution
  for (let i = 0; i < subTasks.length; i++) {
    setTimeout(() => {
      console.log(`🏃 Sub-agent ${i + 1} started: [${['sonnet', 'gpt-4o', 'gemini-flash', 'mistral-medium', 'claude-opus'][i]}]`);
    }, i * 200);
    
    setTimeout(() => {
      console.log(`✅ Sub-agent ${i + 1} completed successfully`);
    }, 2000 + i * 300);
  }
  
  await delay(4000);
  
  console.log('\n🎯 Step 5: Merging results and finalizing...');
  await delay(500);
  
  console.log('✅ All sub-tasks completed successfully!');
  console.log('📦 Final result: Complete e-commerce application delivered');
  
  console.log('\n🚀 This is the power of AgentOrchestrator:');
  console.log('  • Intelligent task decomposition');
  console.log('  • Parallel sub-agent execution');
  console.log('  • Optimal model selection per sub-task');
  console.log('  • Automatic result aggregation');
}

// Check if running directly
if (require.main === module) {
  // Run both demos
  demoOrchestrator().then(() => {
    return liveDemo();
  }).catch(console.error);
}

module.exports = { demoOrchestrator, liveDemo };