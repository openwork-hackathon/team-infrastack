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

const TECHNICAL_TERMS = [
  'api', 'database', 'sql', 'javascript', 'python', 'react', 'nodejs', 'docker', 
  'kubernetes', 'aws', 'cloud', 'microservice', 'authentication', 'encryption',
  'blockchain', 'ml', 'ai', 'neural', 'algorithm', 'json', 'rest', 'graphql'
];

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

// Model selection logic
function selectModel(
  complexity: number, 
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    maxLatency?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google';
  }
): { model: Model; reason: string } {
  let availableModels = [...MODEL_REGISTRY];
  
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
  let reason = '';
  
  for (const model of availableModels) {
    const complexityDiff = Math.abs(model.complexity - complexity);
    
    // Prefer models that match complexity closely
    if (complexityDiff < bestScore) {
      bestModel = model;
      bestScore = complexityDiff;
    }
  }
  
  // Generate reason for selection
  if (constraints?.preferredProvider && bestModel.provider === constraints.preferredProvider) {
    reason = `Selected ${bestModel.id} from preferred provider ${bestModel.provider} with complexity ${bestModel.complexity} matching analyzed complexity ${complexity}`;
  } else if (constraints?.maxCost) {
    reason = `Selected ${bestModel.id} as the best model within ${constraints.maxCost} cost constraint (complexity match: ${bestModel.complexity} vs ${complexity})`;
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
  selectedModel: string;
  reason: string;
  estimatedCost: 'low' | 'medium' | 'high';
  complexity: number;
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
    
    // Select the best model
    const { model, reason } = selectModel(complexity, body.constraints);
    
    // Build response
    const response: RouteResponse = {
      selectedModel: model.id,
      reason,
      estimatedCost: model.cost,
      complexity
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