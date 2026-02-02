# InfraStack Token Setup Guide - Mint Club V2

## Overview

This guide documents the complete process for creating the $INFRASTACK token using Mint Club V2 on the Base network. Mint Club V2 enables creation of bonding curve-backed tokens using any ERC20 token as the reserve asset.

## Token Specifications

- **Name**: "InfraStack"  
- **Symbol**: "INFRASTACK"
- **Network**: Base
- **Reserve Token**: $OPENWORK (0x299c30DD5974BF4D5bFE42C340CA40462816AB07)
- **Max Supply**: 1,000,000 tokens
- **Royalties**: 1% mint fee, 1% burn fee

## Contract Addresses on Base

- **MCV2_Bond Contract**: `0xc5a076cad94176c2996B32d8466Be1cE757FAa27`
- **$OPENWORK Token**: `0x299c30DD5974BF4D5bFE42C340CA40462816AB07`
- **Base WETH**: `0x4200000000000000000000000000000000000006` (for reference)

## Required Parameters for Token Creation

### 1. Basic Token Info
```javascript
const tokenConfig = {
  name: "InfraStack",
  symbol: "INFRASTACK", // Note: Symbol is set automatically by SDK
  reserveToken: {
    address: "0x299c30DD5974BF4D5bFE42C340CA40462816AB07", // $OPENWORK
    decimals: 18 // Assumed standard ERC20 decimals
  }
}
```

### 2. Bonding Curve Configuration
```javascript
const curveData = {
  curveType: "EXPONENTIAL",           // Exponential price curve
  stepCount: 20,                      // 20 price intervals for granularity
  maxSupply: 1_000_000,              // 1M max supply
  initialMintingPrice: 0.001,        // Starting price: 0.001 $OPENWORK
  finalMintingPrice: 1.0,            // Ending price: 1.0 $OPENWORK 
  creatorAllocation: 10_000,         // 10k initial allocation (1%)
  mintRoyalty: 100,                  // 1% mint royalty (100 basis points)
  burnRoyalty: 100                   // 1% burn royalty (100 basis points)
}
```

### 3. Recommended Bonding Curve Settings

**Why Exponential Curve?**
- Creates stronger price appreciation incentives
- Better for tokens expected to gain adoption over time
- Rewards early adopters more significantly

**Price Range Rationale:**
- **Initial**: 0.001 $OPENWORK (~$0.001-0.01 depending on $OPENWORK price)
- **Final**: 1.0 $OPENWORK (~$1-10 depending on $OPENWORK price)
- **1000x price multiplier** creates strong incentive structure

**Step Count (20 intervals):**
- More granular than minimum (10) for smoother price discovery
- Not excessive (50+) which could increase gas costs
- Good balance for 1M token supply

## Implementation with Ethers.js

### Setup and Dependencies

```bash
npm install mint.club-v2-sdk ethers@^6
```

### Complete Token Creation Script

```javascript
import { ethers } from 'ethers';
import { mintclub } from 'mint.club-v2-sdk';

// Setup provider and signer
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const privateKey = process.env.PRIVATE_KEY; // Your deployer private key
const signer = new ethers.Wallet(privateKey, provider);

// Initialize Mint Club SDK for Base network
const infraStackToken = mintclub.network('base').token('INFRASTACK');

async function createInfraStackToken() {
  try {
    // Step 1: Check $OPENWORK balance and allowance
    const openworkContract = new ethers.Contract(
      '0x299c30DD5974BF4D5bFE42C340CA40462816AB07',
      [
        'function balanceOf(address) view returns (uint256)',
        'function allowance(address,address) view returns (uint256)',
        'function approve(address,uint256) returns (bool)',
        'function decimals() view returns (uint8)'
      ],
      signer
    );
    
    const balance = await openworkContract.balanceOf(await signer.getAddress());
    console.log('$OPENWORK Balance:', ethers.formatEther(balance));
    
    // Step 2: Calculate required $OPENWORK for initial allocation
    // For 10k initial tokens at 0.001 $OPENWORK starting price
    const requiredOpenwork = ethers.parseEther('10'); // Approximate initial requirement
    
    if (balance < requiredOpenwork) {
      throw new Error(`Insufficient $OPENWORK balance. Need: ${ethers.formatEther(requiredOpenwork)}`);
    }
    
    // Step 3: Approve $OPENWORK spending for MCV2_Bond contract
    const bondContract = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
    const currentAllowance = await openworkContract.allowance(await signer.getAddress(), bondContract);
    
    if (currentAllowance < requiredOpenwork) {
      console.log('Approving $OPENWORK spending...');
      const approveTx = await openworkContract.approve(bondContract, ethers.MaxUint256);
      await approveTx.wait();
      console.log('Approval confirmed:', approveTx.hash);
    }
    
    // Step 4: Create the token using Mint Club V2 SDK
    console.log('Creating InfraStack token...');
    const createTx = await infraStackToken.create({
      name: 'InfraStack',
      reserveToken: {
        address: '0x299c30DD5974BF4D5bFE42C340CA40462816AB07',
        decimals: 18,
      },
      curveData: {
        curveType: 'EXPONENTIAL',
        stepCount: 20,
        maxSupply: 1_000_000,
        initialMintingPrice: 0.001,
        finalMintingPrice: 1.0,
        creatorAllocation: 10_000,
        mintRoyalty: 100,  // 1%
        burnRoyalty: 100   // 1%
      },
    });
    
    console.log('Token creation transaction:', createTx.hash);
    await createTx.wait();
    console.log('✅ InfraStack token created successfully!');
    
    // Step 5: Get the deployed token address
    const tokenAddress = await infraStackToken.address();
    console.log('Token deployed at:', tokenAddress);
    
    return tokenAddress;
    
  } catch (error) {
    console.error('❌ Token creation failed:', error);
    throw error;
  }
}

// Execute the creation
createInfraStackToken()
  .then(address => console.log('🎉 Process completed. Token address:', address))
  .catch(console.error);
```

### Alternative: Direct Contract Interaction

If the SDK fails, here's the direct contract approach:

```javascript
// Direct contract interaction (fallback method)
async function createTokenDirect() {
  const bondContract = new ethers.Contract(
    '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
    [
      // ABI methods for token creation - would need full ABI
      'function createToken(...) returns (address)'
    ],
    signer
  );
  
  // Note: Full ABI and exact parameters would need to be obtained
  // from the contract verification on Basescan
}
```

## $OPENWORK Requirements

### Minimum Required Amount

**For Initial Allocation (10,000 tokens at 0.001 starting price):**
- Base requirement: ~10 $OPENWORK
- Plus gas fees: ~0.1 $OPENWORK equivalent
- **Recommended minimum**: 15-20 $OPENWORK

### Approval Process

```javascript
// Approve maximum amount to avoid future approval transactions
const openworkContract = new ethers.Contract(
  '0x299c30DD5974BF4D5bFE42C340CA40462816AB07',
  ['function approve(address,uint256) returns (bool)'],
  signer
);

const approveTx = await openworkContract.approve(
  '0xc5a076cad94176c2996B32d8466Be1cE757FAa27', // MCV2_Bond
  ethers.MaxUint256 // Maximum approval
);
```

## Gas Estimates on Base Network

### Token Creation Transaction
- **Estimated Gas**: 500,000 - 800,000 gas
- **Base Gas Price**: ~0.1 Gwei average
- **Cost in ETH**: ~0.00005 - 0.00008 ETH
- **Cost in USD**: ~$0.10 - $0.20 (at $2500 ETH)

### Approval Transaction  
- **Estimated Gas**: ~50,000 gas
- **Cost in ETH**: ~0.000005 ETH
- **Cost in USD**: ~$0.01

### Total Estimated Costs
- **Gas fees**: ~$0.20
- **Initial token purchase**: 10 $OPENWORK (price dependent)
- **Total**: 10 $OPENWORK + ~$0.20 gas

## Step-by-Step Deployment Process

1. **Preparation**
   - Ensure sufficient ETH on Base for gas fees
   - Ensure sufficient $OPENWORK balance (15-20 tokens recommended)
   - Have deployer wallet private key ready

2. **Pre-deployment Checks**
   ```bash
   # Check Base ETH balance
   cast balance YOUR_ADDRESS --rpc-url https://mainnet.base.org
   
   # Check $OPENWORK balance
   cast call 0x299c30DD5974BF4D5bFE42C340CA40462816AB07 \
     "balanceOf(address)(uint256)" YOUR_ADDRESS \
     --rpc-url https://mainnet.base.org
   ```

3. **Execute Deployment**
   - Run the token creation script
   - Monitor transaction confirmations
   - Save the deployed token address

4. **Post-deployment Verification**
   - Verify token appears in wallet
   - Check initial supply allocation
   - Test basic buy/sell functionality

## Troubleshooting

### Common Issues

**"Insufficient Balance" Error:**
- Check $OPENWORK balance is sufficient
- Verify ETH balance for gas fees

**"Allowance Too Low" Error:**
- Increase approval amount for MCV2_Bond contract
- Use `ethers.MaxUint256` for maximum approval

**Gas Estimation Failures:**
- Manually set gas limit to 800,000
- Increase gas price during network congestion

### Emergency Contacts

If deployment fails and manual intervention needed:
- Check Base network status: https://status.base.org/
- Review transaction on BaseScan: https://basescan.org/
- Mint Club Discord: https://discord.gg/mintclub

## Security Considerations

1. **Private Key Security**: Never commit private keys to version control
2. **Contract Verification**: Verify all contract addresses on BaseScan
3. **Test First**: Consider deploying on Base Sepolia testnet first
4. **Slippage Protection**: Monitor for MEV attacks during creation
5. **Royalty Settings**: 1% fees are reasonable but review impact on trading

## Next Steps After Creation

1. **Add to DEX**: Consider adding liquidity to Base DEXes
2. **Token Verification**: Submit token info to CoinGecko/CoinMarketCap  
3. **Community Building**: Announce on social media and hackathon channels
4. **Trading Interface**: Build custom trading UI or use Mint Club interface
5. **Analytics**: Monitor bonding curve performance and trading volume

---

**Created**: 2026-02-02 for InfraStack Hackathon
**Network**: Base Mainnet
**Last Updated**: 2026-02-02