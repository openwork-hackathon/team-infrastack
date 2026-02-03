import { NextRequest, NextResponse } from 'next/server';

// AgentVault - Cost Logging Endpoint
// GET /api/vault/costs - list logged costs
// POST /api/vault/costs - log a new cost entry

interface CostEntry {
  id: string;
  timestamp: string;
  model: string;
  provider: string;
  tokens: {
    input: number;
    output: number;
  };
  cost: {
    amount: number;
    currency: string;
  };
  task?: string;
  agentId?: string;
}

// In-memory store (for MVP - would be DB in production)
const costLog: CostEntry[] = [];

// Model pricing (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 1, output: 3 };
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');
  const limit = parseInt(searchParams.get('limit') || '100');
  const since = searchParams.get('since');

  let filtered = [...costLog];

  if (agentId) {
    filtered = filtered.filter(c => c.agentId === agentId);
  }

  if (since) {
    const sinceDate = new Date(since);
    filtered = filtered.filter(c => new Date(c.timestamp) >= sinceDate);
  }

  // Calculate aggregates
  const totalCost = filtered.reduce((sum, c) => sum + c.cost.amount, 0);
  const totalInputTokens = filtered.reduce((sum, c) => sum + c.tokens.input, 0);
  const totalOutputTokens = filtered.reduce((sum, c) => sum + c.tokens.output, 0);

  const byModel = filtered.reduce((acc, c) => {
    acc[c.model] = (acc[c.model] || 0) + c.cost.amount;
    return acc;
  }, {} as Record<string, number>);

  return NextResponse.json({
    entries: filtered.slice(-limit),
    summary: {
      totalCost: totalCost.toFixed(6),
      totalInputTokens,
      totalOutputTokens,
      entryCount: filtered.length,
      byModel,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { model, inputTokens, outputTokens, task, agentId } = body;

    if (!model || inputTokens === undefined || outputTokens === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: model, inputTokens, outputTokens' },
        { status: 400 }
      );
    }

    const provider = model.includes('claude') ? 'anthropic' 
      : model.includes('gpt') ? 'openai' 
      : model.includes('gemini') ? 'google' 
      : 'unknown';

    const cost = calculateCost(model, inputTokens, outputTokens);

    const entry: CostEntry = {
      id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      model,
      provider,
      tokens: {
        input: inputTokens,
        output: outputTokens,
      },
      cost: {
        amount: cost,
        currency: 'USD',
      },
      task,
      agentId,
    };

    costLog.push(entry);

    // Keep only last 10000 entries
    if (costLog.length > 10000) {
      costLog.shift();
    }

    return NextResponse.json({
      success: true,
      entry,
      message: `Logged cost: $${cost.toFixed(6)} for ${model}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body', details: String(error) },
      { status: 400 }
    );
  }
}
