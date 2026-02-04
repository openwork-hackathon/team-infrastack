// AgentOrchestrator API Endpoint
// POST /api/orchestrate - Auto-execute tasks based on AgentRouter recommendations

import { NextRequest, NextResponse } from 'next/server';
import { orchestrator, OrchestratorRequest, ExecutionPlan } from '../../lib/orchestrator';
import { validateRequest, schemas } from '../../lib/security/validation';
import { withErrorHandling, createSafeError } from '../../lib/security/errors';
import { rateLimitOrchestration } from '../../lib/security/rate-limiter';

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
        planOnly: "boolean (optional) - Return execution plan without execution",
        constraints: {
          maxCost: "low | medium | high (optional)",
          preferredProvider: "string (optional)",
          timeout: "number (optional)"
        }
      }
    },
    modes: {
      execution: "planOnly: false (default) - Execute the task and return results",
      planning: "planOnly: true - Generate execution plan for local execution"
    }
  });
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Apply rate limiting
  const rateLimitResult = await rateLimitOrchestration(request);
  if (!rateLimitResult.success) {
    throw createSafeError('RATE_LIMIT_EXCEEDED', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetTime: rateLimitResult.resetTime
    }, rateLimitResult.error);
  }
  
  // Validate request input
  const validation = await validateRequest(request, schemas.orchestrator);
  if (!validation.success) {
    throw createSafeError('VALIDATION_ERROR', { error: validation.error });
  }
  
  // Prepare orchestrator request with validated data
  const orchestratorRequest: OrchestratorRequest = {
    task: validation.data.task,
    constraints: validation.data.constraints || {},
    planOnly: validation.data.planOnly || false
  };
  
  console.log('🎯 Orchestrating task:', validation.data.task.substring(0, 100) + '...');
  
  // Execute orchestration or plan generation
  const result = await orchestrator.orchestrate(orchestratorRequest);
  
  if (validation.data.planOnly) {
    const plan = result as ExecutionPlan;
    console.log(`📋 Plan generated - Strategy: ${result.strategy}, Tasks: ${plan.tasks?.length || 0}`);
  } else {
    console.log(`✅ Orchestration complete - Strategy: ${result.strategy}, Time: ${(result as any).executionTimeMs}ms`);
  }
  
  // Return success response with rate limit headers
  const response = NextResponse.json(result);
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());
  
  return response;
});

// Old validation function removed - now using Zod schemas

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

# Plan-Only Mode Examples

# Get execution plan without running (for local agent execution)
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"task": "Build a landing page", "planOnly": true}'

# Complex task plan generation
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a full-stack todo application with authentication",
    "planOnly": true,
    "constraints": {
      "maxCost": "medium",
      "preferredProvider": "anthropic"
    }
  }'

*/