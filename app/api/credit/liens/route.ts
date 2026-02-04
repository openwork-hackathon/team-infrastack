/**
 * Liens API - Manage debt obligations and settlements
 */
import { NextRequest, NextResponse } from 'next/server';
import { creditSystem } from '@/app/lib/credit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const debtorWalletId = searchParams.get('debtor');
    const creditorWalletId = searchParams.get('creditor');
    const agentId = searchParams.get('agent_id');
    const status = searchParams.get('status'); // 'active' or 'settled'

    let walletId = debtorWalletId;

    // Get wallet by agent ID if provided
    if (agentId) {
      const wallet = await creditSystem.walletService.getWalletByAgent(agentId);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found for agent', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      walletId = wallet.id;
    }

    if (walletId) {
      // Get liens against this wallet (debts owed by this wallet)
      const liens = await creditSystem.lienService.getLiensAgainst(walletId);
      const totalAmount = await creditSystem.lienService.getTotalLienAmount(walletId);

      return NextResponse.json({
        debtor_wallet_id: walletId,
        liens,
        total_amount: totalAmount,
        count: liens.length
      });
    }

    if (creditorWalletId) {
      // Get liens owed to this wallet (debts owed to this wallet)
      const liens = await creditSystem.lienService.getLiensOwed(creditorWalletId);
      
      return NextResponse.json({
        creditor_wallet_id: creditorWalletId,
        liens,
        count: liens.length
      });
    }

    // Get all liens (admin function)
    const allLiens = await creditSystem.lienService.getAllLiens();
    
    // Filter by status if requested
    let filteredLiens = allLiens;
    if (status === 'active') {
      filteredLiens = allLiens.filter(lien => !lien.settled_at);
    } else if (status === 'settled') {
      filteredLiens = allLiens.filter(lien => lien.settled_at);
    }

    return NextResponse.json({
      liens: filteredLiens,
      count: filteredLiens.length
    });

  } catch (error) {
    console.error('Liens GET error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get liens', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lienId = searchParams.get('lien_id');
    const action = searchParams.get('action');

    // Handle lien settlement
    if (lienId && action === 'settle') {
      const transfer = await creditSystem.lienService.settleLien(lienId);
      return NextResponse.json({
        message: 'Lien settled successfully',
        transfer
      });
    }

    // Create new lien
    const body = await request.json();
    const { 
      debtor_agent_id, 
      creditor_agent_id, 
      debtor_wallet_id, 
      creditor_wallet_id, 
      amount, 
      reason,
      priority = 1
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid lien amount is required', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        { error: 'Lien reason is required', code: 'MISSING_REASON' },
        { status: 400 }
      );
    }

    let debtorWallet = debtor_wallet_id;
    let creditorWallet = creditor_wallet_id;

    // Get wallets by agent IDs if provided
    if (debtor_agent_id) {
      const wallet = await creditSystem.walletService.getWalletByAgent(debtor_agent_id);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Debtor wallet not found for agent', code: 'DEBTOR_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      debtorWallet = wallet.id;
    }

    if (creditor_agent_id) {
      const wallet = await creditSystem.walletService.getWalletByAgent(creditor_agent_id);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Creditor wallet not found for agent', code: 'CREDITOR_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      creditorWallet = wallet.id;
    }

    if (!debtorWallet || !creditorWallet) {
      return NextResponse.json(
        { error: 'Both debtor and creditor wallets must be specified', code: 'MISSING_WALLETS' },
        { status: 400 }
      );
    }

    // Create the lien
    const lien = await creditSystem.lienService.createLien(
      debtorWallet,
      creditorWallet,
      amount,
      reason,
      priority
    );

    return NextResponse.json(lien, { status: 201 });

  } catch (error) {
    console.error('Liens POST error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Lien or wallet not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('Insufficient funds')) {
        return NextResponse.json(
          { error: 'Insufficient funds to settle lien', code: 'INSUFFICIENT_FUNDS' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Lien operation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lienId = searchParams.get('lien_id');
    const body = await request.json();

    if (!lienId) {
      return NextResponse.json(
        { error: 'Lien ID is required', code: 'MISSING_LIEN_ID' },
        { status: 400 }
      );
    }

    const { priority } = body;

    if (priority !== undefined) {
      const updatedLien = await creditSystem.lienService.updateLienPriority(lienId, priority);
      return NextResponse.json(updatedLien);
    }

    return NextResponse.json(
      { error: 'No valid updates provided', code: 'NO_UPDATES' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Liens PATCH error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Lien not found', code: 'LIEN_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Lien update failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lienId = searchParams.get('lien_id');

    if (!lienId) {
      return NextResponse.json(
        { error: 'Lien ID is required', code: 'MISSING_LIEN_ID' },
        { status: 400 }
      );
    }

    await creditSystem.lienService.cancelLien(lienId);

    return NextResponse.json({ message: 'Lien cancelled successfully' });

  } catch (error) {
    console.error('Liens DELETE error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Lien not found', code: 'LIEN_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Lien cancellation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}