import { NextRequest, NextResponse } from 'next/server';

// Model registry with hardcoded models for MVP
interface Model {
  id: string;
  complexity: number;
  cost: 'low' | 'medium' | 'high';
  provider: 'anthropic' | 'openai' | 'google';
}

const MODEL_REGISTRY: Model[] = [
  {
    id: 'claude-opus-4',
    complexity: 5,
    cost: 'high',
    provider: 'anthropic'
  },
  {
    id: 'claude-sonnet-4',
    complexity: 3,
    cost: 'medium',
    provider: 'anthropic'
  },
  {
    id: 'gpt-4o',
    complexity: 4,
    cost: 'high',
    provider: 'openai'
  },
  {
    id: 'gpt-4o-mini',
    complexity: 2,
    cost: 'low',
    provider: 'openai'
  },
  {
    id: 'gemini-2.0-flash',
    complexity: 2,
    cost: 'low',
    provider: 'google'
  }
];

// Keywords that indicate different complexity levels
const COMPLEXITY_KEYWORDS = {
  high: ['analyze', 'complex', 'detailed', 'comprehensive', 'research', 'architecture', 'algorithm', 'optimization'],
  medium: ['code', 'implement', 'debug', 'review', 'design', 'plan', 'calculate'],
  low: ['simple', 'basic', 'quick', 'summarize', 'list', 'hello', 'what', 'how']
};

// Task type detection keywords
const TASK_TYPE_KEYWORDS = {
  execution: ['build', 'create', 'write', 'implement', 'fix', 'deploy', 'develop', 'code', 'generate', 'make'],
  research: ['find', 'search', 'compare', 'analyze', 'investigate', 'study', 'explore', 'gather', 'lookup'],
  question: ['what', 'why', 'how', 'explain', 'is it', 'does', 'can', 'will', 'should', 'tell me'],
  creative: ['design', 'brainstorm', 'imagine', 'story', 'creative', 'invent', 'compose', 'draft']
};

// Parallelization indicators
const PARALLEL_INDICATORS = [
  'multiple', 'several', 'various', 'different', 'compare', 'contrast',
  'list of', 'many', 'all of', 'each of', 'alternatives', 'options'
];

const TECHNICAL_TERMS = [
  'api', 'database', 'sql', 'javascript', 'python', 'react', 'nodejs', 'docker', 
  'kubernetes', 'aws', 'cloud', 'microservice', 'authentication', 'encryption',
  'blockchain', 'ml', 'ai', 'neural', 'algorithm', 'json', 'rest', 'graphql'
];

// Task type analyzer function
function analyzeTaskType(prompt: string): {
  primary: 'execution' | 'research' | 'question' | 'creative';
  confidence: number;
  scores: Record<string, number>;
} {
  const lowercasePrompt = prompt.toLowerCase();
  const scores: Record<string, number> = {
    execution: 0,
    research: 0,
    question: 0,
    creative: 0
  };
  
  // Count keywords for each task type
  Object.entries(TASK_TYPE_KEYWORDS).forEach(([type, keywords]) => {
    keywords.forEach(keyword => {
      if (lowercasePrompt.includes(keyword)) {
        scores[type] += 1;
      }
    });
  });
  
  // Additional heuristics
  if (lowercasePrompt.includes('?')) scores.question += 2;
  if (lowercasePrompt.startsWith('build') || lowercasePrompt.startsWith('create')) scores.execution += 2;
  if (lowercasePrompt.includes('research') || lowercasePrompt.includes('find out')) scores.research += 2;
  if (lowercasePrompt.includes('creative') || lowercasePrompt.includes('innovative')) scores.creative += 2;
  
  // Find the highest scoring type
  const maxScore = Math.max(...Object.values(scores));
  const primary = Object.keys(scores).find(type => scores[type] === maxScore) as keyof typeof scores;
  
  // Calculate confidence (0-1)
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.25; // Default low confidence
  
  return {
    primary,
    confidence,
    scores
  };
}

// Complexity analyzer function
function analyzeComplexity(prompt: string): number {
  const lowercasePrompt = prompt.toLowerCase();
  let complexityScore = 1; // Base score
  
  // Length factor (longer prompts tend to be more complex)
  if (prompt.length > 500) {
    complexityScore += 2;
  } else if (prompt.length > 200) {
    complexityScore += 1;
  } else if (prompt.length > 100) {
    complexityScore += 0.5;
  }
  
  // Keyword analysis
  const highKeywords = COMPLEXITY_KEYWORDS.high.filter(keyword => 
    lowercasePrompt.includes(keyword)
  ).length;
  
  const mediumKeywords = COMPLEXITY_KEYWORDS.medium.filter(keyword => 
    lowercasePrompt.includes(keyword)
  ).length;
  
  const lowKeywords = COMPLEXITY_KEYWORDS.low.filter(keyword => 
    lowercasePrompt.includes(keyword)
  ).length;
  
  // Technical terms detection
  const technicalTermsCount = TECHNICAL_TERMS.filter(term => 
    lowercasePrompt.includes(term)
  ).length;
  
  // Adjust score based on keywords
  complexityScore += highKeywords * 0.8;
  complexityScore += mediumKeywords * 0.4;
  complexityScore -= lowKeywords * 0.2; // Simple keywords reduce complexity
  complexityScore += technicalTermsCount * 0.3;
  
  // Ensure score is between 1 and 5
  return Math.max(1, Math.min(5, Math.round(complexityScore)));
}

// Parallelization analyzer function
function analyzeParallelization(prompt: string, taskType: string): {
  parallelizable: boolean;
  reason: string;
} {
  const lowercasePrompt = prompt.toLowerCase();
  
  // Check for parallelization indicators
  const hasParallelIndicators = PARALLEL_INDICATORS.some(indicator =>
    lowercasePrompt.includes(indicator)
  );
  
  // Research tasks with multiple aspects are often parallelizable
  const isResearchTask = taskType === 'research';
  const hasMultipleAspects = hasParallelIndicators || 
    lowercasePrompt.includes('and') || 
    lowercasePrompt.includes('vs') ||
    lowercasePrompt.includes('versus');
  
  let parallelizable = false;
  let reason = '';
  
  if (isResearchTask && hasMultipleAspects) {
    parallelizable = true;
    reason = 'Research task with multiple aspects can be split into parallel sub-agents';
  } else if (hasParallelIndicators && prompt.length > 100) {
    parallelizable = true;
    reason = 'Task contains multiple items/comparisons that can be processed in parallel';
  } else if (taskType === 'creative' && hasMultipleAspects) {
    parallelizable = true;
    reason = 'Creative task with multiple components can benefit from parallel generation';
  } else {
    reason = 'Task is better handled as a single coherent response';
  }
  
  return { parallelizable, reason };
}

// Token cost estimation
function estimateTokens(prompt: string, strategy: string): {
  direct: number;
  delegated?: number;
} {
  const basePromptTokens = Math.ceil(prompt.length / 4); // Rough estimation: 4 chars per token
  const responseTokens = {
    simple: 200,
    medium: 500,
    complex: 800,
    detailed: 1200
  };
  
  let directCost = basePromptTokens;
  
  // Estimate response tokens based on complexity
  if (prompt.length > 500) {
    directCost += responseTokens.detailed;
  } else if (prompt.length > 200) {
    directCost += responseTokens.complex;
  } else if (prompt.length > 100) {
    directCost += responseTokens.medium;
  } else {
    directCost += responseTokens.simple;
  }
  
  const result: { direct: number; delegated?: number } = { direct: directCost };
  
  if (strategy === 'delegate' || strategy === 'parallel') {
    // Sub-agent overhead: spawn message (~200 tokens) + task completion
    result.delegated = 200 + directCost * 0.8; // Delegated task might be more efficient
  }
  
  return result;
}

// Strategy analyzer function
function analyzeStrategy(
  prompt: string,
  taskType: { primary: string; confidence: number },
  complexity: number,
  parallelization: { parallelizable: boolean },
  tokenEstimate: { direct: number; delegated?: number }
): {
  strategy: 'direct' | 'delegate' | 'parallel' | 'escalate';
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
} {
  const lowercasePrompt = prompt.toLowerCase();
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  
  // Risk assessment
  const highRiskIndicators = [
    'production', 'deploy', 'delete', 'critical', 'important', 'urgent',
    'financial', 'security', 'privacy', 'legal', 'compliance'
  ];
  
  const hasHighRiskTerms = highRiskIndicators.some(term => lowercasePrompt.includes(term));
  
  if (hasHighRiskTerms || complexity >= 4) {
    riskLevel = 'high';
  } else if (complexity >= 3 || taskType.primary === 'execution') {
    riskLevel = 'medium';
  }
  
  // Strategy decision logic
  
  // ESCALATE: High complexity, high risk, or complex reasoning tasks
  if (complexity >= 4 && riskLevel === 'high') {
    return {
      strategy: 'escalate',
      reason: 'High complexity task with high risk requires expensive model with advanced reasoning',
      riskLevel
    };
  }
  
  if (complexity === 5 || lowercasePrompt.includes('complex reasoning') || lowercasePrompt.includes('critical decision')) {
    return {
      strategy: 'escalate',
      reason: 'Maximum complexity task requires most capable model',
      riskLevel
    };
  }
  
  // PARALLEL: Research tasks with multiple aspects that can be parallelized
  if (parallelization.parallelizable && taskType.primary === 'research') {
    return {
      strategy: 'parallel',
      reason: 'Research task with multiple aspects benefits from parallel processing',
      riskLevel
    };
  }
  
  if (parallelization.parallelizable && complexity >= 3) {
    return {
      strategy: 'parallel',
      reason: 'Complex task with multiple components can be efficiently parallelized',
      riskLevel
    };
  }
  
  // DELEGATE: Execution tasks that don't require human oversight
  if (taskType.primary === 'execution' && riskLevel !== 'high' && complexity <= 3) {
    const costSavings = tokenEstimate.delegated && tokenEstimate.direct > tokenEstimate.delegated;
    return {
      strategy: 'delegate',
      reason: `Execution task can be handled by cheaper sub-agent${costSavings ? ' with token cost savings' : ''}`,
      riskLevel
    };
  }
  
  // DELEGATE: Code generation and implementation tasks
  if (lowercasePrompt.includes('code') || lowercasePrompt.includes('implement') || 
      lowercasePrompt.includes('build') && complexity <= 3) {
    return {
      strategy: 'delegate',
      reason: 'Code generation task suitable for sub-agent delegation',
      riskLevel
    };
  }
  
  // DIRECT: Simple questions, low complexity, or when delegation overhead isn't worth it
  if (taskType.primary === 'question' && complexity <= 2) {
    return {
      strategy: 'direct',
      reason: 'Simple question can be answered directly without delegation overhead',
      riskLevel
    };
  }
  
  if (tokenEstimate.direct <= 500) {
    return {
      strategy: 'direct',
      reason: 'Low token cost makes direct response more efficient than delegation',
      riskLevel
    };
  }
  
  // Default to direct for medium complexity tasks
  return {
    strategy: 'direct',
    reason: 'Medium complexity task suitable for direct response',
    riskLevel
  };
}

// Model selection logic
function selectModel(
  complexity: number, 
  strategy: string,
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google';
  }
): { model: Model; reason: string } {
  let availableModels = [...MODEL_REGISTRY];
  
  // Strategy-specific model preferences
  if (strategy === 'escalate') {
    // For escalation, prefer highest complexity models
    availableModels = availableModels.filter(model => model.complexity >= 4);
  } else if (strategy === 'delegate' || strategy === 'parallel') {
    // For delegation, prefer cost-effective models
    availableModels = availableModels.filter(model => model.cost !== 'high');
  }
  
  // Filter by cost constraint
  if (constraints?.maxCost) {
    const costOrder = ['low', 'medium', 'high'];
    const maxCostIndex = costOrder.indexOf(constraints.maxCost);
    availableModels = availableModels.filter(model => 
      costOrder.indexOf(model.cost) <= maxCostIndex
    );
  }
  
  // Prefer models from preferred provider
  if (constraints?.preferredProvider) {
    const preferredModels = availableModels.filter(model => 
      model.provider === constraints.preferredProvider
    );
    if (preferredModels.length > 0) {
      availableModels = preferredModels;
    }
  }
  
  // Find the best model based on complexity requirements
  let bestModel = availableModels[0];
  let bestScore = Infinity;
  
  for (const model of availableModels) {
    const complexityDiff = Math.abs(model.complexity - complexity);
    
    // Prefer models that match complexity closely
    if (complexityDiff < bestScore) {
      bestModel = model;
      bestScore = complexityDiff;
    }
  }
  
  // Generate reason for selection
  let reason = '';
  if (strategy === 'escalate') {
    reason = `Selected high-capability ${bestModel.id} for escalation strategy`;
  } else if (strategy === 'delegate' || strategy === 'parallel') {
    reason = `Selected cost-effective ${bestModel.id} for ${strategy} strategy`;
  } else if (constraints?.preferredProvider && bestModel.provider === constraints.preferredProvider) {
    reason = `Selected ${bestModel.id} from preferred provider ${bestModel.provider}`;
  } else {
    reason = `Selected ${bestModel.id} as optimal match for complexity level ${complexity}`;
  }
  
  return { model: bestModel, reason };
}

// Request/Response interfaces
interface RouteRequest {
  prompt: string;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google';
  };
}

interface RouteResponse {
  // New strategy fields
  strategy: 'direct' | 'delegate' | 'parallel' | 'escalate';
  strategyReason: string;
  selectedModel: string;
  modelReason: string;
  estimatedCost: 'low' | 'medium' | 'high';
  complexity: number;
  parallelizable: boolean;
  tokenEstimate: {
    direct: number;
    delegated?: number;
  };
  
  // Backward compatibility - keep existing fields
  reason: string; // Alias for modelReason for backward compatibility
}

// POST endpoint
export async function POST(request: NextRequest): Promise<NextResponse<RouteResponse | { error: string }>> {
  try {
    const body: RouteRequest = await request.json();
    
    // Validate required fields
    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt field' },
        { status: 400 }
      );
    }
    
    // Analyze prompt complexity
    const complexity = analyzeComplexity(body.prompt);
    
    // Analyze task type
    const taskTypeAnalysis = analyzeTaskType(body.prompt);
    
    // Analyze parallelization potential
    const parallelizationAnalysis = analyzeParallelization(body.prompt, taskTypeAnalysis.primary);
    
    // Estimate token costs
    const tokenEstimate = estimateTokens(body.prompt, 'direct'); // Initial estimate
    
    // Analyze execution strategy
    const strategyAnalysis = analyzeStrategy(
      body.prompt,
      taskTypeAnalysis,
      complexity,
      parallelizationAnalysis,
      tokenEstimate
    );
    
    // Update token estimate with final strategy
    const finalTokenEstimate = estimateTokens(body.prompt, strategyAnalysis.strategy);
    
    // Select the best model based on strategy and complexity
    const { model, reason: modelReason } = selectModel(
      complexity,
      strategyAnalysis.strategy,
      body.constraints
    );
    
    // Build response
    const response: RouteResponse = {
      strategy: strategyAnalysis.strategy,
      strategyReason: strategyAnalysis.reason,
      selectedModel: model.id,
      modelReason,
      estimatedCost: model.cost,
      complexity,
      parallelizable: parallelizationAnalysis.parallelizable,
      tokenEstimate: finalTokenEstimate,
      
      // Backward compatibility
      reason: modelReason
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error in route API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Optional: Add GET endpoint for health check
export async function GET(): Promise<NextResponse<{ status: string; models: string[] }>> {
  return NextResponse.json({
    status: 'AgentRouter API is running',
    models: MODEL_REGISTRY.map(m => m.id)
  });
}