import { NextRequest, NextResponse } from 'next/server';

// Model registry with 21 models across 6 providers
interface Model {
  id: string;
  complexity: number;
  cost: 'low' | 'medium' | 'high';
  provider: 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'cohere';
  specializations: Array<'code' | 'vision' | 'reasoning' | 'speed' | 'general'>;
  contextWindow: number; // in tokens
  description: string;
}

const MODEL_REGISTRY: Model[] = [
  // Anthropic Models (Claude 4 - latest)
  {
    id: 'claude-opus-4-20250514',
    complexity: 5,
    cost: 'high',
    provider: 'anthropic',
    specializations: ['reasoning', 'general'],
    contextWindow: 200000,
    description: 'Most capable Claude model for complex reasoning and analysis'
  },
  {
    id: 'claude-sonnet-4-20250514',
    complexity: 4,
    cost: 'medium',
    provider: 'anthropic',
    specializations: ['code', 'reasoning', 'general'],
    contextWindow: 200000,
    description: 'Excellent balance of capability and cost for coding tasks'
  },
  {
    id: 'claude-3-5-haiku-20241022',
    complexity: 2,
    cost: 'low',
    provider: 'anthropic',
    specializations: ['speed', 'general'],
    contextWindow: 200000,
    description: 'Fast and efficient for simple tasks'
  },
  
  // OpenAI Models
  {
    id: 'gpt-4-turbo-preview',
    complexity: 5,
    cost: 'high',
    provider: 'openai',
    specializations: ['reasoning', 'vision', 'general'],
    contextWindow: 128000,
    description: 'Advanced reasoning with vision capabilities'
  },
  {
    id: 'gpt-4o',
    complexity: 4,
    cost: 'high',
    provider: 'openai',
    specializations: ['general', 'vision'],
    contextWindow: 128000,
    description: 'Optimized GPT-4 with multimodal capabilities'
  },
  {
    id: 'gpt-4o-mini',
    complexity: 2,
    cost: 'low',
    provider: 'openai',
    specializations: ['speed', 'general'],
    contextWindow: 128000,
    description: 'Cost-effective version of GPT-4o'
  },
  {
    id: 'gpt-3.5-turbo',
    complexity: 3,
    cost: 'low',
    provider: 'openai',
    specializations: ['speed', 'general'],
    contextWindow: 16385,
    description: 'Fast and reliable for general tasks'
  },
  {
    id: 'o1',
    complexity: 5,
    cost: 'high',
    provider: 'openai',
    specializations: ['reasoning'],
    contextWindow: 200000,
    description: 'Advanced reasoning model for complex problem solving'
  },
  {
    id: 'o1-mini',
    complexity: 3,
    cost: 'medium',
    provider: 'openai',
    specializations: ['reasoning'],
    contextWindow: 128000,
    description: 'Efficient reasoning model for medium complexity tasks'
  },
  
  // Google Models
  {
    id: 'gemini-2.0-flash',
    complexity: 3,
    cost: 'low',
    provider: 'google',
    specializations: ['speed', 'general', 'vision'],
    contextWindow: 1000000,
    description: 'Latest fast Gemini with multimodal capabilities'
  },
  {
    id: 'gemini-1.5-pro',
    complexity: 4,
    cost: 'medium',
    provider: 'google',
    specializations: ['general', 'vision'],
    contextWindow: 2000000,
    description: 'High-capacity model with massive context window'
  },
  {
    id: 'gemini-1.5-flash',
    complexity: 2,
    cost: 'low',
    provider: 'google',
    specializations: ['speed', 'general'],
    contextWindow: 1000000,
    description: 'Fast model with large context window'
  },
  
  // Meta Models
  {
    id: 'llama-3.1-70b',
    complexity: 4,
    cost: 'medium',
    provider: 'meta',
    specializations: ['general', 'code'],
    contextWindow: 128000,
    description: 'Open-source model with strong performance'
  },
  {
    id: 'llama-3.1-8b',
    complexity: 2,
    cost: 'low',
    provider: 'meta',
    specializations: ['speed', 'general'],
    contextWindow: 128000,
    description: 'Efficient open-source model for basic tasks'
  },
  {
    id: 'code-llama-34b',
    complexity: 3,
    cost: 'medium',
    provider: 'meta',
    specializations: ['code'],
    contextWindow: 16384,
    description: 'Specialized for code generation and analysis'
  },
  
  // Mistral Models
  {
    id: 'mistral-large',
    complexity: 4,
    cost: 'high',
    provider: 'mistral',
    specializations: ['reasoning', 'general'],
    contextWindow: 32000,
    description: 'High-performance European model'
  },
  {
    id: 'mistral-medium',
    complexity: 3,
    cost: 'medium',
    provider: 'mistral',
    specializations: ['general'],
    contextWindow: 32000,
    description: 'Balanced performance and cost'
  },
  {
    id: 'mistral-small',
    complexity: 2,
    cost: 'low',
    provider: 'mistral',
    specializations: ['speed', 'general'],
    contextWindow: 32000,
    description: 'Fast and cost-effective'
  },
  {
    id: 'codestral',
    complexity: 3,
    cost: 'medium',
    provider: 'mistral',
    specializations: ['code'],
    contextWindow: 32000,
    description: 'Specialized coding model from Mistral'
  },
  
  // Cohere Models
  {
    id: 'command-r-plus',
    complexity: 4,
    cost: 'medium',
    provider: 'cohere',
    specializations: ['reasoning', 'general'],
    contextWindow: 128000,
    description: 'Advanced reasoning and generation capabilities'
  },
  {
    id: 'command-r',
    complexity: 3,
    cost: 'low',
    provider: 'cohere',
    specializations: ['general'],
    contextWindow: 128000,
    description: 'Reliable general-purpose model'
  }
];

// Keywords that indicate different complexity levels
const COMPLEXITY_KEYWORDS = {
  high: ['analyze', 'complex', 'detailed', 'comprehensive', 'research', 'architecture', 'algorithm', 'optimization', 'reasoning', 'theorem', 'proof', 'mathematical'],
  medium: ['code', 'implement', 'debug', 'review', 'design', 'plan', 'calculate', 'refactor', 'test', 'deploy'],
  low: ['simple', 'basic', 'quick', 'summarize', 'list', 'hello', 'what', 'how', 'translate', 'format']
};

// Task type detection keywords (as specified in requirements)
const TASK_TYPE_KEYWORDS = {
  execution: ['build', 'create', 'write', 'implement', 'fix', 'deploy', 'generate', 'make', 'develop'],
  research: ['find', 'search', 'compare', 'analyze', 'investigate', 'explore', 'discover', 'lookup'],
  question: ['what', 'why', 'how', 'explain', 'is it', 'tell me', 'describe', 'define'],
  creative: ['design', 'brainstorm', 'imagine', 'story', 'creative', 'artistic', 'innovative', 'invent']
};

// Specialized task detection keywords
const SPECIALIZATION_KEYWORDS = {
  code: ['code', 'programming', 'function', 'class', 'variable', 'algorithm', 'debug', 'refactor', 'api', 'database', 'sql', 'javascript', 'python', 'react', 'nodejs', 'git', 'repository'],
  vision: ['image', 'photo', 'picture', 'visual', 'analyze image', 'describe image', 'ocr', 'chart', 'graph', 'diagram', 'screenshot', 'drawing'],
  reasoning: ['solve', 'logic', 'reasoning', 'mathematics', 'calculation', 'proof', 'theorem', 'problem solving', 'step by step', 'chain of thought'],
  speed: ['quick', 'fast', 'simple', 'brief', 'short', 'summarize', 'list'],
  general: ['general', 'overall', 'broad', 'comprehensive']
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

// Specialization analyzer function
function analyzeSpecializations(prompt: string): {
  required: Array<'code' | 'vision' | 'reasoning' | 'speed' | 'general'>;
  scores: Record<string, number>;
} {
  const lowercasePrompt = prompt.toLowerCase();
  const scores: Record<string, number> = {
    code: 0,
    vision: 0,
    reasoning: 0,
    speed: 0,
    general: 0
  };
  
  // Count keywords for each specialization
  Object.entries(SPECIALIZATION_KEYWORDS).forEach(([spec, keywords]) => {
    keywords.forEach(keyword => {
      if (lowercasePrompt.includes(keyword)) {
        scores[spec] += 1;
      }
    });
  });
  
  // Additional heuristics
  if (lowercasePrompt.includes('image') || lowercasePrompt.includes('analyze this') || lowercasePrompt.includes('what do you see')) {
    scores.vision += 2;
  }
  
  if (lowercasePrompt.includes('def ') || lowercasePrompt.includes('function') || lowercasePrompt.includes('```')) {
    scores.code += 2;
  }
  
  if (lowercasePrompt.includes('quick') || lowercasePrompt.includes('fast') || prompt.length < 50) {
    scores.speed += 2;
  }
  
  if (lowercasePrompt.includes('logic') || lowercasePrompt.includes('step by step') || lowercasePrompt.includes('reasoning')) {
    scores.reasoning += 2;
  }
  
  // Determine required specializations (threshold-based)
  const required: Array<'code' | 'vision' | 'reasoning' | 'speed' | 'general'> = [];
  
  Object.entries(scores).forEach(([spec, score]) => {
    if (score >= 2) { // Threshold for requiring specialization
      required.push(spec as 'code' | 'vision' | 'reasoning' | 'speed' | 'general');
    }
  });
  
  // Default to general if no specialization detected
  if (required.length === 0) {
    required.push('general');
  }
  
  return { required, scores };
}

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
  const primary = (Object.keys(scores).find(type => scores[type] === maxScore) || 'question') as 'execution' | 'research' | 'question' | 'creative';
  
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
  requiredSpecializations: Array<'code' | 'vision' | 'reasoning' | 'speed' | 'general'>,
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'cohere';
  }
): { model: Model; reason: string; specializationMatch: boolean } {
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
  
  // Find models that match required specializations
  const specializedModels = availableModels.filter(model =>
    requiredSpecializations.some(spec => model.specializations.includes(spec))
  );
  
  // Prefer specialized models if available, otherwise use general models
  const candidateModels = specializedModels.length > 0 ? specializedModels : availableModels;
  const specializationMatch = specializedModels.length > 0;
  
  // Find the best model based on complexity and specialization match
  let bestModel = candidateModels[0];
  let bestScore = Infinity;
  
  for (const model of candidateModels) {
    let score = Math.abs(model.complexity - complexity);
    
    // Bonus for specialization matches
    const specializationMatches = requiredSpecializations.filter(spec => 
      model.specializations.includes(spec)
    ).length;
    score -= specializationMatches * 0.5;
    
    // Prefer models that match complexity and specializations
    if (score < bestScore) {
      bestModel = model;
      bestScore = score;
    }
  }
  
  // Generate comprehensive reason for selection
  let reason = '';
  const matchedSpecs = requiredSpecializations.filter(spec => 
    bestModel.specializations.includes(spec)
  );
  
  if (matchedSpecs.length > 0) {
    reason = `Selected ${bestModel.id} - specialized for ${matchedSpecs.join(', ')}`;
  } else {
    reason = `Selected ${bestModel.id} - general purpose model`;
  }
  
  if (strategy === 'escalate') {
    reason += ' (escalation strategy)';
  } else if (strategy === 'delegate' || strategy === 'parallel') {
    reason += ` (${strategy} strategy, cost-optimized)`;
  }
  
  if (constraints?.preferredProvider && bestModel.provider === constraints.preferredProvider) {
    reason += ` from preferred provider ${bestModel.provider}`;
  }
  
  reason += ` - complexity ${bestModel.complexity}/${complexity} match`;
  
  return { model: bestModel, reason, specializationMatch };
}

// Request/Response interfaces
interface RouteRequest {
  prompt: string;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'cohere';
  };
}

interface RouteResponse {
  // Core routing decision
  strategy: 'direct' | 'delegate' | 'parallel' | 'escalate';
  strategyReason: string;
  selectedModel: string;
  modelReason: string;
  
  // Model characteristics
  estimatedCost: 'low' | 'medium' | 'high';
  complexity: number;
  provider: string;
  
  // Specialized analysis
  requiredSpecializations: Array<'code' | 'vision' | 'reasoning' | 'speed' | 'general'>;
  specializationMatch: boolean;
  parallelizable: boolean;
  
  // Cost analysis
  tokenEstimate: {
    direct: number;
    delegated?: number;
  };
  contextWindow: number;
  
  // Task analysis details
  taskType: {
    primary: 'execution' | 'research' | 'question' | 'creative';
    confidence: number;
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
    
    // Analyze required specializations
    const specializationAnalysis = analyzeSpecializations(body.prompt);
    
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
    
    // Select the best model based on strategy, complexity, and specializations
    const { model, reason: modelReason, specializationMatch } = selectModel(
      complexity,
      strategyAnalysis.strategy,
      specializationAnalysis.required,
      body.constraints
    );
    
    // Build response
    const response: RouteResponse = {
      // Core routing decision
      strategy: strategyAnalysis.strategy,
      strategyReason: strategyAnalysis.reason,
      selectedModel: model.id,
      modelReason,
      
      // Model characteristics
      estimatedCost: model.cost,
      complexity,
      provider: model.provider,
      
      // Specialized analysis
      requiredSpecializations: specializationAnalysis.required,
      specializationMatch,
      parallelizable: parallelizationAnalysis.parallelizable,
      
      // Cost analysis
      tokenEstimate: finalTokenEstimate,
      contextWindow: model.contextWindow,
      
      // Task analysis details
      taskType: {
        primary: taskTypeAnalysis.primary,
        confidence: taskTypeAnalysis.confidence
      },
      
      // Backward compatibility
      reason: modelReason
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    // SECURITY: Sanitize error message before logging to prevent key leakage
    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedError = errorMessage.replace(/sk-[a-zA-Z0-9_-]+/g, '[API_KEY_REDACTED]')
                                       .replace(/api_[a-zA-Z0-9_-]+/g, '[API_KEY_REDACTED]')
                                       .replace(/[A-Z0-9_-]{39}/g, '[API_KEY_REDACTED]');
    console.error('Error in route API:', sanitizedError);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint for health check and model registry info
export async function GET(): Promise<NextResponse<{ 
  status: string; 
  totalModels: number;
  providers: string[];
  models: Array<{
    id: string;
    provider: string;
    complexity: number;
    cost: string;
    specializations: string[];
  }>;
}>> {
  const providers = [...new Set(MODEL_REGISTRY.map(m => m.provider))];
  
  return NextResponse.json({
    status: 'AgentRouter API is running with expanded model registry',
    totalModels: MODEL_REGISTRY.length,
    providers,
    models: MODEL_REGISTRY.map(m => ({
      id: m.id,
      provider: m.provider,
      complexity: m.complexity,
      cost: m.cost,
      specializations: m.specializations
    }))
  });
}