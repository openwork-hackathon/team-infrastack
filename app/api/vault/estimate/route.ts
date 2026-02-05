import { NextRequest, NextResponse } from 'next/server';
import { loadJsonData, logAuditEntry } from '../utils';

// Model pricing in USD per 1M tokens
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude 4
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3-haiku-20240307': { input: 0.80, output: 4.00 },
  
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo-preview': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o1-preview': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  
  // Google
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  
  // Meta (via providers)
  'llama-3.1-70b': { input: 0.90, output: 0.90 },
  'llama-3.1-8b': { input: 0.20, output: 0.20 },
  
  // Mistral
  'mistral-large': { input: 4.00, output: 12.00 },
  'mistral-medium': { input: 2.70, output: 8.10 },
  'mistral-small': { input: 1.00, output: 3.00 },
  'codestral': { input: 1.00, output: 3.00 },
  
  // Default fallback
  'default': { input: 3.00, output: 15.00 },
};

interface CostEstimate {
  model: string;
  inputTokens: number;
  maxOutputTokens: number;
  inputCostCents: number;
  maxOutputCostCents: number;
  totalMinCents: number;
  totalMaxCents: number;
  pricing: { input: number; output: number };
  withinBudget?: boolean;
  budgetMessage?: string;
}

// Approximate token count (~4 chars per token for English)
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Get pricing for a model
function getPricing(model: string): { input: number; output: number } {
  // Direct match
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  
  // Partial match
  const normalizedModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalizedModel.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedModel)) {
      return pricing;
    }
  }
  
  // Check for model family
  if (normalizedModel.includes('opus')) return MODEL_PRICING['claude-opus-4-20250514'];
  if (normalizedModel.includes('sonnet')) return MODEL_PRICING['claude-sonnet-4-20250514'];
  if (normalizedModel.includes('haiku')) return MODEL_PRICING['claude-3-haiku-20240307'];
  if (normalizedModel.includes('gpt-4o-mini')) return MODEL_PRICING['gpt-4o-mini'];
  if (normalizedModel.includes('gpt-4o')) return MODEL_PRICING['gpt-4o'];
  if (normalizedModel.includes('gpt-4')) return MODEL_PRICING['gpt-4-turbo-preview'];
  if (normalizedModel.includes('gemini')) return MODEL_PRICING['gemini-1.5-flash'];
  if (normalizedModel.includes('llama')) return MODEL_PRICING['llama-3.1-70b'];
  if (normalizedModel.includes('mistral')) return MODEL_PRICING['mistral-small'];
  
  return MODEL_PRICING['default'];
}

// POST /api/vault/estimate - Pre-flight cost estimation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.prompt || !body.model) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: prompt, model' 
      }, { status: 400 });
    }

    const prompt = body.prompt;
    const model = body.model;
    const systemPrompt = body.systemPrompt || '';
    const maxOutputTokens = body.maxOutputTokens || 4096;
    const budgetCents = body.budgetCents; // Optional budget to check against

    // Count input tokens
    const inputText = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
    const inputTokens = countTokens(inputText);

    // Get pricing
    const pricing = getPricing(model);

    // Calculate costs in cents
    const inputCostCents = Math.ceil((inputTokens / 1_000_000) * pricing.input * 100 * 100) / 100;
    const maxOutputCostCents = Math.ceil((maxOutputTokens / 1_000_000) * pricing.output * 100 * 100) / 100;
    const totalMinCents = inputCostCents;
    const totalMaxCents = Math.ceil((inputCostCents + maxOutputCostCents) * 100) / 100;

    const estimate: CostEstimate = {
      model,
      inputTokens,
      maxOutputTokens,
      inputCostCents,
      maxOutputCostCents,
      totalMinCents,
      totalMaxCents,
      pricing,
    };

    // Check against budget if provided
    if (budgetCents !== undefined) {
      if (totalMaxCents <= budgetCents) {
        estimate.withinBudget = true;
        estimate.budgetMessage = `Within budget (max ${totalMaxCents}¢ ≤ ${budgetCents}¢)`;
      } else if (totalMinCents <= budgetCents) {
        estimate.withinBudget = true;
        estimate.budgetMessage = `May exceed budget (min ${totalMinCents}¢, max ${totalMaxCents}¢ vs ${budgetCents}¢)`;
      } else {
        estimate.withinBudget = false;
        estimate.budgetMessage = `Exceeds budget (min ${totalMinCents}¢ > ${budgetCents}¢)`;
      }
    }

    await logAuditEntry({
      action: 'cost_estimate',
      endpoint: '/api/vault/estimate',
      method: 'POST',
      requestBody: { model, inputTokens, maxOutputTokens },
      responseStatus: 200,
    });

    return NextResponse.json({ 
      success: true, 
      data: estimate,
      formatted: {
        inputCost: `$${(inputCostCents / 100).toFixed(4)}`,
        maxOutputCost: `$${(maxOutputCostCents / 100).toFixed(4)}`,
        totalMin: `$${(totalMinCents / 100).toFixed(4)}`,
        totalMax: `$${(totalMaxCents / 100).toFixed(4)}`,
      }
    });
  } catch (error) {
    console.error('Estimate POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to estimate cost' }, { status: 500 });
  }
}

// GET /api/vault/estimate/pricing - Get model pricing table
export async function GET(request: NextRequest) {
  try {
    const pricing = Object.entries(MODEL_PRICING)
      .filter(([key]) => key !== 'default')
      .map(([model, prices]) => ({
        model,
        inputPer1M: prices.input,
        outputPer1M: prices.output,
        inputPer1K: prices.input / 1000,
        outputPer1K: prices.output / 1000,
      }));

    await logAuditEntry({
      action: 'pricing_list',
      endpoint: '/api/vault/estimate',
      method: 'GET',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, data: pricing });
  } catch (error) {
    console.error('Estimate GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve pricing' }, { status: 500 });
  }
}
