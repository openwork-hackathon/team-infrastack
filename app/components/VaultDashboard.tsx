'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
  RefreshCw, 
  Wallet, 
  TrendingUp, 
  Activity, 
  DollarSign, 
  Eye, 
  EyeOff,
  Clock,
  Server,
  Zap
} from 'lucide-react'

// Types
interface TokenBalance {
  raw: string
  formatted: string
  symbol: string
}

interface Balance {
  address: string
  network: string
  balances: Record<string, TokenBalance>
  timestamp: string
}

interface CostEntry {
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

interface CostTotals {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  entryCount: number
}

interface CostData {
  costs: CostEntry[]
  totals: CostTotals
  filters: {
    agentId: string | null
    provider: string | null
    since: string | null
    limit: number
  }
}

// Mock wallet address for demo - replace with actual connected wallet
const DEMO_WALLET_ADDRESS = '0x742d35cc6634c0532925a3b8d43d3dd34ee7ef5f'

const VaultDashboard: React.FC = () => {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [costData, setCostData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [showFullAddress, setShowFullAddress] = useState(false)

  // Fetch balance data
  const fetchBalance = useCallback(async () => {
    try {
      const response = await fetch(`/api/vault/balance?address=${DEMO_WALLET_ADDRESS}`)
      if (!response.ok) throw new Error('Failed to fetch balance')
      const data: Balance = await response.json()
      setBalance(data)
    } catch (error) {
      console.error('Error fetching balance:', error)
    }
  }, [])

  // Fetch cost data
  const fetchCostData = useCallback(async () => {
    try {
      const since = new Date()
      switch (timeframe) {
        case 'daily':
          since.setDate(since.getDate() - 1)
          break
        case 'weekly':
          since.setDate(since.getDate() - 7)
          break
        case 'monthly':
          since.setDate(since.getDate() - 30)
          break
      }
      
      const response = await fetch(`/api/vault/costs?since=${since.toISOString()}&limit=50`)
      if (!response.ok) throw new Error('Failed to fetch costs')
      const data: CostData = await response.json()
      setCostData(data)
    } catch (error) {
      console.error('Error fetching cost data:', error)
    }
  }, [timeframe])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchBalance(), fetchCostData()])
      setLoading(false)
    }
    loadData()
  }, [fetchBalance, fetchCostData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBalance()
      fetchCostData()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchBalance, fetchCostData])

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchBalance(), fetchCostData()])
    setRefreshing(false)
  }

  // Truncate address helper
  const truncateAddress = (address: string) => {
    if (!address) return ''
    return showFullAddress ? address : `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Calculate burn rate
  const calculateBurnRate = () => {
    if (!costData?.totals) return { hourly: 0, daily: 0 }
    
    const hoursInTimeframe = timeframe === 'daily' ? 24 : timeframe === 'weekly' ? 168 : 720
    const hourly = costData.totals.totalCostUsd / hoursInTimeframe
    const daily = hourly * 24
    
    return { hourly, daily }
  }

  // Group costs by provider
  const getCostsByProvider = () => {
    if (!costData?.costs) return {}
    
    return costData.costs.reduce((acc, cost) => {
      acc[cost.provider] = (acc[cost.provider] || 0) + cost.costUsd
      return acc
    }, {} as Record<string, number>)
  }

  // Group costs by model
  const getCostsByModel = () => {
    if (!costData?.costs) return {}
    
    return costData.costs.reduce((acc, cost) => {
      acc[cost.model] = (acc[cost.model] || 0) + cost.costUsd
      return acc
    }, {} as Record<string, number>)
  }

  const burnRate = calculateBurnRate()
  const costsByProvider = getCostsByProvider()
  const costsByModel = getCostsByModel()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading AgentVault Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Wallet className="h-6 w-6 mr-2 text-blue-500" />
              AgentVault Dashboard
            </h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Wallet Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Wallet className="h-5 w-5 mr-2" />
            Wallet Overview
          </h2>
          
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6">
              {/* Wallet Address */}
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Wallet Address</span>
                  <button
                    onClick={() => setShowFullAddress(!showFullAddress)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    {showFullAddress ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <span className="text-lg font-mono text-gray-900">
                  {balance ? truncateAddress(balance.address) : 'Loading...'}
                </span>
              </div>

              {/* Token Balances */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {balance?.balances && Object.entries(balance.balances).map(([token, data]) => (
                  <div key={token} className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500">{data.symbol}</div>
                    <div className="text-xl font-bold text-gray-900">
                      {parseFloat(data.formatted).toFixed(token === 'ETH' ? 4 : 2)}
                    </div>
                  </div>
                ))}
              </div>

              {balance?.timestamp && (
                <div className="mt-4 text-xs text-gray-500">
                  Last updated: {new Date(balance.timestamp).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cost Analytics Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Cost Analytics
            </h2>
            
            {/* Timeframe Selector */}
            <div className="flex rounded-md shadow-sm">
              {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimeframe(period)}
                  className={`px-4 py-2 text-sm font-medium first:rounded-l-md last:rounded-r-md border ${
                    timeframe === period
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Spend</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${costData?.totals.totalCostUsd.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Activity className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">API Calls</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {costData?.totals.entryCount || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-orange-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Burn Rate (Daily)</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${burnRate.daily.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Zap className="h-8 w-8 text-purple-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Tokens Used</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {((costData?.totals.totalInputTokens || 0) + (costData?.totals.totalOutputTokens || 0)).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Provider */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Server className="h-5 w-5 mr-2" />
                Cost by Provider
              </h3>
              <div className="space-y-3">
                {Object.entries(costsByProvider).map(([provider, cost]) => (
                  <div key={provider} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">{provider}</span>
                    <span className="text-sm font-bold text-gray-900">${cost.toFixed(2)}</span>
                  </div>
                ))}
                {Object.keys(costsByProvider).length === 0 && (
                  <p className="text-gray-500 text-sm">No data available</p>
                )}
              </div>
            </div>

            {/* By Model */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Cost by Model</h3>
              <div className="space-y-3">
                {Object.entries(costsByModel).map(([model, cost]) => (
                  <div key={model} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 truncate pr-2">
                      {model}
                    </span>
                    <span className="text-sm font-bold text-gray-900">${cost.toFixed(2)}</span>
                  </div>
                ))}
                {Object.keys(costsByModel).length === 0 && (
                  <p className="text-gray-500 text-sm">No data available</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Recent Activity
          </h2>
          
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              {costData?.costs && costData.costs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Provider
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tokens
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {costData.costs.slice(0, 10).map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(entry.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {entry.provider}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {entry.model}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {(entry.inputTokens + entry.outputTokens).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            ${entry.costUsd.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No recent activity data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VaultDashboard