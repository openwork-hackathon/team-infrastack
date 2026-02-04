/**
 * Wallets API - Create and manage agent wallets
 */
import { NextRequest, NextResponse } from 'next/server';
import { creditSystem, creditUtils } from '@/app/lib/credit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('id');
    const agentId = searchParams.get('agent_id');
    const action = searchParams.get('action');

    // Get specific wallet
    if (walletId) {
      const wallet = await creditSystem.walletService.getWallet(walletId);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }

      // Get balance info if requested
      if (action === 'balance') {
        const status = await creditSystem.creditEnforcement.getWalletStatus(walletId);
        return NextResponse.json(status);
      }

      return NextResponse.json(wallet);
    }

    // Get wallet by agent ID
    if (agentId) {
      const wallet = await creditSystem.walletService.getWalletByAgent(agentId);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found for agent', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }

      // Get balance info if requested
      if (action === 'balance') {
        const status = await creditSystem.creditEnforcement.getWalletStatus(wallet.id);
        return NextResponse.json(status);
      }

      return NextResponse.json(wallet);
    }

    // Get all wallets (admin function)
    const wallets = await creditSystem.walletService.getAllWallets();
    return NextResponse.json(wallets);

  } catch (error) {
    console.error('Wallets API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, initial_balance } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: 'Agent ID is required', code: 'MISSING_AGENT_ID' },
        { status: 400 }
      );
    }

    // Check if wallet already exists
    const existingWallet = await creditSystem.walletService.getWalletByAgent(agent_id);
    if (existingWallet) {
      return NextResponse.json(
        { error: 'Wallet already exists for this agent', code: 'WALLET_EXISTS' },
        { status: 409 }
      );
    }

    // Create wallet
    const wallet = await creditSystem.walletService.createWallet(agent_id);

    // Add initial balance if provided
    let depositTransfer = null;
    if (initial_balance && initial_balance > 0) {
      depositTransfer = await creditSystem.walletService.deposit(
        wallet.id,
        initial_balance,
        'Initial wallet funding'
      );
    }

    return NextResponse.json({
      wallet,
      initial_deposit: depositTransfer
    }, { status: 201 });

  } catch (error) {
    console.error('Wallet creation error:', error);
    
    if (error instanceof Error && error.message.includes('already has a wallet')) {
      return NextResponse.json(
        { error: 'Wallet already exists for this agent', code: 'WALLET_EXISTS' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Failed to create wallet', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('id');
    const body = await request.json();

    if (!walletId) {
      return NextResponse.json(
        { error: 'Wallet ID is required', code: 'MISSING_WALLET_ID' },
        { status: 400 }
      );
    }

    const { action, amount, memo } = body;

    switch (action) {
      case 'deposit':
        if (!amount || amount <= 0) {
          return NextResponse.json(
            { error: 'Valid deposit amount is required', code: 'INVALID_AMOUNT' },
            { status: 400 }
          );
        }

        // Process deposit with automatic lien settlement
        const depositResult = await creditSystem.creditEnforcement.processDeposit(
          walletId,
          amount
        );

        return NextResponse.json(depositResult);

      case 'check_spend':
        if (!amount || amount <= 0) {
          return NextResponse.json(
            { error: 'Valid spend amount is required', code: 'INVALID_AMOUNT' },
            { status: 400 }
          );
        }

        const spendCheck = await creditSystem.creditEnforcement.canSpend(walletId, amount);
        return NextResponse.json(spendCheck);

      default:
        return NextResponse.json(
          { error: 'Invalid action', code: 'INVALID_ACTION' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Wallet operation error:', error);
    return NextResponse.json(
      { 
        error: 'Wallet operation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}