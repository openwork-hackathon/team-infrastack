import { NextRequest, NextResponse } from 'next/server';

// AgentVault - Balance Endpoint
// GET /api/vault/balance?address=0x...&chain=base

const RPC_URLS: Record<string, string> = {
  base: 'https://mainnet.base.org',
  ethereum: 'https://eth.llamarpc.com',
};

interface BalanceResponse {
  address: string;
  chain: string;
  balances: {
    native: string;
    nativeFormatted: string;
    tokens?: Array<{
      address: string;
      symbol: string;
      balance: string;
      decimals: number;
    }>;
  };
  timestamp: string;
}

async function getBalance(rpcUrl: string, address: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: 1,
    }),
  });
  
  const data = await response.json();
  return data.result || '0x0';
}

function hexToEth(hex: string): string {
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const chain = searchParams.get('chain') || 'base';

  if (!address) {
    return NextResponse.json(
      { error: 'Missing address parameter' },
      { status: 400 }
    );
  }

  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return NextResponse.json(
      { error: 'Invalid address format' },
      { status: 400 }
    );
  }

  const rpcUrl = RPC_URLS[chain];
  if (!rpcUrl) {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}. Supported: ${Object.keys(RPC_URLS).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const balanceHex = await getBalance(rpcUrl, address);
    const balanceFormatted = hexToEth(balanceHex);

    const response: BalanceResponse = {
      address,
      chain,
      balances: {
        native: balanceHex,
        nativeFormatted: `${balanceFormatted} ETH`,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Balance fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance', details: String(error) },
      { status: 500 }
    );
  }
}
