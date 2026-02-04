/**
 * Transfers API - Handle agent-to-agent transfers and transaction history
 */
import { NextRequest, NextResponse } from 'next/server';
import { creditSystem, creditUtils } from '@/app/lib/credit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('wallet_id');
    const agentId = searchParams.get('agent_id');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!walletId && !agentId) {
      return NextResponse.json(
        { error: 'wallet_id or agent_id is required', code: 'MISSING_IDENTIFIER' },
        { status: 400 }
      );
    }

    let targetWalletId = walletId;

    // If agent_id provided, get their wallet
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

    if (!targetWalletId) {
      return NextResponse.json(
        { error: 'Wallet not found', code: 'WALLET_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Get transfer history
    const transfers = await creditSystem.walletService.getTransferHistory(targetWalletId, limit);

    return NextResponse.json({
      wallet_id: targetWalletId,
      transfers,
      count: transfers.length
    });

  } catch (error) {
    console.error('Transfer history error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get transfer history', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      from_agent_id, 
      to_agent_id, 
      from_wallet_id, 
      to_wallet_id, 
      amount, 
      memo 
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid transfer amount is required', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    if (!memo) {
      return NextResponse.json(
        { error: 'Transfer memo is required', code: 'MISSING_MEMO' },
        { status: 400 }
      );
    }

    let fromWalletId = from_wallet_id;
    let toWalletId = to_wallet_id;

    // Handle agent-based transfers
    if (from_agent_id && to_agent_id) {
      // Use utility function for agent-to-agent payment
      try {
        const transfer = await creditUtils.agentPayment(from_agent_id, to_agent_id, amount, memo);
        return NextResponse.json(transfer, { status: 201 });
      } catch (error) {
        return NextResponse.json(
          { 
            error: 'Transfer failed', 
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'TRANSFER_FAILED'
          },
          { status: 400 }
        );
      }
    }

    // Handle wallet-based transfers
    if (from_agent_id && to_wallet_id) {
      const fromWallet = await creditSystem.walletService.getWalletByAgent(from_agent_id);
      if (!fromWallet) {
        return NextResponse.json(
          { error: 'Source wallet not found for agent', code: 'SOURCE_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      fromWalletId = fromWallet.id;
    }

    if (to_agent_id && from_wallet_id) {
      const toWallet = await creditSystem.walletService.getWalletByAgent(to_agent_id);
      if (!toWallet) {
        return NextResponse.json(
          { error: 'Destination wallet not found for agent', code: 'DEST_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      toWalletId = toWallet.id;
    }

    if (!fromWalletId || !toWalletId) {
      return NextResponse.json(
        { error: 'Both source and destination must be specified', code: 'MISSING_WALLETS' },
        { status: 400 }
      );
    }

    // Check if sender can afford the transfer
    const canSpend = await creditSystem.creditEnforcement.canSpend(fromWalletId, amount);
    if (!canSpend.allowed) {
      return NextResponse.json(
        { 
          error: 'Transfer not allowed', 
          reason: canSpend.reason,
          code: 'TRANSFER_NOT_ALLOWED'
        },
        { status: 400 }
      );
    }

    // Execute the transfer
    const transfer = await creditSystem.walletService.internalTransfer(
      fromWalletId,
      toWalletId,
      amount,
      memo
    );

    return NextResponse.json(transfer, { status: 201 });

  } catch (error) {
    console.error('Transfer creation error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Insufficient funds')) {
        return NextResponse.json(
          { error: 'Insufficient funds', code: 'INSUFFICIENT_FUNDS' },
          { status: 400 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Wallet not found', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Transfer failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}