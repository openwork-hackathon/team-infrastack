// AgentOrchestrator - Auto-executes AgentRouter recommendations
// Handles: direct/delegate/parallel/escalate strategies

export interface OrchestratorRequest {
  task: string;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    preferredProvider?: string;
    timeout?: number;
  };
}

export interface SubTask {
  id: number;
  task: string;
  model: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  result?: string;
  error?: string;
}

export interface OrchestratorResponse {
  strategy: 'direct' | 'delegate' | 'parallel' | 'escalate';
  subTasks: SubTask[];
  result: string;
  totalCost: 'low' | 'medium' | 'high';
  executionTimeMs: number;
  routingDecision?: any; // Original AgentRouter response
}

// Mock sub-agent responses for demo
const MOCK_RESPONSES = [
  "Successfully completed the task with high quality output.",
  "Task completed efficiently using optimized approach.",
  "Generated comprehensive solution meeting all requirements.",
  "Delivered results with best practices implementation.",
  "Completed task with performance optimizations applied."
];

export class AgentOrchestrator {
  private baseUrl: string;
  
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async orchestrate(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    
    try {
      // Step 1: Get routing decision from AgentRouter
      const routingDecision = await this.callAgentRouter(request.task, request.constraints);
      
      // Step 2: Execute based on strategy
      let result: OrchestratorResponse;
      
      switch (routingDecision.strategy) {
        case 'direct':
          result = await this.handleDirect(routingDecision, request.task);
          break;
        case 'delegate':
          result = await this.handleDelegate(routingDecision, request.task);
          break;
        case 'parallel':
          result = await this.handleParallel(routingDecision, request.task);
          break;
        case 'escalate':
          result = await this.handleEscalate(routingDecision, request.task);
          break;
        default:
          throw new Error(`Unknown strategy: ${routingDecision.strategy}`);
      }
      
      result.executionTimeMs = Date.now() - startTime;
      result.routingDecision = routingDecision;
      
      return result;
      
    } catch (error) {
      console.error('Orchestration error:', error);
      return {
        strategy: 'direct',
        subTasks: [{
          id: 1,
          task: request.task,
          model: 'fallback',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        result: `Orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        totalCost: 'low',
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  private async callAgentRouter(task: string, constraints?: any) {
    const response = await fetch(`${this.baseUrl}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: task,
        constraints: constraints || {}
      })
    });
    
    if (!response.ok) {
      throw new Error(`AgentRouter failed: ${response.status}`);
    }
    
    return response.json();
  }

  private async handleDirect(routingDecision: any, task: string): Promise<OrchestratorResponse> {
    // Direct strategy: Return task to caller to handle
    return {
      strategy: 'direct',
      subTasks: [{
        id: 1,
        task: task,
        model: routingDecision.selectedModel,
        status: 'complete',
        result: `Task should be handled directly using ${routingDecision.selectedModel}. No sub-agents needed.`
      }],
      result: `Direct execution recommended. Use ${routingDecision.selectedModel} for: "${task}"`,
      totalCost: routingDecision.estimatedCost || 'low',
      executionTimeMs: 0
    };
  }

  private async handleDelegate(routingDecision: any, task: string): Promise<OrchestratorResponse> {
    // Delegate strategy: Spawn single sub-agent with recommended model
    const subTask: SubTask = {
      id: 1,
      task: task,
      model: routingDecision.selectedModel,
      status: 'pending'
    };
    
    // Mock sub-agent spawning with delay
    subTask.status = 'running';
    await this.simulateSubAgent(800); // 800ms delay
    
    subTask.status = 'complete';
    subTask.result = this.getRandomMockResponse();
    
    return {
      strategy: 'delegate',
      subTasks: [subTask],
      result: `Delegated to ${routingDecision.selectedModel}: ${subTask.result}`,
      totalCost: routingDecision.estimatedCost || 'medium',
      executionTimeMs: 0
    };
  }

  private async handleParallel(routingDecision: any, task: string): Promise<OrchestratorResponse> {
    // Parallel strategy: Break down task and spawn multiple sub-agents
    const subTasks = this.breakDownTask(task);
    const parallelTasks: SubTask[] = subTasks.map((subTask, index) => ({
      id: index + 1,
      task: subTask,
      model: this.selectModelForSubTask(routingDecision.selectedModel),
      status: 'pending'
    }));
    
    // Execute all sub-tasks in parallel (mock)
    const promises = parallelTasks.map(async (subTask, index) => {
      subTask.status = 'running';
      await this.simulateSubAgent(500 + index * 100); // Staggered delays
      subTask.status = 'complete';
      subTask.result = this.getRandomMockResponse();
      return subTask;
    });
    
    await Promise.all(promises);
    
    // Merge results
    const combinedResult = this.mergeResults(parallelTasks);
    
    return {
      strategy: 'parallel',
      subTasks: parallelTasks,
      result: `Parallel execution completed. ${combinedResult}`,
      totalCost: this.calculateTotalCost(parallelTasks.length, routingDecision.estimatedCost),
      executionTimeMs: 0
    };
  }

  private async handleEscalate(routingDecision: any, task: string): Promise<OrchestratorResponse> {
    // Escalate strategy: Flag for human/PM review
    return {
      strategy: 'escalate',
      subTasks: [{
        id: 1,
        task: task,
        model: 'human-review',
        status: 'pending',
        result: 'Flagged for human review due to complexity or risk factors'
      }],
      result: `Task escalated for human review. Complexity: ${routingDecision.complexity}/5. Reason: Task requires human oversight or exceeds automation capabilities.`,
      totalCost: 'high',
      executionTimeMs: 0
    };
  }

  // Helper methods for mock implementation
  private breakDownTask(task: string): string[] {
    // Simple task breakdown logic for demo
    if (task.toLowerCase().includes('landing page')) {
      return [
        'Create responsive HTML structure',
        'Style components with CSS',
        'Add interactive elements',
        'Implement token section',
        'Optimize for performance'
      ];
    } else if (task.toLowerCase().includes('api')) {
      return [
        'Design API endpoints',
        'Implement core logic',
        'Add error handling',
        'Write tests',
        'Document API'
      ];
    } else {
      // Generic breakdown
      return [
        'Analyze requirements',
        'Implement core functionality',
        'Add refinements',
        'Test and validate'
      ];
    }
  }

  private selectModelForSubTask(baseModel: string): string {
    // Distribute across appropriate models for parallel tasks
    const models = ['claude-3.5-sonnet', 'gpt-4o', 'gemini-1.5-flash', 'mistral-medium'];
    return models[Math.floor(Math.random() * models.length)];
  }

  private mergeResults(subTasks: SubTask[]): string {
    const completedTasks = subTasks.filter(t => t.status === 'complete');
    return `Successfully completed ${completedTasks.length}/${subTasks.length} subtasks. All components integrated and delivered.`;
  }

  private calculateTotalCost(numTasks: number, baseCost: string): 'low' | 'medium' | 'high' {
    if (numTasks <= 2) return baseCost as 'low' | 'medium' | 'high';
    if (numTasks <= 4) {
      return baseCost === 'low' ? 'medium' : 'high';
    }
    return 'high';
  }

  private getRandomMockResponse(): string {
    return MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
  }

  private async simulateSubAgent(delayMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator();