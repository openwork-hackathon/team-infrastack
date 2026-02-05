import { NextRequest, NextResponse } from 'next/server';

// DEX Swap via Li.Fi aggregator
// https://docs.li.fi/

const LIFI_API = 'https://li.quest/v1';

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
};

const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  1: { // Ethereum
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  137: { // Polygon
    MATIC: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  8453: { // Base
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  42161: { // Arbitrum
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  10: { // Optimism
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
};

function resolveToken(symbolOrAddress: string, chainId: number): string {
  if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) {
    return symbolOrAddress;
  }
  
  const chainTokens = TOKEN_ADDRESSES[chainId];
  if (!chainTokens) throw new Error(`No token registry for chain ${chainId}`);
  
  const address = chainTokens[symbolOrAddress.toUpperCase()];
  if (!address) throw new Error(`Token ${symbolOrAddress} not found. Available: ${Object.keys(chainTokens).join(', ')}`);
  
  return address;
}

function getDecimals(symbol: string): number {
  const stables = ['USDC', 'USDT'];
  return stables.includes(symbol.toUpperCase()) ? 6 : 18;
}

// POST /api/treasury/swap - Get swap quote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { fromToken, toToken, amount, chain, walletAddress } = body;
    
    if (!fromToken || !toToken || !amount || !chain || !walletAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: fromToken, toToken, amount, chain, walletAddress' 
      }, { status: 400 });
    }

    const chainId = CHAIN_IDS[chain.toLowerCase()];
    if (!chainId) {
      return NextResponse.json({ 
        success: false, 
        error: `Unknown chain: ${chain}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}` 
      }, { status: 400 });
    }

    let fromTokenAddress: string;
    let toTokenAddress: string;
    
    try {
      fromTokenAddress = resolveToken(fromToken, chainId);
      toTokenAddress = resolveToken(toToken, chainId);
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    const fromDecimals = getDecimals(fromToken);
    const toDecimals = getDecimals(toToken);
    const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals))).toString();

    const params = new URLSearchParams({
      fromChain: chainId.toString(),
      toChain: chainId.toString(),
      fromToken: fromTokenAddress,
      toToken: toTokenAddress,
      fromAmount: amountWei,
      fromAddress: walletAddress,
      slippage: ((body.slippage || 0.01) * 100).toString(), // Li.Fi uses percentage
    });

    const response = await fetch(`${LIFI_API}/quote?${params}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return NextResponse.json({ 
        success: false, 
        error: `Swap quote failed: ${error.message || response.statusText}` 
      }, { status: response.status });
    }

    const data = await response.json();
    
    const outputAmount = (parseFloat(data.estimate?.toAmount || '0') / Math.pow(10, toDecimals)).toFixed(6);
    const outputAmountMin = (parseFloat(data.estimate?.toAmountMin || '0') / Math.pow(10, toDecimals)).toFixed(6);

    // Format route
    const route = data.includedSteps?.map((step: any) => step.toolDetails?.name || step.tool).join(' → ') 
      || data.toolDetails?.name 
      || 'Direct swap';

    return NextResponse.json({
      success: true,
      data: {
        quote: {
          fromToken,
          toToken,
          fromAmount: amount,
          toAmount: outputAmount,
          toAmountMin: outputAmountMin,
          priceImpact: data.estimate?.priceImpact || '0',
          route,
          chain,
        },
        provider: 'Li.Fi',
        // Include tx data if caller wants to execute
        transactionData: data.transactionRequest ? {
          to: data.transactionRequest.to,
          data: data.transactionRequest.data,
          value: data.transactionRequest.value || '0',
          gasLimit: data.transactionRequest.gasLimit || '0',
          chainId,
        } : undefined,
        approvalNeeded: data.estimate?.approvalAddress ? {
          tokenAddress: fromTokenAddress,
          spender: data.estimate.approvalAddress,
          amount: amountWei,
        } : undefined,
      },
    });
  } catch (error) {
    console.error('Swap quote error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get swap quote' }, { status: 500 });
  }
}

// GET /api/treasury/swap/tokens?chain=base - Get supported tokens for a chain
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get('chain') || 'base';

    const chainId = CHAIN_IDS[chain.toLowerCase()];
    if (!chainId) {
      return NextResponse.json({ 
        success: false, 
        error: `Unknown chain: ${chain}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}` 
      }, { status: 400 });
    }

    const tokens = TOKEN_ADDRESSES[chainId] || {};

    return NextResponse.json({
      success: true,
      data: {
        chain,
        chainId,
        tokens: Object.entries(tokens).map(([symbol, address]) => ({ symbol, address })),
      },
    });
  } catch (error) {
    console.error('Swap tokens error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get tokens' }, { status: 500 });
  }
}
