/**
 * Royalties API - Manage royalty agreements and distributions
 */
import { NextRequest, NextResponse } from 'next/server';
import { creditSystem } from '@/app/lib/credit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('wallet_id');
    const agentId = searchParams.get('agent_id');
    const agreementId = searchParams.get('agreement_id');
    const role = searchParams.get('role'); // 'source' or 'recipient'
    const trigger = searchParams.get('trigger') as 'on_compute' | 'on_savings' | 'on_profit';

    // Get specific agreement
    if (agreementId) {
      const agreement = await creditSystem.royaltyService.getAgreement(agreementId);
      if (!agreement) {
        return NextResponse.json(
          { error: 'Royalty agreement not found', code: 'AGREEMENT_NOT_FOUND' },
          { status: 404 }
        );
      }
      return NextResponse.json(agreement);
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
      let agreements;

      if (role === 'source') {
        agreements = await creditSystem.royaltyService.getSourceAgreements(targetWalletId);
      } else if (role === 'recipient') {
        agreements = await creditSystem.royaltyService.getRecipientAgreements(targetWalletId);
      } else {
        agreements = await creditSystem.royaltyService.getActiveAgreements(targetWalletId);
      }

      // Calculate total royalty burden if wallet is source
      let totalRate = 0;
      if (trigger && (role === 'source' || role === undefined)) {
        totalRate = await creditSystem.royaltyService.getTotalRoyaltyRate(targetWalletId, trigger);
      }

      return NextResponse.json({
        wallet_id: targetWalletId,
        role: role || 'all',
        agreements,
        count: agreements.length,
        total_royalty_rate: totalRate
      });
    }

    // Get agreements by trigger type
    if (trigger) {
      const agreements = await creditSystem.royaltyService.getAgreementsByTrigger(trigger);
      return NextResponse.json({
        trigger,
        agreements,
        count: agreements.length
      });
    }

    // Get all agreements (admin function)
    const allAgreements = await creditSystem.royaltyService.getAllAgreements();
    return NextResponse.json({
      agreements: allAgreements,
      count: allAgreements.length
    });

  } catch (error) {
    console.error('Royalties GET error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get royalty agreements', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const body = await request.json();

    // Handle royalty distribution
    if (action === 'distribute') {
      const { source_agent_id, source_wallet_id, gross_amount, trigger } = body;

      if (!gross_amount || gross_amount <= 0) {
        return NextResponse.json(
          { error: 'Valid gross amount is required', code: 'INVALID_AMOUNT' },
          { status: 400 }
        );
      }

      if (!trigger || !['on_compute', 'on_savings', 'on_profit'].includes(trigger)) {
        return NextResponse.json(
          { error: 'Valid trigger is required (on_compute, on_savings, on_profit)', code: 'INVALID_TRIGGER' },
          { status: 400 }
        );
      }

      let sourceWalletId = source_wallet_id;

      if (source_agent_id) {
        const wallet = await creditSystem.walletService.getWalletByAgent(source_agent_id);
        if (!wallet) {
          return NextResponse.json(
            { error: 'Source wallet not found for agent', code: 'WALLET_NOT_FOUND' },
            { status: 404 }
          );
        }
        sourceWalletId = wallet.id;
      }

      if (!sourceWalletId) {
        return NextResponse.json(
          { error: 'Source wallet must be specified', code: 'MISSING_SOURCE_WALLET' },
          { status: 400 }
        );
      }

      // Calculate expected royalty obligations first
      const obligations = await creditSystem.royaltyService.calculateRoyaltyObligations(
        sourceWalletId,
        gross_amount,
        trigger
      );

      // Execute distributions
      const transfers = await creditSystem.royaltyService.distributeRoyalties(
        sourceWalletId,
        gross_amount,
        trigger
      );

      return NextResponse.json({
        message: 'Royalties distributed successfully',
        gross_amount,
        trigger,
        obligations,
        transfers,
        total_distributed: transfers.reduce((sum, t) => sum + t.amount, 0)
      });
    }

    // Create new royalty agreement
    const { 
      source_agent_id, 
      recipient_agent_id, 
      source_wallet_id, 
      recipient_wallet_id, 
      rate, 
      trigger 
    } = body;

    if (!rate || rate < 0 || rate > 1) {
      return NextResponse.json(
        { error: 'Royalty rate must be between 0 and 1', code: 'INVALID_RATE' },
        { status: 400 }
      );
    }

    if (!trigger || !['on_compute', 'on_savings', 'on_profit'].includes(trigger)) {
      return NextResponse.json(
        { error: 'Valid trigger is required (on_compute, on_savings, on_profit)', code: 'INVALID_TRIGGER' },
        { status: 400 }
      );
    }

    let sourceWalletId = source_wallet_id;
    let recipientWalletId = recipient_wallet_id;

    // Get wallets by agent IDs if provided
    if (source_agent_id) {
      const wallet = await creditSystem.walletService.getWalletByAgent(source_agent_id);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Source wallet not found for agent', code: 'SOURCE_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      sourceWalletId = wallet.id;
    }

    if (recipient_agent_id) {
      const wallet = await creditSystem.walletService.getWalletByAgent(recipient_agent_id);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Recipient wallet not found for agent', code: 'RECIPIENT_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      recipientWalletId = wallet.id;
    }

    if (!sourceWalletId || !recipientWalletId) {
      return NextResponse.json(
        { error: 'Both source and recipient wallets must be specified', code: 'MISSING_WALLETS' },
        { status: 400 }
      );
    }

    // Create the royalty agreement
    const agreement = await creditSystem.royaltyService.createAgreement(
      sourceWalletId,
      recipientWalletId,
      rate,
      trigger
    );

    return NextResponse.json(agreement, { status: 201 });

  } catch (error) {
    console.error('Royalties POST error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Wallet not found', code: 'WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('same wallet')) {
        return NextResponse.json(
          { error: 'Source and recipient cannot be the same', code: 'SAME_WALLET_ERROR' },
          { status: 400 }
        );
      }
      
      if (error.message.includes('Insufficient funds')) {
        return NextResponse.json(
          { error: 'Insufficient funds for royalty distribution', code: 'INSUFFICIENT_FUNDS' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Royalty operation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agreementId = searchParams.get('agreement_id');
    const action = searchParams.get('action');
    const body = await request.json();

    if (!agreementId) {
      return NextResponse.json(
        { error: 'Agreement ID is required', code: 'MISSING_AGREEMENT_ID' },
        { status: 400 }
      );
    }

    // Handle deactivation/reactivation
    if (action === 'deactivate') {
      await creditSystem.royaltyService.deactivateAgreement(agreementId);
      return NextResponse.json({ message: 'Royalty agreement deactivated' });
    }

    if (action === 'reactivate') {
      await creditSystem.royaltyService.reactivateAgreement(agreementId);
      return NextResponse.json({ message: 'Royalty agreement reactivated' });
    }

    // Handle rate update
    const { rate } = body;

    if (rate !== undefined) {
      if (rate < 0 || rate > 1) {
        return NextResponse.json(
          { error: 'Royalty rate must be between 0 and 1', code: 'INVALID_RATE' },
          { status: 400 }
        );
      }

      const updatedAgreement = await creditSystem.royaltyService.updateRoyaltyRate(agreementId, rate);
      return NextResponse.json(updatedAgreement);
    }

    return NextResponse.json(
      { error: 'No valid updates provided', code: 'NO_UPDATES' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Royalties PATCH error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Royalty agreement not found', code: 'AGREEMENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Royalty agreement update failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agreementId = searchParams.get('agreement_id');

    if (!agreementId) {
      return NextResponse.json(
        { error: 'Agreement ID is required', code: 'MISSING_AGREEMENT_ID' },
        { status: 400 }
      );
    }

    await creditSystem.royaltyService.deleteAgreement(agreementId);

    return NextResponse.json({ message: 'Royalty agreement deleted successfully' });

  } catch (error) {
    console.error('Royalties DELETE error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Royalty agreement not found', code: 'AGREEMENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Royalty agreement deletion failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}