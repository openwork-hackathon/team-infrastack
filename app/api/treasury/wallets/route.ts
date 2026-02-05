import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Treasury wallet management - create and track wallets for agents

const CHAIN_CONFIG: Record<string, { name: string; rpc: string; explorer: string }> = {
  eth: { name: 'Ethereum', rpc: 'https://eth.llamarpc.com', explorer: 'https://etherscan.io' },
  polygon: { name: 'Polygon', rpc: 'https://polygon-rpc.com', explorer: 'https://polygonscan.com' },
  base: { name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
  arbitrum: { name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io' },
  optimism: { name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io' },
};

interface WalletResponse {
  address: string;
  chains: string[];
  note: string;
  createdAt: string;
  // Private key only included if explicitly requested
  privateKey?: string;
  mnemonic?: string;
}

// POST /api/treasury/wallets - Create a new wallet
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const includeSecrets = body.includeSecrets === true; // Must explicitly request
    const label = body.label || 'Agent Treasury';

    // Generate new HD wallet
    const wallet = ethers.Wallet.createRandom();
    
    const response: WalletResponse = {
      address: wallet.address,
      chains: Object.keys(CHAIN_CONFIG),
      note: 'This address works on all EVM chains (Ethereum, Polygon, Base, Arbitrum, Optimism)',
      createdAt: new Date().toISOString(),
    };

    // Only include secrets if explicitly requested
    // ⚠️ In production, these should be encrypted before sending
    if (includeSecrets) {
      response.privateKey = wallet.privateKey;
      response.mnemonic = wallet.mnemonic?.phrase;
    }

    return NextResponse.json({
      success: true,
      data: response,
      warning: includeSecrets 
        ? '⚠️ SAVE YOUR PRIVATE KEY AND MNEMONIC SECURELY. They will not be stored or shown again!'
        : 'Set includeSecrets: true to receive private key (one-time only)',
    }, { status: 201 });
  } catch (error) {
    console.error('Wallet creation error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create wallet' }, { status: 500 });
  }
}

// GET /api/treasury/wallets?address=0x...&chain=eth - Get wallet balance
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const chain = searchParams.get('chain') || 'eth';

    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address parameter' }, { status: 400 });
    }

    if (!ethers.isAddress(address)) {
      return NextResponse.json({ success: false, error: 'Invalid Ethereum address' }, { status: 400 });
    }

    const chainConfig = CHAIN_CONFIG[chain];
    if (!chainConfig) {
      return NextResponse.json({ 
        success: false, 
        error: `Unknown chain: ${chain}. Supported: ${Object.keys(CHAIN_CONFIG).join(', ')}` 
      }, { status: 400 });
    }

    // Get balance
    const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    const balance = await provider.getBalance(address);
    const nativeBalance = ethers.formatEther(balance);

    return NextResponse.json({
      success: true,
      data: {
        address,
        chain,
        chainName: chainConfig.name,
        nativeBalance,
        nativeSymbol: chain === 'polygon' ? 'MATIC' : 'ETH',
        explorerUrl: `${chainConfig.explorer}/address/${address}`,
      },
    });
  } catch (error) {
    console.error('Wallet balance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get wallet balance' }, { status: 500 });
  }
}
