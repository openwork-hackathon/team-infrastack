// Test script for Plan-Only mode in AgentOrchestrator
// Tests planOnly=true returns plan without execution

const BASE_URL = 'http://localhost:3000';

async function testPlanMode() {
  console.log('🧪 Testing Plan-Only Mode for AgentOrchestrator\n');
  
  const tests = [
    {
      name: 'Direct Strategy Plan',
      task: 'Write a simple "Hello World" function',
      expectedStrategy: 'direct'
    },
    {
      name: 'Delegate Strategy Plan',
      task: 'Create a React component for user login with validation',
      expectedStrategy: 'delegate'
    },
    {
      name: 'Parallel Strategy Plan',
      task: 'Build a landing page with multiple sections and payment integration',
      expectedStrategy: 'parallel'
    },
    {
      name: 'Escalate Strategy Plan',
      task: 'Design and implement a distributed blockchain protocol with consensus mechanism',
      expectedStrategy: 'escalate'
    }
  ];

  let passedTests = 0;
  let totalTests = tests.length;

  for (const test of tests) {
    console.log(`\n📋 Testing: ${test.name}`);
    console.log(`Task: "${test.task}"`);
    
    try {
      // Test planOnly=true
      const planResult = await makeRequest('/api/orchestrate', {
        task: test.task,
        planOnly: true
      });

      // Validate plan response structure
      const planValidation = validatePlanResponse(planResult, test);
      
      if (planValidation.success) {
        console.log(`✅ Plan generated successfully`);
        console.log(`   Strategy: ${planResult.strategy}`);
        console.log(`   Tasks: ${planResult.tasks.length}`);
        console.log(`   Estimated Cost: ${planResult.estimatedCost}`);
        console.log(`   Estimated Tokens: ${planResult.estimatedTokens}`);
        
        // Test task dependencies
        const depValidation = validateTaskDependencies(planResult.tasks);
        if (depValidation.success) {
          console.log(`✅ Task dependencies are logical`);
          passedTests++;
        } else {
          console.log(`❌ Task dependencies validation failed: ${depValidation.error}`);
        }
      } else {
        console.log(`❌ Plan validation failed: ${planValidation.error}`);
      }

      // Also test that planOnly=false still works (execution mode)
      console.log(`   Testing execution mode (planOnly=false)...`);
      const execResult = await makeRequest('/api/orchestrate', {
        task: test.task,
        planOnly: false
      });

      if (execResult.strategy && execResult.subTasks) {
        console.log(`✅ Execution mode still works`);
      } else {
        console.log(`❌ Execution mode broken`);
      }

    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n📊 Test Summary: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Plan-only mode is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

async function makeRequest(endpoint, body) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return response.json();
}

function validatePlanResponse(plan, test) {
  // Check required fields
  const requiredFields = ['planId', 'strategy', 'tasks', 'estimatedCost', 'estimatedTokens', 'createdAt'];
  
  for (const field of requiredFields) {
    if (!(field in plan)) {
      return { success: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate planId is UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(plan.planId)) {
    return { success: false, error: 'planId is not a valid UUID' };
  }

  // Validate strategy
  const validStrategies = ['direct', 'delegate', 'parallel', 'escalate'];
  if (!validStrategies.includes(plan.strategy)) {
    return { success: false, error: `Invalid strategy: ${plan.strategy}` };
  }

  // Validate tasks array
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return { success: false, error: 'tasks must be a non-empty array' };
  }

  // Validate task structure
  for (const task of plan.tasks) {
    const taskValidation = validateTask(task);
    if (!taskValidation.success) {
      return { success: false, error: `Task validation failed: ${taskValidation.error}` };
    }
  }

  // Validate cost and tokens
  const validCosts = ['low', 'medium', 'high'];
  if (!validCosts.includes(plan.estimatedCost)) {
    return { success: false, error: `Invalid estimatedCost: ${plan.estimatedCost}` };
  }

  if (typeof plan.estimatedTokens !== 'number' || plan.estimatedTokens <= 0) {
    return { success: false, error: 'estimatedTokens must be a positive number' };
  }

  // Validate createdAt is valid ISO date
  if (isNaN(Date.parse(plan.createdAt))) {
    return { success: false, error: 'createdAt must be a valid ISO date string' };
  }

  // Validate aggregation for parallel strategy
  if (plan.strategy === 'parallel') {
    if (!plan.aggregation) {
      return { success: false, error: 'Parallel strategy must include aggregation' };
    }
    
    const validMethods = ['merge', 'select_best', 'synthesize'];
    if (!validMethods.includes(plan.aggregation.method)) {
      return { success: false, error: `Invalid aggregation method: ${plan.aggregation.method}` };
    }
  }

  return { success: true };
}

function validateTask(task) {
  const requiredFields = ['id', 'task', 'model', 'provider', 'priority', 'dependsOn', 'estimatedTokens'];
  
  for (const field of requiredFields) {
    if (!(field in task)) {
      return { success: false, error: `Task missing required field: ${field}` };
    }
  }

  // Validate types
  if (typeof task.id !== 'number' || task.id <= 0) {
    return { success: false, error: 'Task id must be a positive number' };
  }

  if (typeof task.task !== 'string' || task.task.trim().length === 0) {
    return { success: false, error: 'Task description must be a non-empty string' };
  }

  if (typeof task.model !== 'string' || task.model.trim().length === 0) {
    return { success: false, error: 'Task model must be a non-empty string' };
  }

  if (typeof task.provider !== 'string' || task.provider.trim().length === 0) {
    return { success: false, error: 'Task provider must be a non-empty string' };
  }

  if (typeof task.priority !== 'number' || task.priority <= 0) {
    return { success: false, error: 'Task priority must be a positive number' };
  }

  if (!Array.isArray(task.dependsOn)) {
    return { success: false, error: 'Task dependsOn must be an array' };
  }

  if (typeof task.estimatedTokens !== 'number' || task.estimatedTokens <= 0) {
    return { success: false, error: 'Task estimatedTokens must be a positive number' };
  }

  return { success: true };
}

function validateTaskDependencies(tasks) {
  // Check that all dependencies reference valid task IDs
  const taskIds = new Set(tasks.map(t => t.id));
  
  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        return { success: false, error: `Task ${task.id} depends on non-existent task ${depId}` };
      }
      
      if (depId >= task.id) {
        return { success: false, error: `Task ${task.id} has circular or forward dependency on task ${depId}` };
      }
    }
  }

  // Check for logical dependency patterns
  const hasDependencies = tasks.some(t => t.dependsOn.length > 0);
  if (tasks.length > 1 && !hasDependencies && tasks.every(t => t.priority === 1)) {
    console.log('   ⚠️  Warning: Multiple tasks with no dependencies might benefit from explicit sequencing');
  }

  return { success: true };
}

// Run tests if called directly
if (require.main === module) {
  testPlanMode().catch(console.error);
}

module.exports = { testPlanMode, validatePlanResponse };