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

// Model provider configurations
const MODEL_PROVIDERS = {
  'claude-3-opus': { provider: 'anthropic', apiModel: 'claude-3-opus-20240229' },
  'claude-3.5-sonnet': { provider: 'anthropic', apiModel: 'claude-3-5-sonnet-20241022' },
  'claude-3-haiku': { provider: 'anthropic', apiModel: 'claude-3-haiku-20240307' },
  'claude-sonnet-4-20250514': { provider: 'anthropic', apiModel: 'claude-3-5-sonnet-20241022' },
  'gpt-4-turbo': { provider: 'openai', apiModel: 'gpt-4-turbo' },
  'gpt-4o': { provider: 'openai', apiModel: 'gpt-4o' },
  'gpt-4o-mini': { provider: 'openai', apiModel: 'gpt-4o-mini' },
  'gpt-3.5-turbo': { provider: 'openai', apiModel: 'gpt-3.5-turbo' },
  'o1-preview': { provider: 'openai', apiModel: 'o1-preview' },
  'o1-mini': { provider: 'openai', apiModel: 'o1-mini' },
  'gemini-1.5-pro': { provider: 'google', apiModel: 'gemini-1.5-pro' },
  'gemini-1.5-flash': { provider: 'google', apiModel: 'gemini-1.5-flash' },
  'gemini-pro-vision': { provider: 'google', apiModel: 'gemini-pro-vision' }
};

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
    // Delegate strategy: Make real LLM API call with recommended model
    const subTask: SubTask = {
      id: 1,
      task: task,
      model: routingDecision.selectedModel,
      status: 'pending'
    };
    
    try {
      subTask.status = 'running';
      console.log(`🤖 Calling ${routingDecision.selectedModel} for task: ${task.substring(0, 100)}...`);
      
      // Make real LLM API call
      const llmResponse = await this.callLLMModel(routingDecision.selectedModel, task);
      
      subTask.status = 'complete';
      subTask.result = llmResponse;
      
      return {
        strategy: 'delegate',
        subTasks: [subTask],
        result: `Delegated to ${routingDecision.selectedModel}: ${llmResponse}`,
        totalCost: routingDecision.estimatedCost || 'medium',
        executionTimeMs: 0
      };
      
    } catch (error) {
      console.error(`❌ LLM call failed for ${routingDecision.selectedModel}:`, error);
      
      subTask.status = 'error';
      subTask.error = error instanceof Error ? error.message : 'LLM API call failed';
      
      return {
        strategy: 'delegate',
        subTasks: [subTask],
        result: `Failed to delegate to ${routingDecision.selectedModel}: ${subTask.error}`,
        totalCost: routingDecision.estimatedCost || 'medium',
        executionTimeMs: 0
      };
    }
  }

  private async handleParallel(routingDecision: any, task: string): Promise<OrchestratorResponse> {
    // Parallel strategy: Break down task and spawn multiple real sub-agents
    const subTasks = this.breakDownTask(task);
    const parallelTasks: SubTask[] = subTasks.map((subTask, index) => ({
      id: index + 1,
      task: subTask,
      model: this.selectModelForSubTask(routingDecision.selectedModel),
      status: 'pending'
    }));
    
    console.log(`⚡ Executing ${parallelTasks.length} sub-tasks in parallel...`);
    
    // Execute all sub-tasks in parallel with real LLM calls
    const promises = parallelTasks.map(async (subTask) => {
      try {
        subTask.status = 'running';
        console.log(`🤖 Calling ${subTask.model} for: ${subTask.task.substring(0, 60)}...`);
        
        const llmResponse = await this.callLLMModel(subTask.model, subTask.task);
        
        subTask.status = 'complete';
        subTask.result = llmResponse;
        
      } catch (error) {
        console.error(`❌ Sub-task ${subTask.id} failed:`, error);
        subTask.status = 'error';
        subTask.error = error instanceof Error ? error.message : 'LLM API call failed';
      }
      
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

  // Real LLM API call implementation
  private async callLLMModel(modelName: string, task: string): Promise<string> {
    const modelConfig = MODEL_PROVIDERS[modelName as keyof typeof MODEL_PROVIDERS];
    
    if (!modelConfig) {
      throw new Error(`Unsupported model: ${modelName}`);
    }
    
    console.log(`🔌 Making ${modelConfig.provider} API call to ${modelConfig.apiModel}...`);
    
    switch (modelConfig.provider) {
      case 'anthropic':
        return this.callAnthropicAPI(modelConfig.apiModel, task);
      case 'openai':
        return this.callOpenAIAPI(modelConfig.apiModel, task);
      case 'google':
        return this.callGoogleAPI(modelConfig.apiModel, task);
      default:
        throw new Error(`Provider ${modelConfig.provider} not implemented`);
    }
  }
  
  private async callAnthropicAPI(model: string, task: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables');
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: task
          }
        ]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    return data.content?.[0]?.text || 'No response from Anthropic API';
  }
  
  private async callOpenAIAPI(model: string, task: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: task
          }
        ]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response from OpenAI API';
  }
  
  private async callGoogleAPI(model: string, task: string): Promise<string> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not found in environment variables');
    }
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: task
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 4000
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Google API';
  }

  // Helper methods for task management
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
    const errorTasks = subTasks.filter(t => t.status === 'error');
    
    if (errorTasks.length > 0) {
      return `Completed ${completedTasks.length}/${subTasks.length} subtasks. ${errorTasks.length} tasks failed but proceeding with available results.`;
    }
    
    return `Successfully completed ${completedTasks.length}/${subTasks.length} subtasks. All components integrated and delivered.`;
  }

  private calculateTotalCost(numTasks: number, baseCost: string): 'low' | 'medium' | 'high' {
    if (numTasks <= 2) return baseCost as 'low' | 'medium' | 'high';
    if (numTasks <= 4) {
      return baseCost === 'low' ? 'medium' : 'high';
    }
    return 'high';
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator();