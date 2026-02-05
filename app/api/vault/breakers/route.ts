import { NextRequest, NextResponse } from 'next/server';
import { loadJsonData, saveJsonData, logAuditEntry } from '../utils';

const BREAKERS_FILE = 'breakers.json';

export interface CircuitBreaker {
  id: string;
  name: string;
  type: 'global' | 'envelope' | 'agent' | 'model';
  targetId?: string;        // For non-global: envelope/agent/model ID
  limit: number;            // In USD cents
  currentSpend: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'total';
  periodStart: string;
  action: 'block' | 'warn' | 'notify';
  triggered: boolean;
  triggeredAt?: string;
  enabled: boolean;
  createdAt: string;
}

// Initialize with default breakers
async function initializeBreakers(): Promise<CircuitBreaker[]> {
  let breakers = await loadJsonData<CircuitBreaker>(BREAKERS_FILE);
  if (breakers.length === 0) {
    breakers = [
      {
        id: 'global-daily',
        name: 'Daily Global Limit',
        type: 'global',
        limit: 5000, // $50/day
        currentSpend: 1250,
        period: 'daily',
        periodStart: new Date().toISOString(),
        action: 'block',
        triggered: false,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'hourly-sanity',
        name: 'Hourly Sanity Check',
        type: 'global',
        limit: 1000, // $10/hour
        currentSpend: 150,
        period: 'hourly',
        periodStart: new Date().toISOString(),
        action: 'warn',
        triggered: false,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'opus-daily',
        name: 'Opus Daily Limit',
        type: 'model',
        targetId: 'claude-opus-4',
        limit: 2000, // $20/day for expensive model
        currentSpend: 500,
        period: 'daily',
        periodStart: new Date().toISOString(),
        action: 'block',
        triggered: false,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ];
    await saveJsonData(BREAKERS_FILE, breakers);
  }
  return breakers;
}

function checkPeriodReset(breaker: CircuitBreaker): CircuitBreaker {
  if (breaker.period === 'total') return breaker;
  
  const now = new Date();
  const periodStart = new Date(breaker.periodStart);
  let shouldReset = false;

  switch (breaker.period) {
    case 'hourly':
      shouldReset = now.getTime() - periodStart.getTime() >= 60 * 60 * 1000;
      break;
    case 'daily':
      shouldReset = now.toDateString() !== periodStart.toDateString();
      break;
    case 'weekly':
      shouldReset = now.getTime() - periodStart.getTime() >= 7 * 24 * 60 * 60 * 1000;
      break;
    case 'monthly':
      shouldReset = now.getMonth() !== periodStart.getMonth() ||
                    now.getFullYear() !== periodStart.getFullYear();
      break;
  }

  if (shouldReset) {
    return {
      ...breaker,
      currentSpend: 0,
      triggered: false,
      triggeredAt: undefined,
      periodStart: now.toISOString(),
    };
  }
  
  return breaker;
}

// GET /api/vault/breakers
export async function GET(request: NextRequest) {
  try {
    let breakers = await initializeBreakers();
    
    // Check for period resets
    breakers = breakers.map(checkPeriodReset);
    await saveJsonData(BREAKERS_FILE, breakers);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const triggered = searchParams.get('triggered');

    if (type) {
      breakers = breakers.filter(b => b.type === type);
    }
    if (triggered === 'true') {
      breakers = breakers.filter(b => b.triggered);
    }

    const summary = {
      totalBreakers: breakers.length,
      enabledCount: breakers.filter(b => b.enabled).length,
      triggeredCount: breakers.filter(b => b.triggered).length,
      blockingCount: breakers.filter(b => b.triggered && b.action === 'block').length,
    };

    await logAuditEntry({
      action: 'breaker_list',
      endpoint: '/api/vault/breakers',
      method: 'GET',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, data: breakers, summary });
  } catch (error) {
    console.error('Breakers GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve circuit breakers' }, { status: 500 });
  }
}

// POST /api/vault/breakers - Create new breaker
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.type || !body.limit || !body.period) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: name, type, limit, period' 
      }, { status: 400 });
    }

    const breakers = await initializeBreakers();

    const newBreaker: CircuitBreaker = {
      id: `breaker-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name,
      type: body.type,
      targetId: body.targetId,
      limit: body.limit,
      currentSpend: 0,
      period: body.period,
      periodStart: new Date().toISOString(),
      action: body.action || 'block',
      triggered: false,
      enabled: body.enabled ?? true,
      createdAt: new Date().toISOString(),
    };

    breakers.push(newBreaker);
    await saveJsonData(BREAKERS_FILE, breakers);

    await logAuditEntry({
      action: 'breaker_create',
      endpoint: '/api/vault/breakers',
      method: 'POST',
      requestBody: body,
      responseStatus: 201,
    });

    return NextResponse.json({ success: true, data: newBreaker }, { status: 201 });
  } catch (error) {
    console.error('Breakers POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create circuit breaker' }, { status: 500 });
  }
}

// PUT /api/vault/breakers?id=xxx - Update or reset breaker
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const breakerId = searchParams.get('id');
    const action = searchParams.get('action'); // 'reset' to clear triggered state

    if (!breakerId) {
      return NextResponse.json({ success: false, error: 'Missing breaker ID' }, { status: 400 });
    }

    const breakers = await initializeBreakers();
    const index = breakers.findIndex(b => b.id === breakerId);

    if (index === -1) {
      return NextResponse.json({ success: false, error: 'Circuit breaker not found' }, { status: 404 });
    }

    let updated = breakers[index];

    if (action === 'reset') {
      // Reset the breaker
      updated = {
        ...updated,
        currentSpend: 0,
        triggered: false,
        triggeredAt: undefined,
        periodStart: new Date().toISOString(),
      };
    } else {
      // Normal update
      const body = await request.json();
      updated = {
        ...updated,
        ...body,
      };
    }

    breakers[index] = updated;
    await saveJsonData(BREAKERS_FILE, breakers);

    await logAuditEntry({
      action: action === 'reset' ? 'breaker_reset' : 'breaker_update',
      endpoint: '/api/vault/breakers',
      method: 'PUT',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Breakers PUT error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update circuit breaker' }, { status: 500 });
  }
}

// DELETE /api/vault/breakers?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const breakerId = searchParams.get('id');

    if (!breakerId) {
      return NextResponse.json({ success: false, error: 'Missing breaker ID' }, { status: 400 });
    }

    let breakers = await initializeBreakers();
    const initialLength = breakers.length;
    breakers = breakers.filter(b => b.id !== breakerId);

    if (breakers.length === initialLength) {
      return NextResponse.json({ success: false, error: 'Circuit breaker not found' }, { status: 404 });
    }

    await saveJsonData(BREAKERS_FILE, breakers);

    await logAuditEntry({
      action: 'breaker_delete',
      endpoint: '/api/vault/breakers',
      method: 'DELETE',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, message: 'Circuit breaker deleted' });
  } catch (error) {
    console.error('Breakers DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete circuit breaker' }, { status: 500 });
  }
}
