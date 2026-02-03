#!/usr/bin/env node

// Test script for the enhanced AgentRouter API
const BASE_URL = 'http://localhost:3000/api/route';

// Test cases covering different scenarios
const testCases = [
  {
    name: "Simple Question",
    prompt: "What is the capital of France?",
    expected: { strategy: "direct", cost: "low", specializations: ["general"] }
  },
  {
    name: "Code Generation",
    prompt: "Write a Python function to sort a list of dictionaries by a specific key",
    expected: { specializations: ["code"], complexity: 3 }
  },
  {
    name: "Image Analysis", 
    prompt: "Analyze this image and describe what you see in detail",
    expected: { specializations: ["vision"], strategy: "direct" }
  },
  {
    name: "Complex Reasoning",
    prompt: "Solve this complex mathematical proof step by step: prove that the square root of 2 is irrational",
    expected: { specializations: ["reasoning"], complexity: 4, strategy: "escalate" }
  },
  {
    name: "Research Task",
    prompt: "Compare the pros and cons of React, Vue, and Angular frameworks for enterprise applications",
    expected: { strategy: "parallel", parallelizable: true }
  },
  {
    name: "Quick Summary",
    prompt: "Quick summary of main points",
    expected: { specializations: ["speed"], complexity: 1, cost: "low" }
  },
  {
    name: "Haiku Creation",
    prompt: "Write a haiku about artificial intelligence",
    expected: { cost: "low", complexity: 2 }
  },
  {
    name: "Debug Complex Code",
    prompt: "Debug this complex multi-threaded JavaScript application with memory leaks and race conditions",
    expected: { specializations: ["code"], complexity: 4, strategy: "escalate" }
  }
];

// Helper function to test a single case
async function testCase(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`📝 Prompt: "${testCase.prompt}"`);
  
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: testCase.prompt
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log(`✅ Strategy: ${result.strategy} (${result.strategyReason})`);
    console.log(`🤖 Selected Model: ${result.selectedModel} (${result.provider})`);
    console.log(`💰 Cost: ${result.estimatedCost} | Complexity: ${result.complexity}/5`);
    console.log(`🔧 Specializations: ${result.requiredSpecializations.join(', ')}`);
    console.log(`🎯 Match: ${result.specializationMatch ? 'Yes' : 'No'} | Parallelizable: ${result.parallelizable ? 'Yes' : 'No'}`);
    console.log(`📊 Tokens: ${result.tokenEstimate.direct}${result.tokenEstimate.delegated ? ` (delegated: ${result.tokenEstimate.delegated})` : ''}`);
    
    // Validate expectations
    let validationResults = [];
    if (testCase.expected.strategy && result.strategy !== testCase.expected.strategy) {
      validationResults.push(`❌ Expected strategy: ${testCase.expected.strategy}, got: ${result.strategy}`);
    }
    if (testCase.expected.cost && result.estimatedCost !== testCase.expected.cost) {
      validationResults.push(`❌ Expected cost: ${testCase.expected.cost}, got: ${result.estimatedCost}`);
    }
    if (testCase.expected.complexity && Math.abs(result.complexity - testCase.expected.complexity) > 1) {
      validationResults.push(`❌ Expected complexity ~${testCase.expected.complexity}, got: ${result.complexity}`);
    }
    if (testCase.expected.specializations) {
      const hasExpectedSpecs = testCase.expected.specializations.every(spec => 
        result.requiredSpecializations.includes(spec)
      );
      if (!hasExpectedSpecs) {
        validationResults.push(`❌ Expected specializations: ${testCase.expected.specializations.join(', ')}, got: ${result.requiredSpecializations.join(', ')}`);
      }
    }
    
    if (validationResults.length === 0) {
      console.log(`✅ All expectations met!`);
    } else {
      console.log(`⚠️  Some expectations not met:`);
      validationResults.forEach(msg => console.log(`   ${msg}`));
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

// Health check first
async function healthCheck() {
  console.log('🔍 Checking AgentRouter API health...');
  
  try {
    const response = await fetch(BASE_URL, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const health = await response.json();
    console.log(`✅ ${health.status}`);
    console.log(`📊 Models: ${health.totalModels} across ${health.providers.length} providers`);
    console.log(`🏢 Providers: ${health.providers.join(', ')}`);
    return true;
  } catch (error) {
    console.error(`❌ Health check failed: ${error.message}`);
    console.log(`💡 Make sure to run: cd team-infrastack && npm run dev`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 AgentRouter Enhanced API Test Suite\n');
  
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Running test cases...');
  console.log('='.repeat(60));
  
  for (const testCase of testCases) {
    await testCase(testCase);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Test suite completed!');
  console.log('='.repeat(60));
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testCases, testCase, healthCheck, runTests };