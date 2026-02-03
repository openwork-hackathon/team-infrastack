// Enterprise AgentVault Types

export interface Wallet {
  id: string;
  name: string;
  address: string;
  network: string;
  isActive: boolean;
  createdAt: string;
  lastSynced?: string;
}

export interface Budget {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly';
  limit: number; // USD
  spent: number; // USD
  remaining: number; // USD
  percentageUsed: number;
  walletId?: string; // Optional: budget can be global or per-wallet
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface Alert {
  id: string;
  name: string;
  budgetId: string;
  thresholdPercentage: number; // 50, 75, 90, etc.
  webhookUrl?: string;
  emailAddress?: string;
  isActive: boolean;
  lastTriggered?: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string; // 'api_call', 'budget_set', 'alert_triggered', etc.
  endpoint: string;
  method: string;
  walletId?: string;
  model?: string;
  provider?: string;
  tokens?: number;
  cost?: number;
  caller?: string; // IP or API key identifier
  requestBody?: Record<string, unknown>;
  responseStatus: number;
  userAgent?: string;
}

export interface SpendingForecast {
  daily: {
    current: number;
    projected: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  weekly: {
    current: number;
    projected: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  monthly: {
    current: number;
    projected: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  runway: {
    days: number;
    estimate: string; // Human readable: "2.5 months"
    confidence: 'low' | 'medium' | 'high';
  };
  burnRate: {
    dailyAverage: number;
    weeklyAverage: number;
    monthlyAverage: number;
  };
  generatedAt: string;
}

// Utility types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}