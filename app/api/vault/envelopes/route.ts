import { NextRequest, NextResponse } from 'next/server';
import { loadJsonData, saveJsonData, logAuditEntry } from '../utils';

const ENVELOPES_FILE = 'envelopes.json';

export interface Envelope {
  id: string;
  name: string;
  limit: number;           // In USD cents
  spent: number;
  reserved: number;
  available: number;
  period: 'daily' | 'weekly' | 'monthly' | 'total';
  periodStart: string;
  hardLimit: boolean;      // If true, blocks spending when exceeded
  enabled: boolean;
  agentId?: string;        // Optional: limit to specific agent
  taskType?: string;       // Optional: limit to task type
  createdAt: string;
}

// Initialize with default envelopes
async function initializeEnvelopes(): Promise<Envelope[]> {
  let envelopes = await loadJsonData<Envelope>(ENVELOPES_FILE);
  if (envelopes.length === 0) {
    envelopes = [
      {
        id: 'global-daily',
        name: 'Global Daily Budget',
        limit: 5000, // $50
        spent: 1250,
        reserved: 0,
        available: 3750,
        period: 'daily',
        periodStart: new Date().toISOString(),
        hardLimit: true,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'research-tasks',
        name: 'Research Tasks',
        limit: 2000, // $20
        spent: 450,
        reserved: 100,
        available: 1450,
        period: 'weekly',
        periodStart: new Date().toISOString(),
        hardLimit: false,
        enabled: true,
        taskType: 'research',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'code-tasks',
        name: 'Code Generation',
        limit: 3000, // $30
        spent: 800,
        reserved: 200,
        available: 2000,
        period: 'weekly',
        periodStart: new Date().toISOString(),
        hardLimit: true,
        enabled: true,
        taskType: 'code',
        createdAt: new Date().toISOString(),
      },
    ];
    await saveJsonData(ENVELOPES_FILE, envelopes);
  }
  return envelopes;
}

function checkPeriodReset(envelope: Envelope): Envelope {
  if (envelope.period === 'total') return envelope;
  
  const now = new Date();
  const periodStart = new Date(envelope.periodStart);
  let shouldReset = false;

  switch (envelope.period) {
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
      ...envelope,
      spent: 0,
      reserved: 0,
      available: envelope.limit,
      periodStart: now.toISOString(),
    };
  }
  
  return envelope;
}

// GET /api/vault/envelopes
export async function GET(request: NextRequest) {
  try {
    let envelopes = await initializeEnvelopes();
    
    // Check for period resets
    envelopes = envelopes.map(checkPeriodReset);
    await saveJsonData(ENVELOPES_FILE, envelopes);

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const taskType = searchParams.get('taskType');

    if (agentId) {
      envelopes = envelopes.filter(e => !e.agentId || e.agentId === agentId);
    }
    if (taskType) {
      envelopes = envelopes.filter(e => !e.taskType || e.taskType === taskType);
    }

    const summary = {
      totalLimit: envelopes.reduce((sum, e) => sum + e.limit, 0),
      totalSpent: envelopes.reduce((sum, e) => sum + e.spent, 0),
      totalReserved: envelopes.reduce((sum, e) => sum + e.reserved, 0),
      totalAvailable: envelopes.reduce((sum, e) => sum + e.available, 0),
      blockedCount: envelopes.filter(e => e.hardLimit && e.available <= 0).length,
    };

    await logAuditEntry({
      action: 'envelope_list',
      endpoint: '/api/vault/envelopes',
      method: 'GET',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, data: envelopes, summary });
  } catch (error) {
    console.error('Envelopes GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve envelopes' }, { status: 500 });
  }
}

// POST /api/vault/envelopes - Create new envelope
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.limit) {
      return NextResponse.json({ success: false, error: 'Missing required fields: name, limit' }, { status: 400 });
    }

    const envelopes = await initializeEnvelopes();

    const newEnvelope: Envelope = {
      id: `env-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name,
      limit: body.limit,
      spent: 0,
      reserved: 0,
      available: body.limit,
      period: body.period || 'monthly',
      periodStart: new Date().toISOString(),
      hardLimit: body.hardLimit ?? true,
      enabled: body.enabled ?? true,
      agentId: body.agentId,
      taskType: body.taskType,
      createdAt: new Date().toISOString(),
    };

    envelopes.push(newEnvelope);
    await saveJsonData(ENVELOPES_FILE, envelopes);

    await logAuditEntry({
      action: 'envelope_create',
      endpoint: '/api/vault/envelopes',
      method: 'POST',
      requestBody: body,
      responseStatus: 201,
    });

    return NextResponse.json({ success: true, data: newEnvelope }, { status: 201 });
  } catch (error) {
    console.error('Envelopes POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create envelope' }, { status: 500 });
  }
}

// PUT /api/vault/envelopes?id=xxx - Update envelope
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const envelopeId = searchParams.get('id');

    if (!envelopeId) {
      return NextResponse.json({ success: false, error: 'Missing envelope ID' }, { status: 400 });
    }

    const body = await request.json();
    const envelopes = await initializeEnvelopes();
    const index = envelopes.findIndex(e => e.id === envelopeId);

    if (index === -1) {
      return NextResponse.json({ success: false, error: 'Envelope not found' }, { status: 404 });
    }

    const updated = {
      ...envelopes[index],
      ...body,
      available: (body.limit || envelopes[index].limit) - envelopes[index].spent - envelopes[index].reserved,
    };

    envelopes[index] = updated;
    await saveJsonData(ENVELOPES_FILE, envelopes);

    await logAuditEntry({
      action: 'envelope_update',
      endpoint: '/api/vault/envelopes',
      method: 'PUT',
      requestBody: body,
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Envelopes PUT error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update envelope' }, { status: 500 });
  }
}

// DELETE /api/vault/envelopes?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const envelopeId = searchParams.get('id');

    if (!envelopeId) {
      return NextResponse.json({ success: false, error: 'Missing envelope ID' }, { status: 400 });
    }

    let envelopes = await initializeEnvelopes();
    const initialLength = envelopes.length;
    envelopes = envelopes.filter(e => e.id !== envelopeId);

    if (envelopes.length === initialLength) {
      return NextResponse.json({ success: false, error: 'Envelope not found' }, { status: 404 });
    }

    await saveJsonData(ENVELOPES_FILE, envelopes);

    await logAuditEntry({
      action: 'envelope_delete',
      endpoint: '/api/vault/envelopes',
      method: 'DELETE',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, message: 'Envelope deleted' });
  } catch (error) {
    console.error('Envelopes DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete envelope' }, { status: 500 });
  }
}
