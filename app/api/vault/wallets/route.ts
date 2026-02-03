import { NextRequest, NextResponse } from 'next/server';
import { Wallet, ApiResponse } from '../types';
import { loadJsonData, saveJsonData, validateWalletAddress, logAuditEntry, generateMockWallets } from '../utils';

const WALLETS_FILE = 'wallets.json';

// Initialize with mock data on first run
async function initializeWallets(): Promise<Wallet[]> {
  let wallets = await loadJsonData<Wallet>(WALLETS_FILE);
  if (wallets.length === 0) {
    wallets = generateMockWallets();
    await saveJsonData(WALLETS_FILE, wallets);
  }
  return wallets;
}

// GET /api/vault/wallets - List all tracked wallets
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Wallet[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const network = searchParams.get('network');

    let wallets = await initializeWallets();

    // Filter inactive wallets unless requested
    if (!includeInactive) {
      wallets = wallets.filter(w => w.isActive);
    }

    // Filter by network if specified
    if (network) {
      wallets = wallets.filter(w => w.network.toLowerCase() === network.toLowerCase());
    }

    // Log audit entry
    await logAuditEntry({
      action: 'wallet_list',
      endpoint: '/api/vault/wallets',
      method: 'GET',
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: wallets,
    });

  } catch (error) {
    console.error('Wallets GET error:', error);
    
    await logAuditEntry({
      action: 'wallet_list_error',
      endpoint: '/api/vault/wallets',
      method: 'GET',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve wallets',
    }, { status: 500 });
  }
}

// POST /api/vault/wallets - Add new wallet to track
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Wallet>>> {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.address || !body.network) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: name, address, network',
      }, { status: 400 });
    }

    // Validate wallet address
    if (!validateWalletAddress(body.address)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid wallet address format',
      }, { status: 400 });
    }

    // Validate network
    const validNetworks = ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism'];
    if (!validNetworks.includes(body.network.toLowerCase())) {
      return NextResponse.json({
        success: false,
        error: `Invalid network. Supported: ${validNetworks.join(', ')}`,
      }, { status: 400 });
    }

    const wallets = await initializeWallets();

    // Check for duplicate address
    const existingWallet = wallets.find(w => 
      w.address.toLowerCase() === body.address.toLowerCase() && 
      w.network.toLowerCase() === body.network.toLowerCase()
    );

    if (existingWallet) {
      return NextResponse.json({
        success: false,
        error: 'Wallet already exists for this address and network',
      }, { status: 409 });
    }

    // Create new wallet
    const newWallet: Wallet = {
      id: `wallet-${crypto.randomUUID()}`,
      name: body.name.trim(),
      address: body.address.toLowerCase(),
      network: body.network.toLowerCase(),
      isActive: body.isActive !== false, // Default to true
      createdAt: new Date().toISOString(),
    };

    wallets.push(newWallet);
    await saveJsonData(WALLETS_FILE, wallets);

    // Log audit entry
    await logAuditEntry({
      action: 'wallet_create',
      endpoint: '/api/vault/wallets',
      method: 'POST',
      walletId: newWallet.id,
      requestBody: { name: body.name, network: body.network },
      responseStatus: 201,
    });

    return NextResponse.json({
      success: true,
      data: newWallet,
    }, { status: 201 });

  } catch (error) {
    console.error('Wallets POST error:', error);
    
    await logAuditEntry({
      action: 'wallet_create_error',
      endpoint: '/api/vault/wallets',
      method: 'POST',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to create wallet',
    }, { status: 500 });
  }
}

// DELETE /api/vault/wallets - Remove wallet from tracking
export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('id');

    if (!walletId) {
      return NextResponse.json({
        success: false,
        error: 'Missing wallet ID parameter',
      }, { status: 400 });
    }

    const wallets = await initializeWallets();
    const walletIndex = wallets.findIndex(w => w.id === walletId);

    if (walletIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Wallet not found',
      }, { status: 404 });
    }

    const removedWallet = wallets[walletIndex];
    wallets.splice(walletIndex, 1);
    await saveJsonData(WALLETS_FILE, wallets);

    // Log audit entry
    await logAuditEntry({
      action: 'wallet_delete',
      endpoint: '/api/vault/wallets',
      method: 'DELETE',
      walletId: removedWallet.id,
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: null,
    });

  } catch (error) {
    console.error('Wallets DELETE error:', error);
    
    await logAuditEntry({
      action: 'wallet_delete_error',
      endpoint: '/api/vault/wallets',
      method: 'DELETE',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to delete wallet',
    }, { status: 500 });
  }
}