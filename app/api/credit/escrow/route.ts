/**
 * Escrow API - Lock and release funds for jobs and contracts
 */
import { NextRequest, NextResponse } from 'next/server';
import { creditSystem, creditUtils } from '@/app/lib/credit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('wallet_id');
    const agentId = searchParams.get('agent_id');
    const escrowId = searchParams.get('escrow_id');
    const status = searchParams.get('status'); // 'active' or 'released'

    // Get specific escrow
    if (escrowId) {
      const escrow = await creditSystem.escrowService.getEscrow(escrowId);
      if (!escrow) {
        return NextResponse.json(
          { error: 'Escrow not found', code: 'ESCROW_NOT_FOUND' },
          { status: 404 }
        );
      }
      return NextResponse.json(escrow);
    }

    let targetWalletId = walletId;

    // Get wallet by agent ID if provided
    if (agentId) {
      const wallet = await creditSystem.walletService.getWalletByAgent(agentId);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found for agent', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      targetWalletId = wallet.id;
    }

    if (targetWalletId) {
      // Get escrows for specific wallet
      let escrows;
      
      if (status === 'active') {
        escrows = await creditSystem.escrowService.getActiveEscrows(targetWalletId);
      } else {
        escrows = await creditSystem.escrowService.getEscrowHistory(targetWalletId);
      }

      const totalReserved = await creditSystem.escrowService.getTotalReserved(targetWalletId);

      return NextResponse.json({
        wallet_id: targetWalletId,
        escrows,
        total_reserved: totalReserved,
        count: escrows.length
      });
    }

    // Get all escrows (admin function)
    const allEscrows = await creditSystem.escrowService.getAllEscrows();
    
    // Filter by status if requested
    let filteredEscrows = allEscrows;
    if (status === 'active') {
      filteredEscrows = allEscrows.filter(escrow => !escrow.released_at);
    } else if (status === 'released') {
      filteredEscrows = allEscrows.filter(escrow => escrow.released_at);
    }

    return NextResponse.json({
      escrows: filteredEscrows,
      count: filteredEscrows.length
    });

  } catch (error) {
    console.error('Escrow GET error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get escrows', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const escrowId = searchParams.get('escrow_id');
    const action = searchParams.get('action');

    const body = await request.json();

    // Handle escrow release
    if (escrowId && action === 'release') {
      const { to_wallet_id, to_agent_id } = body;

      let targetWalletId = to_wallet_id;

      // Get wallet by agent ID if provided
      if (to_agent_id) {
        const wallet = await creditSystem.walletService.getWalletByAgent(to_agent_id);
        if (!wallet) {
          return NextResponse.json(
            { error: 'Recipient wallet not found for agent', code: 'WALLET_NOT_FOUND' },
            { status: 404 }
          );
        }
        targetWalletId = wallet.id;
      }

      if (!targetWalletId) {
        return NextResponse.json(
          { error: 'Recipient wallet must be specified', code: 'MISSING_RECIPIENT' },
          { status: 400 }
        );
      }

      const transfer = await creditSystem.escrowService.releaseFunds(escrowId, targetWalletId);
      return NextResponse.json({
        message: 'Escrow released successfully',
        transfer
      });
    }

    // Handle partial release
    if (escrowId && action === 'partial_release') {
      const { to_wallet_id, to_agent_id, amount } = body;

      if (!amount || amount <= 0) {
        return NextResponse.json(
          { error: 'Valid release amount is required', code: 'INVALID_AMOUNT' },
          { status: 400 }
        );
      }

      let targetWalletId = to_wallet_id;

      if (to_agent_id) {
        const wallet = await creditSystem.walletService.getWalletByAgent(to_agent_id);
        if (!wallet) {
          return NextResponse.json(
            { error: 'Recipient wallet not found for agent', code: 'WALLET_NOT_FOUND' },
            { status: 404 }
          );
        }
        targetWalletId = wallet.id;
      }

      if (!targetWalletId) {
        return NextResponse.json(
          { error: 'Recipient wallet must be specified', code: 'MISSING_RECIPIENT' },
          { status: 400 }
        );
      }

      const result = await creditSystem.escrowService.partialRelease(escrowId, targetWalletId, amount);
      return NextResponse.json({
        message: 'Partial escrow release successful',
        transfer: result.transfer,
        remaining_escrow: result.remainingEscrow
      });
    }

    // Handle cancellation
    if (escrowId && action === 'cancel') {
      await creditSystem.escrowService.cancelEscrow(escrowId);
      return NextResponse.json({ message: 'Escrow cancelled successfully' });
    }

    // Create new escrow
    const { 
      agent_id, 
      wallet_id, 
      amount, 
      purpose, 
      release_condition,
      job_id // Convenience for compute jobs
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid escrow amount is required', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    if (!purpose) {
      return NextResponse.json(
        { error: 'Escrow purpose is required', code: 'MISSING_PURPOSE' },
        { status: 400 }
      );
    }

    let targetWalletId = wallet_id;

    // Get wallet by agent ID if provided
    if (agent_id) {
      const wallet = await creditSystem.walletService.getWalletByAgent(agent_id);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found for agent', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      targetWalletId = wallet.id;
    }

    if (!targetWalletId) {
      return NextResponse.json(
        { error: 'Wallet must be specified', code: 'MISSING_WALLET' },
        { status: 400 }
      );
    }

    // Use convenience method for compute jobs
    if (job_id) {
      const escrow = await creditUtils.setupComputeJob(
        agent_id || targetWalletId, 
        amount, 
        job_id
      );
      return NextResponse.json(escrow, { status: 201 });
    }

    // Create general escrow
    const escrow = await creditSystem.escrowService.lockFunds(
      targetWalletId,
      amount,
      purpose,
      release_condition || 'Manual release'
    );

    return NextResponse.json(escrow, { status: 201 });

  } catch (error) {
    console.error('Escrow POST error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Escrow or wallet not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('Insufficient funds')) {
        return NextResponse.json(
          { error: 'Insufficient funds for escrow', code: 'INSUFFICIENT_FUNDS' },
          { status: 400 }
        );
      }
      
      if (error.message.includes('already released')) {
        return NextResponse.json(
          { error: 'Escrow already released', code: 'ESCROW_ALREADY_RELEASED' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Escrow operation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const escrowId = searchParams.get('escrow_id');
    const body = await request.json();

    if (!escrowId) {
      return NextResponse.json(
        { error: 'Escrow ID is required', code: 'MISSING_ESCROW_ID' },
        { status: 400 }
      );
    }

    const { purpose, release_condition } = body;

    const updates: any = {};
    if (purpose !== undefined) updates.purpose = purpose;
    if (release_condition !== undefined) updates.release_condition = release_condition;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided', code: 'NO_UPDATES' },
        { status: 400 }
      );
    }

    const updatedEscrow = await creditSystem.escrowService.updateEscrow(escrowId, updates);
    return NextResponse.json(updatedEscrow);

  } catch (error) {
    console.error('Escrow PATCH error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Escrow not found', code: 'ESCROW_NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('already released')) {
        return NextResponse.json(
          { error: 'Cannot update released escrow', code: 'ESCROW_ALREADY_RELEASED' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Escrow update failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}