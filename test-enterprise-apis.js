#!/usr/bin/env node

/**
 * Test script for AgentVault Enterprise Features
 * Tests all 5 new API endpoints with sample requests
 */

const BASE_URL = 'http://localhost:3000/api/vault';

async function testAPI(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n🧪 Testing ${method} ${endpoint}`);
  
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Success (${response.status})`);
      if (data.data) {
        console.log(`📊 Data: ${Array.isArray(data.data) ? `${data.data.length} items` : 'object'}`);
      }
      if (data.summary) {
        console.log(`📈 Summary: ${JSON.stringify(data.summary, null, 2)}`);
      }
    } else {
      console.log(`❌ Error (${response.status}): ${data.error}`);
    }
  } catch (error) {
    console.log(`💥 Request failed: ${error.message}`);
  }
}

async function runTests() {
  console.log('🦞 AgentVault Enterprise API Tests');
  console.log('=====================================');
  
  // 1. Test Wallets API
  console.log('\n🏦 WALLET MANAGEMENT');
  await testAPI('/wallets');
  await testAPI('/wallets', 'POST', {
    name: 'Test Wallet',
    address: '0x1234567890123456789012345678901234567890',
    network: 'base'
  });
  
  // 2. Test Budgets API
  console.log('\n💰 BUDGET MANAGEMENT');
  await testAPI('/budgets');
  await testAPI('/budgets?includeStats=true');
  await testAPI('/budgets', 'POST', {
    name: 'Test Budget',
    type: 'daily',
    limit: 50.00
  });
  
  // 3. Test Alerts API
  console.log('\n🚨 BUDGET ALERTS');
  await testAPI('/alerts');
  await testAPI('/alerts', 'POST', {
    name: 'Test Alert',
    budgetId: 'budget-1',
    thresholdPercentage: 80,
    webhookUrl: 'https://example.com/webhook'
  });
  
  // 4. Test Audit API
  console.log('\n📋 AUDIT LOGGING');
  await testAPI('/audit?limit=10&includeStats=true');
  await testAPI('/audit?provider=anthropic&action=api_call');
  
  // 5. Test Forecast API
  console.log('\n📊 SPENDING FORECAST');
  await testAPI('/forecast');
  await testAPI('/forecast?includeHistorical=true');
  await testAPI('/forecast/recalculate', 'POST', {
    monthlyBudget: 2000,
    trendAdjustment: 1.2
  });
  
  console.log('\n✨ Enterprise API tests completed!');
}

// Check if Next.js dev server is running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/route');
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  const isServerRunning = await checkServer();
  
  if (!isServerRunning) {
    console.log('❌ Next.js server not running on port 3000');
    console.log('💡 Start it with: npm run dev');
    process.exit(1);
  }
  
  await runTests();
}

if (require.main === module) {
  main();
}