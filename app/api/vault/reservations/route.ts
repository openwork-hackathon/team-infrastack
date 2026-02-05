import { NextRequest, NextResponse } from 'next/server';
import { loadJsonData, saveJsonData, logAuditEntry } from '../utils';

const RESERVATIONS_FILE = 'reservations.json';
const ENVELOPES_FILE = 'envelopes.json';

export interface Reservation {
  id: string;
  amount: number;          // In USD cents
  envelopeId?: string;
  agentId?: string;
  taskId?: string;
  status: 'active' | 'released' | 'expired';
  actualSpent?: number;    // Filled when released
  createdAt: string;
  expiresAt: string;       // Auto-expire after 1 hour
  releasedAt?: string;
}

// Initialize reservations
async function initializeReservations(): Promise<Reservation[]> {
  let reservations = await loadJsonData<Reservation>(RESERVATIONS_FILE);
  
  // Clean up expired reservations
  const now = new Date();
  let hasChanges = false;
  
  reservations = reservations.map(r => {
    if (r.status === 'active' && new Date(r.expiresAt) < now) {
      hasChanges = true;
      return { ...r, status: 'expired' as const };
    }
    return r;
  });
  
  if (hasChanges) {
    await saveJsonData(RESERVATIONS_FILE, reservations);
  }
  
  return reservations;
}

// GET /api/vault/reservations
export async function GET(request: NextRequest) {
  try {
    const reservations = await initializeReservations();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const envelopeId = searchParams.get('envelopeId');
    const agentId = searchParams.get('agentId');

    let filtered = reservations;
    
    if (status) {
      filtered = filtered.filter(r => r.status === status);
    }
    if (envelopeId) {
      filtered = filtered.filter(r => r.envelopeId === envelopeId);
    }
    if (agentId) {
      filtered = filtered.filter(r => r.agentId === agentId);
    }

    const summary = {
      total: filtered.length,
      activeCount: filtered.filter(r => r.status === 'active').length,
      activeAmount: filtered.filter(r => r.status === 'active').reduce((sum, r) => sum + r.amount, 0),
      releasedCount: filtered.filter(r => r.status === 'released').length,
      expiredCount: filtered.filter(r => r.status === 'expired').length,
    };

    await logAuditEntry({
      action: 'reservation_list',
      endpoint: '/api/vault/reservations',
      method: 'GET',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, data: filtered, summary });
  } catch (error) {
    console.error('Reservations GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve reservations' }, { status: 500 });
  }
}

// POST /api/vault/reservations - Create reservation (lock credits)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.amount) {
      return NextResponse.json({ success: false, error: 'Missing required field: amount' }, { status: 400 });
    }

    const amount = body.amount;
    const envelopeId = body.envelopeId;

    // If envelope specified, check availability
    if (envelopeId) {
      const envelopes = await loadJsonData<any>(ENVELOPES_FILE);
      const envelope = envelopes.find((e: any) => e.id === envelopeId);
      
      if (!envelope) {
        return NextResponse.json({ success: false, error: 'Envelope not found' }, { status: 404 });
      }
      
      if (envelope.hardLimit && envelope.available < amount) {
        return NextResponse.json({ 
          success: false, 
          error: `Insufficient budget in envelope "${envelope.name}": need ${amount}¢, have ${envelope.available}¢`,
          available: envelope.available,
        }, { status: 400 });
      }

      // Update envelope reserved amount
      envelope.reserved += amount;
      envelope.available = envelope.limit - envelope.spent - envelope.reserved;
      await saveJsonData(ENVELOPES_FILE, envelopes);
    }

    const reservations = await initializeReservations();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour expiry

    const reservation: Reservation = {
      id: `res-${crypto.randomUUID().slice(0, 8)}`,
      amount,
      envelopeId,
      agentId: body.agentId,
      taskId: body.taskId,
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    reservations.push(reservation);
    await saveJsonData(RESERVATIONS_FILE, reservations);

    await logAuditEntry({
      action: 'reservation_create',
      endpoint: '/api/vault/reservations',
      method: 'POST',
      requestBody: body,
      responseStatus: 201,
    });

    return NextResponse.json({ success: true, data: reservation }, { status: 201 });
  } catch (error) {
    console.error('Reservations POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create reservation' }, { status: 500 });
  }
}

// PUT /api/vault/reservations?id=xxx - Release reservation
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('id');

    if (!reservationId) {
      return NextResponse.json({ success: false, error: 'Missing reservation ID' }, { status: 400 });
    }

    const body = await request.json();
    const actualSpent = body.actualSpent;

    if (actualSpent === undefined) {
      return NextResponse.json({ success: false, error: 'Missing actualSpent amount' }, { status: 400 });
    }

    const reservations = await initializeReservations();
    const index = reservations.findIndex(r => r.id === reservationId);

    if (index === -1) {
      return NextResponse.json({ success: false, error: 'Reservation not found' }, { status: 404 });
    }

    const reservation = reservations[index];

    if (reservation.status !== 'active') {
      return NextResponse.json({ 
        success: false, 
        error: `Reservation is ${reservation.status}, cannot release` 
      }, { status: 400 });
    }

    if (actualSpent > reservation.amount) {
      return NextResponse.json({ 
        success: false, 
        error: `Actual spend ${actualSpent}¢ exceeds reservation ${reservation.amount}¢` 
      }, { status: 400 });
    }

    // Update envelope if applicable
    if (reservation.envelopeId) {
      const envelopes = await loadJsonData<any>(ENVELOPES_FILE);
      const envelope = envelopes.find((e: any) => e.id === reservation.envelopeId);
      
      if (envelope) {
        envelope.reserved -= reservation.amount;
        envelope.spent += actualSpent;
        envelope.available = envelope.limit - envelope.spent - envelope.reserved;
        await saveJsonData(ENVELOPES_FILE, envelopes);
      }
    }

    // Update reservation
    const released = reservation.amount - actualSpent;
    reservations[index] = {
      ...reservation,
      status: 'released',
      actualSpent,
      releasedAt: new Date().toISOString(),
    };

    await saveJsonData(RESERVATIONS_FILE, reservations);

    await logAuditEntry({
      action: 'reservation_release',
      endpoint: '/api/vault/reservations',
      method: 'PUT',
      requestBody: { reservationId, actualSpent, released },
      responseStatus: 200,
    });

    return NextResponse.json({ 
      success: true, 
      data: reservations[index],
      released,
      message: `Released ${released}¢ back to budget`,
    });
  } catch (error) {
    console.error('Reservations PUT error:', error);
    return NextResponse.json({ success: false, error: 'Failed to release reservation' }, { status: 500 });
  }
}

// DELETE /api/vault/reservations?id=xxx - Cancel reservation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('id');

    if (!reservationId) {
      return NextResponse.json({ success: false, error: 'Missing reservation ID' }, { status: 400 });
    }

    const reservations = await initializeReservations();
    const index = reservations.findIndex(r => r.id === reservationId);

    if (index === -1) {
      return NextResponse.json({ success: false, error: 'Reservation not found' }, { status: 404 });
    }

    const reservation = reservations[index];

    // Return reserved amount to envelope
    if (reservation.status === 'active' && reservation.envelopeId) {
      const envelopes = await loadJsonData<any>(ENVELOPES_FILE);
      const envelope = envelopes.find((e: any) => e.id === reservation.envelopeId);
      
      if (envelope) {
        envelope.reserved -= reservation.amount;
        envelope.available = envelope.limit - envelope.spent - envelope.reserved;
        await saveJsonData(ENVELOPES_FILE, envelopes);
      }
    }

    reservations.splice(index, 1);
    await saveJsonData(RESERVATIONS_FILE, reservations);

    await logAuditEntry({
      action: 'reservation_cancel',
      endpoint: '/api/vault/reservations',
      method: 'DELETE',
      responseStatus: 200,
    });

    return NextResponse.json({ success: true, message: 'Reservation cancelled' });
  } catch (error) {
    console.error('Reservations DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to cancel reservation' }, { status: 500 });
  }
}
