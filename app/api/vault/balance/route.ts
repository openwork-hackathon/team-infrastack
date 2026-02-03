import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Base L2 RPC endpoints
const BASE_RPC = 'https://mainnet.base.org';

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// Known tokens on Base
const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  OPENWORK: {
    address: '0x299c30DD5974BF4D5bFE42C340CA40462816AB07',
    symbol: '$OPENWORK',
    decimals: 18,
  },
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
  },
  INFRA: {
    address: '0x0000000000000000000000000000000000000000', // Placeholder - replace with actual INFRA token address
    symbol: 'INFRA',
    decimals: 18,
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('address');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Missing address parameter' },
        { status: 400 }
      );
    }

    // Validate address
    if (!ethers.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC);

    // Get ETH balance
    const ethBalance = await provider.getBalance(walletAddress);

    // Get token balances
    const tokenBalances: Record<string, { raw: string; formatted: string; symbol: string }> = {};

    for (const [name, token] of Object.entries(TOKENS)) {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
        const balance = await contract.balanceOf(walletAddress);
        tokenBalances[name] = {
          raw: balance.toString(),
          formatted: ethers.formatUnits(balance, token.decimals),
          symbol: token.symbol,
        };
      } catch (err) {
        console.error(`Error fetching ${name} balance:`, err);
        tokenBalances[name] = {
          raw: '0',
          formatted: '0',
          symbol: token.symbol,
        };
      }
    }

    return NextResponse.json({
      address: walletAddress,
      network: 'base',
      balances: {
        ETH: {
          raw: ethBalance.toString(),
          formatted: ethers.formatEther(ethBalance),
          symbol: 'ETH',
        },
        ...tokenBalances,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Balance API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balances' },
      { status: 500 }
    );
  }
}
