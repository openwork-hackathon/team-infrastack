/**
 * Bonds API - Issue and manage bonds backed by future royalties
 */
import { NextRequest, NextResponse } from 'next/server';
import { creditSystem } from '@/app/lib/credit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bondId = searchParams.get('bond_id');
    const issuerWalletId = searchParams.get('issuer');
    const holderWalletId = searchParams.get('holder');
    const issuerAgentId = searchParams.get('issuer_agent_id');
    const holderAgentId = searchParams.get('holder_agent_id');
    const status = searchParams.get('status') as 'active' | 'matured' | 'defaulted';
    const available = searchParams.get('available') === 'true';

    // Get specific bond
    if (bondId) {
      const bond = await creditSystem.bondService.getBond(bondId);
      if (!bond) {
        return NextResponse.json(
          { error: 'Bond not found', code: 'BOND_NOT_FOUND' },
          { status: 404 }
        );
      }

      // Calculate potential ROI
      const roiAnalysis = creditSystem.bondService.calculatePotentialROI(bond);

      return NextResponse.json({
        bond,
        roi_analysis: roiAnalysis
      });
    }

    // Get available bonds for purchase
    if (available) {
      const availableBonds = await creditSystem.bondService.getAvailableBonds();
      
      const bondsWithROI = availableBonds.map(bond => ({
        bond,
        roi_analysis: creditSystem.bondService.calculatePotentialROI(bond)
      }));

      return NextResponse.json({
        bonds: bondsWithROI,
        count: bondsWithROI.length
      });
    }

    let targetIssuerWalletId = issuerWalletId;
    let targetHolderWalletId = holderWalletId;

    // Get wallets by agent IDs if provided
    if (issuerAgentId) {
      const wallet = await creditSystem.walletService.getWalletByAgent(issuerAgentId);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Issuer wallet not found for agent', code: 'ISSUER_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      targetIssuerWalletId = wallet.id;
    }

    if (holderAgentId) {
      const wallet = await creditSystem.walletService.getWalletByAgent(holderAgentId);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Holder wallet not found for agent', code: 'HOLDER_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      targetHolderWalletId = wallet.id;
    }

    // Get bonds by issuer
    if (targetIssuerWalletId) {
      const bonds = await creditSystem.bondService.getBondsIssuedBy(targetIssuerWalletId);
      return NextResponse.json({
        issuer_wallet_id: targetIssuerWalletId,
        bonds,
        count: bonds.length
      });
    }

    // Get bonds by holder
    if (targetHolderWalletId) {
      const bonds = await creditSystem.bondService.getBondsHeldBy(targetHolderWalletId);
      
      const bondsWithROI = bonds.map(bond => ({
        bond,
        roi_analysis: creditSystem.bondService.calculatePotentialROI(bond, bond.purchase_price)
      }));

      return NextResponse.json({
        holder_wallet_id: targetHolderWalletId,
        bonds: bondsWithROI,
        count: bondsWithROI.length
      });
    }

    // Get bonds by status
    if (status) {
      const bonds = await creditSystem.bondService.getBondsByStatus(status);
      return NextResponse.json({
        status,
        bonds,
        count: bonds.length
      });
    }

    // Get all bonds (admin function)
    const allBonds = await creditSystem.bondService.getAllBonds();
    return NextResponse.json({
      bonds: allBonds,
      count: allBonds.length
    });

  } catch (error) {
    console.error('Bonds GET error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get bonds', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bondId = searchParams.get('bond_id');
    const action = searchParams.get('action');

    const body = await request.json();

    // Handle bond purchase
    if (bondId && action === 'purchase') {
      const { buyer_agent_id, buyer_wallet_id, offer_price } = body;

      let buyerWalletId = buyer_wallet_id;

      if (buyer_agent_id) {
        const wallet = await creditSystem.walletService.getWalletByAgent(buyer_agent_id);
        if (!wallet) {
          return NextResponse.json(
            { error: 'Buyer wallet not found for agent', code: 'BUYER_WALLET_NOT_FOUND' },
            { status: 404 }
          );
        }
        buyerWalletId = wallet.id;
      }

      if (!buyerWalletId) {
        return NextResponse.json(
          { error: 'Buyer wallet must be specified', code: 'MISSING_BUYER_WALLET' },
          { status: 400 }
        );
      }

      const transfer = await creditSystem.bondService.purchaseBond(bondId, buyerWalletId, offer_price);
      
      return NextResponse.json({
        message: 'Bond purchased successfully',
        transfer
      });
    }

    // Handle bond maturation
    if (bondId && action === 'mature') {
      const transfer = await creditSystem.bondService.matureBond(bondId);
      
      return NextResponse.json({
        message: 'Bond matured successfully',
        transfer
      });
    }

    // Handle cancellation
    if (bondId && action === 'cancel') {
      await creditSystem.bondService.cancelBond(bondId);
      return NextResponse.json({ message: 'Bond cancelled successfully' });
    }

    // Check for defaults
    if (action === 'check_defaults') {
      const defaultedBonds = await creditSystem.bondService.checkForDefaults();
      return NextResponse.json({
        defaulted_bonds: defaultedBonds,
        count: defaultedBonds.length
      });
    }

    // Issue new bond
    const { 
      issuer_agent_id, 
      issuer_wallet_id, 
      face_value, 
      royalty_percentage, 
      maturity_days 
    } = body;

    if (!face_value || face_value <= 0) {
      return NextResponse.json(
        { error: 'Valid face value is required', code: 'INVALID_FACE_VALUE' },
        { status: 400 }
      );
    }

    if (royalty_percentage === undefined || royalty_percentage < 0 || royalty_percentage > 100) {
      return NextResponse.json(
        { error: 'Royalty percentage must be between 0 and 100', code: 'INVALID_ROYALTY_PERCENTAGE' },
        { status: 400 }
      );
    }

    if (!maturity_days || maturity_days <= 0) {
      return NextResponse.json(
        { error: 'Valid maturity days is required', code: 'INVALID_MATURITY_DAYS' },
        { status: 400 }
      );
    }

    let issuerWalletId = issuer_wallet_id;

    if (issuer_agent_id) {
      const wallet = await creditSystem.walletService.getWalletByAgent(issuer_agent_id);
      if (!wallet) {
        return NextResponse.json(
          { error: 'Issuer wallet not found for agent', code: 'ISSUER_WALLET_NOT_FOUND' },
          { status: 404 }
        );
      }
      issuerWalletId = wallet.id;
    }

    if (!issuerWalletId) {
      return NextResponse.json(
        { error: 'Issuer wallet must be specified', code: 'MISSING_ISSUER_WALLET' },
        { status: 400 }
      );
    }

    // Issue the bond
    const bond = await creditSystem.bondService.issueBond(
      issuerWalletId,
      face_value,
      royalty_percentage,
      maturity_days
    );

    // Calculate potential ROI
    const roiAnalysis = creditSystem.bondService.calculatePotentialROI(bond);

    return NextResponse.json({
      bond,
      roi_analysis: roiAnalysis
    }, { status: 201 });

  } catch (error) {
    console.error('Bonds POST error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Bond or wallet not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('already purchased')) {
        return NextResponse.json(
          { error: 'Bond already purchased', code: 'BOND_ALREADY_PURCHASED' },
          { status: 409 }
        );
      }
      
      if (error.message.includes('not available')) {
        return NextResponse.json(
          { error: 'Bond not available for purchase', code: 'BOND_NOT_AVAILABLE' },
          { status: 409 }
        );
      }
      
      if (error.message.includes('Insufficient funds')) {
        return NextResponse.json(
          { error: 'Insufficient funds', code: 'INSUFFICIENT_FUNDS' },
          { status: 400 }
        );
      }
      
      if (error.message.includes('defaulted')) {
        return NextResponse.json(
          { error: 'Bond defaulted', code: 'BOND_DEFAULTED' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Bond operation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bondId = searchParams.get('bond_id');
    const body = await request.json();

    if (!bondId) {
      return NextResponse.json(
        { error: 'Bond ID is required', code: 'MISSING_BOND_ID' },
        { status: 400 }
      );
    }

    const { face_value, royalty_percentage, maturity_date } = body;

    const updates: any = {};
    if (face_value !== undefined) updates.face_value = face_value;
    if (royalty_percentage !== undefined) updates.royalty_percentage = royalty_percentage;
    if (maturity_date !== undefined) updates.maturity_date = new Date(maturity_date);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided', code: 'NO_UPDATES' },
        { status: 400 }
      );
    }

    const updatedBond = await creditSystem.bondService.updateBondTerms(bondId, updates);
    
    // Calculate new ROI with updated terms
    const roiAnalysis = creditSystem.bondService.calculatePotentialROI(updatedBond);

    return NextResponse.json({
      bond: updatedBond,
      roi_analysis: roiAnalysis
    });

  } catch (error) {
    console.error('Bonds PATCH error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Bond not found', code: 'BOND_NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('already purchased')) {
        return NextResponse.json(
          { error: 'Cannot update terms of purchased bond', code: 'BOND_ALREADY_PURCHASED' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Bond update failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bondId = searchParams.get('bond_id');

    if (!bondId) {
      return NextResponse.json(
        { error: 'Bond ID is required', code: 'MISSING_BOND_ID' },
        { status: 400 }
      );
    }

    await creditSystem.bondService.cancelBond(bondId);

    return NextResponse.json({ message: 'Bond cancelled successfully' });

  } catch (error) {
    console.error('Bonds DELETE error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Bond not found', code: 'BOND_NOT_FOUND' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('already purchased')) {
        return NextResponse.json(
          { error: 'Cannot cancel purchased bond', code: 'BOND_ALREADY_PURCHASED' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Bond cancellation failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}