import { NextRequest, NextResponse } from 'next/server';
import { Wallet, ApiResponse } from '../types';
import { loadJsonData, saveJsonData, validateWalletAddress, logAuditEntry, generateMockWallets } from '../utils';
import { validateRequest, schemas } from '../../../lib/security/validation';
import { withErrorHandling, createSafeError } from '../../../lib/security/errors';
import { rateLimitVault } from '../../../lib/security/rate-limiter';

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
export const GET = withErrorHandling(async (request: NextRequest): Promise<NextResponse<ApiResponse<Wallet[]>>> => {
  // Apply rate limiting (lighter for read operations)
  const rateLimitResult = await rateLimitVault(request);
  if (!rateLimitResult.success) {
    throw createSafeError('RATE_LIMIT_EXCEEDED', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetTime: rateLimitResult.resetTime
    }, rateLimitResult.error);
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const network = searchParams.get('network');

  // Validate network parameter if provided
  if (network) {
    const validNetworks = ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism'];
    if (!validNetworks.includes(network.toLowerCase())) {
      throw createSafeError('VALIDATION_ERROR', {
        field: 'network',
        expected: validNetworks.join(', ')
      });
    }
  }

  let wallets = await initializeWallets();

  // Filter inactive wallets unless requested
  if (!includeInactive) {
    wallets = wallets.filter(w => w.isActive);
  }

  // Filter by network if specified (using validated network)
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

  // Return success response with rate limit headers
  const response = NextResponse.json({
    success: true,
    data: wallets,
  });
  
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());
  
  return response;
});

// POST /api/vault/wallets - Add new wallet to track
export const POST = withErrorHandling(async (request: NextRequest): Promise<NextResponse<ApiResponse<Wallet>>> => {
  // Apply rate limiting
  const rateLimitResult = await rateLimitVault(request);
  if (!rateLimitResult.success) {
    throw createSafeError('RATE_LIMIT_EXCEEDED', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetTime: rateLimitResult.resetTime
    }, rateLimitResult.error);
  }

  // Validate request input
  const validation = await validateRequest(request, schemas.wallet.create);
  if (!validation.success) {
    throw createSafeError('VALIDATION_ERROR', { error: validation.error });
  }

  const wallets = await initializeWallets();

  // Check for duplicate address (using validated data)
  const existingWallet = wallets.find(w => 
    w.address.toLowerCase() === validation.data.address.toLowerCase() && 
    w.network.toLowerCase() === validation.data.network.toLowerCase()
  );

  if (existingWallet) {
    throw createSafeError('ALREADY_EXISTS', { 
      resource: `wallet for address ${validation.data.address} on ${validation.data.network}`
    });
  }

  // Create new wallet with validated data
  const newWallet: Wallet = {
    id: `wallet-${crypto.randomUUID()}`,
    name: validation.data.name.trim(),
    address: validation.data.address.toLowerCase(),
    network: validation.data.network.toLowerCase(),
    isActive: validation.data.isActive !== false, // Default to true
    createdAt: new Date().toISOString(),
  };

  wallets.push(newWallet);
  await saveJsonData(WALLETS_FILE, wallets);

  // Log audit entry (with sanitized data)
  await logAuditEntry({
    action: 'wallet_create',
    endpoint: '/api/vault/wallets',
    method: 'POST',
    walletId: newWallet.id,
    requestBody: { name: validation.data.name, network: validation.data.network },
    responseStatus: 201,
  });

  // Return success response with rate limit headers
  const response = NextResponse.json({
    success: true,
    data: newWallet,
  }, { status: 201 });
  
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());
  
  return response;
});

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