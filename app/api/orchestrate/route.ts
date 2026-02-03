// AgentOrchestrator API Endpoint
// POST /api/orchestrate - Auto-execute tasks based on AgentRouter recommendations

import { NextRequest, NextResponse } from 'next/server';
import { orchestrator, OrchestratorRequest } from '../../lib/orchestrator';

export async function GET() {
  return NextResponse.json({
    status: "AgentOrchestrator API is running",
    description: "Auto-executes tasks based on AgentRouter recommendations",
    version: "1.0.0",
    capabilities: [
      "Task analysis and routing",
      "Sub-agent delegation",
      "Parallel task execution", 
      "Human escalation handling",
      "Cost optimization"
    ],
    strategies: {
      direct: "Returns task to caller for direct execution",
      delegate: "Spawns single sub-agent with recommended model", 
      parallel: "Breaks down task into multiple sub-agents",
      escalate: "Flags complex tasks for human/PM review"
    },
    usage: {
      endpoint: "POST /api/orchestrate",
      body: {
        task: "string (required) - The task to orchestrate",
        constraints: {
          maxCost: "low | medium | high (optional)",
          preferredProvider: "string (optional)",
          timeout: "number (optional)"
        }
      }
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const validationError = validateRequest(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }
    
    // Prepare orchestrator request
    const orchestratorRequest: OrchestratorRequest = {
      task: body.task,
      constraints: body.constraints || {}
    };
    
    console.log('🎯 Orchestrating task:', orchestratorRequest.task);
    
    // Execute orchestration
    const result = await orchestrator.orchestrate(orchestratorRequest);
    
    console.log(`✅ Orchestration complete - Strategy: ${result.strategy}, Time: ${result.executionTimeMs}ms`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Orchestration API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Orchestration failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        strategy: 'direct',
        subTasks: [],
        result: 'Failed to orchestrate task',
        totalCost: 'low',
        executionTimeMs: 0
      },
      { status: 500 }
    );
  }
}

function validateRequest(body: any): string | null {
  if (!body) {
    return 'Request body is required';
  }
  
  if (!body.task || typeof body.task !== 'string') {
    return 'Task is required and must be a string';
  }
  
  if (body.task.trim().length === 0) {
    return 'Task cannot be empty';
  }
  
  if (body.task.length > 2000) {
    return 'Task description too long (max 2000 characters)';
  }
  
  if (body.constraints) {
    if (body.constraints.maxCost && 
        !['low', 'medium', 'high'].includes(body.constraints.maxCost)) {
      return 'maxCost must be: low, medium, or high';
    }
    
    if (body.constraints.timeout && 
        (typeof body.constraints.timeout !== 'number' || body.constraints.timeout <= 0)) {
      return 'timeout must be a positive number';
    }
  }
  
  return null;
}

// Examples for testing:
/*

# Health Check
curl http://localhost:3000/api/orchestrate

# Simple Task
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"task": "Create a simple todo app"}'

# Complex Task with Constraints
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a landing page with token section and payment integration",
    "constraints": {
      "maxCost": "medium",
      "preferredProvider": "anthropic"
    }
  }'

# Code Generation Task
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"task": "Write a React component for user authentication with validation"}'

# Research Task (should trigger parallel)
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"task": "Compare React, Vue, and Angular frameworks for enterprise applications"}'

*/