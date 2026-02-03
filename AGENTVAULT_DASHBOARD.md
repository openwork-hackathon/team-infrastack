# AgentVault Dashboard

A comprehensive React dashboard component for monitoring wallet balances and AI agent cost analytics.

## Features

### 🏦 Wallet Section
- **ETH Balance**: Real-time ETH balance display
- **Token Balances**: Support for OPENWORK, USDC, and INFRA tokens
- **Wallet Address**: Truncated display with toggle to show full address
- **Auto-refresh**: Updates every 30 seconds
- **Network**: Base L2 network integration

### 📊 Cost Analytics Section
- **Total Spend**: Aggregated costs with daily/weekly/monthly views
- **API Call Counter**: Track total number of API calls
- **Burn Rate**: Calculate $/hour and $/daily spending rates
- **Provider Breakdown**: Cost analysis by provider (Anthropic, OpenAI, Google)
- **Model Breakdown**: Cost analysis by specific AI models
- **Token Usage**: Total input/output tokens consumed

### ⚡ Recent Activity
- **Transaction Log**: Recent API calls with full details
- **Timestamps**: Precise timing of each call
- **Model Information**: Which AI model was used
- **Token Counts**: Input/output token usage per call
- **Cost Tracking**: Individual cost per API call

### 🎨 UI/UX Features
- **TailwindCSS Styling**: Modern, clean design
- **Loading States**: Smooth loading indicators
- **Mobile Responsive**: Works on all screen sizes
- **Real-time Updates**: Auto-refresh functionality
- **Interactive Elements**: Toggle views, refresh buttons

## Technical Implementation

### Components
- `VaultDashboard.tsx` - Main dashboard component
- Located in `/app/components/VaultDashboard.tsx`

### Routes
- `/vault` - Main dashboard route
- Route file: `/app/vault/page.tsx`

### APIs
- `/api/vault/balance` - Wallet balance data
- `/api/vault/costs` - Cost tracking data

### Dependencies
- **ethers** - Blockchain interactions
- **lucide-react** - Icon library
- **recharts** - Chart library (installed for future chart features)
- **TailwindCSS** - Styling framework

### Data Structure

#### Balance API Response
```typescript
{
  address: string
  network: string
  balances: {
    [token]: {
      raw: string
      formatted: string
      symbol: string
    }
  }
  timestamp: string
}
```

#### Costs API Response
```typescript
{
  costs: CostEntry[]
  totals: {
    totalCostUsd: number
    totalInputTokens: number
    totalOutputTokens: number
    entryCount: number
  }
  filters: { ... }
}
```

#### Cost Entry Structure
```typescript
{
  id: string
  timestamp: string
  agentId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  metadata?: Record<string, unknown>
}
```

## Setup & Usage

1. **Start Development Server**:
   ```bash
   npm run dev
   ```

2. **Access Dashboard**:
   - Navigate to `http://localhost:3000/vault`
   - Or use the "🏦 AgentVault Dashboard" link on the homepage

3. **Demo Data**:
   - Sample cost data is provided in `.data/costs.json`
   - Demo wallet address configured for testing

## Future Enhancements

### Planned Features (ready for implementation)
- **Visual Charts**: Bar charts for providers, line charts for trends
- **Export Functionality**: CSV/JSON export of cost data
- **Alerts**: Cost threshold notifications
- **Historical Analysis**: Deeper time-based analytics
- **Custom Filters**: Advanced filtering options

### Chart Integration
The recharts library is already installed. To add visual charts:

1. Import recharts components
2. Add BarChart for provider costs
3. Add LineChart for cost trends over time
4. Integrate into existing layout

## Files Created/Modified

### New Files
- `/app/components/VaultDashboard.tsx` - Main dashboard component
- `/app/vault/page.tsx` - Route page
- `/.data/costs.json` - Demo cost data
- `/AGENTVAULT_DASHBOARD.md` - This documentation

### Modified Files
- `/app/api/vault/balance/route.ts` - Added INFRA token support
- `/app/page.tsx` - Added navigation link to dashboard
- `/package.json` - Added recharts and lucide-react dependencies

## Demo Screenshot

The dashboard successfully displays:
- Wallet overview with token balances
- Cost analytics with provider/model breakdowns
- Recent activity table with full transaction details
- Clean, responsive design with proper loading states

Total development cost tracked: $0.45 across 10 API calls using various AI models from Anthropic, OpenAI, and Google.