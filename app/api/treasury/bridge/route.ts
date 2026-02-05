import { NextRequest, NextResponse } from 'next/server';

// Cross-chain bridging via Across Protocol
// https://docs.across.to/reference/api-reference

const ACROSS_API = 'https://app.across.to/api';

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
};

const TOKENS: Record<string, Record<string, string>> = {
  ethereum: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  polygon: {
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  base: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  arbitrum: {
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  optimism: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
};

function resolveToken(symbol: string, chain: string): string {
  const chainTokens = TOKENS[chain.toLowerCase()];
  if (!chainTokens) throw new Error(`Unknown chain: ${chain}`);
  
  const address = chainTokens[symbol.toUpperCase()];
  if (!address) throw new Error(`Token ${symbol} not found on ${chain}. Available: ${Object.keys(chainTokens).join(', ')}`);
  
  return address;
}

function getDecimals(symbol: string): number {
  const stables = ['USDC', 'USDT'];
  return stables.includes(symbol.toUpperCase()) ? 6 : 18;
}

// POST /api/treasury/bridge - Get bridge quote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { token, amount, from, to, depositor } = body;
    
    if (!token || !amount || !from || !to || !depositor) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: token, amount, from, to, depositor' 
      }, { status: 400 });
    }

    const fromChainId = CHAIN_IDS[from.toLowerCase()];
    const toChainId = CHAIN_IDS[to.toLowerCase()];
    
    if (!fromChainId) {
      return NextResponse.json({ success: false, error: `Unknown source chain: ${from}` }, { status: 400 });
    }
    if (!toChainId) {
      return NextResponse.json({ success: false, error: `Unknown destination chain: ${to}` }, { status: 400 });
    }

    let inputToken: string;
    let outputToken: string;
    
    try {
      inputToken = resolveToken(token, from);
      outputToken = resolveToken(token, to);
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    const decimals = getDecimals(token);
    const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals))).toString();

    const params = new URLSearchParams({
      tradeType: 'exactInput',
      amount: amountWei,
      inputToken,
      outputToken,
      originChainId: fromChainId.toString(),
      destinationChainId: toChainId.toString(),
      depositor,
      recipient: body.recipient || depositor,
      slippage: (body.slippage || 0.005).toString(),
    });

    const response = await fetch(`${ACROSS_API}/swap/approval?${params}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        success: false, 
        error: `Across API error: ${errorText}` 
      }, { status: response.status });
    }

    const data = await response.json();
    
    // Parse response
    const outputAmountWei = data.quote?.outputAmount || '0';
    const outputAmount = (parseFloat(outputAmountWei) / Math.pow(10, decimals)).toFixed(6);
    
    const feePercent = ((parseFloat(amount) - parseFloat(outputAmount)) / parseFloat(amount) * 100).toFixed(3);

    return NextResponse.json({
      success: true,
      data: {
        quote: {
          inputToken: token,
          outputToken: token,
          inputAmount: amount,
          outputAmount,
          feePercent: `${feePercent}%`,
          estimatedFillTime: data.quote?.estimatedFillTimeSec || 120,
          fromChain: from,
          toChain: to,
        },
        route: `${from} → ${to}`,
        provider: 'Across Protocol',
        // Include tx data if caller wants to execute
        transactionData: data.depositTxn ? {
          to: data.depositTxn.to,
          data: data.depositTxn.data,
          value: data.depositTxn.value || '0',
          chainId: fromChainId,
        } : undefined,
        approvalNeeded: data.approvalTxns?.length > 0 ? {
          tokenAddress: inputToken,
          spender: data.approvalTxns[0]?.to,
        } : undefined,
      },
    });
  } catch (error) {
    console.error('Bridge quote error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get bridge quote' }, { status: 500 });
  }
}

// GET /api/treasury/bridge/routes - Get supported routes
export async function GET(request: NextRequest) {
  try {
    const routes = [];
    const chains = Object.keys(CHAIN_IDS);
    
    for (const from of chains) {
      for (const to of chains) {
        if (from !== to) {
          const tokens = Object.keys(TOKENS[from] || {}).filter(
            t => TOKENS[to]?.[t] // Token exists on both chains
          );
          if (tokens.length > 0) {
            routes.push({ from, to, tokens });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        chains: Object.keys(CHAIN_IDS),
        tokens: Object.keys(TOKENS.ethereum), // Common tokens
        routes,
        provider: 'Across Protocol',
      },
    });
  } catch (error) {
    console.error('Bridge routes error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get bridge routes' }, { status: 500 });
  }
}
