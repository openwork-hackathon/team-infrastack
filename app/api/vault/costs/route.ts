import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Cost log entry type
interface CostEntry {
  id: string;
  timestamp: string;
  agentId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
}

// In-memory fallback + file persistence
const DATA_DIR = path.join(process.cwd(), '.data');
const COSTS_FILE = path.join(DATA_DIR, 'costs.json');

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadCosts(): Promise<CostEntry[]> {
  try {
    await ensureDataDir();
    if (existsSync(COSTS_FILE)) {
      const data = await readFile(COSTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading costs:', err);
  }
  return [];
}

async function saveCosts(costs: CostEntry[]) {
  await ensureDataDir();
  await writeFile(COSTS_FILE, JSON.stringify(costs, null, 2));
}

// GET /api/vault/costs - Retrieve cost logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const provider = searchParams.get('provider');
    const since = searchParams.get('since'); // ISO timestamp
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    let costs = await loadCosts();

    // Filter by agentId
    if (agentId) {
      costs = costs.filter((c) => c.agentId === agentId);
    }

    // Filter by provider
    if (provider) {
      costs = costs.filter((c) => c.provider === provider);
    }

    // Filter by timestamp
    if (since) {
      const sinceDate = new Date(since);
      costs = costs.filter((c) => new Date(c.timestamp) >= sinceDate);
    }

    // Sort by timestamp descending (newest first)
    costs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    costs = costs.slice(0, limit);

    // Calculate totals
    const totals = costs.reduce(
      (acc, c) => ({
        totalCostUsd: acc.totalCostUsd + c.costUsd,
        totalInputTokens: acc.totalInputTokens + c.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + c.outputTokens,
        entryCount: acc.entryCount + 1,
      }),
      { totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0, entryCount: 0 }
    );

    return NextResponse.json({
      costs,
      totals,
      filters: { agentId, provider, since, limit },
    });
  } catch (error) {
    console.error('Costs GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve costs' }, { status: 500 });
  }
}

// POST /api/vault/costs - Log a new cost entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const required = ['agentId', 'provider', 'model', 'inputTokens', 'outputTokens', 'costUsd'];
    for (const field of required) {
      if (body[field] === undefined) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const entry: CostEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: body.agentId,
      provider: body.provider,
      model: body.model,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      costUsd: body.costUsd,
      metadata: body.metadata,
    };

    const costs = await loadCosts();
    costs.push(entry);
    await saveCosts(costs);

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    console.error('Costs POST error:', error);
    return NextResponse.json({ error: 'Failed to log cost' }, { status: 500 });
  }
}
