import { NextRequest, NextResponse } from 'next/server';
import { SpendingForecast, ApiResponse, AuditEntry } from '../types';
import { loadJsonData, logAuditEntry, calculateBurnRate } from '../utils';

// Helper function to calculate trend
function calculateTrend(current: number, historical: number[]): 'increasing' | 'decreasing' | 'stable' {
  if (historical.length < 2) return 'stable';
  
  const recent = historical.slice(-3); // Last 3 periods
  const older = historical.slice(0, -3); // Earlier periods
  
  if (recent.length === 0 || older.length === 0) return 'stable';
  
  const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
  const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
  
  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  if (changePercent > 10) return 'increasing';
  if (changePercent < -10) return 'decreasing';
  return 'stable';
}

// Helper function to calculate confidence level
function calculateConfidence(dataPoints: number, variance: number): 'low' | 'medium' | 'high' {
  if (dataPoints < 7) return 'low';
  if (dataPoints < 14 || variance > 50) return 'medium';
  return 'high';
}

// Helper function to format runway estimate
function formatRunwayEstimate(days: number): string {
  if (days < 1) return 'Less than 1 day';
  if (days === 1) return '1 day';
  if (days < 7) return `${Math.round(days)} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

// Generate mock historical spending data for demo
function generateMockSpendingHistory(): number[] {
  const days = 30;
  const baseSpend = 15; // Base daily spend
  const variance = 5; // Variance in spending
  const trend = 0.05; // 5% daily increase trend
  
  const history = [];
  for (let i = 0; i < days; i++) {
    const daySpend = baseSpend + 
      (Math.random() - 0.5) * variance + // Random variance
      (i * trend); // Increasing trend
    history.push(Math.max(0, daySpend));
  }
  
  return history;
}

// Calculate spending forecast based on historical data
async function calculateSpendingForecast(walletId?: string): Promise<SpendingForecast> {
  // In a real implementation, this would:
  // 1. Query audit entries for spending data
  // 2. Query costs API for detailed spending
  // 3. Factor in wallet-specific spending if walletId provided
  
  // For demo, we'll use mock data and some real audit data
  const auditEntries = await loadJsonData<AuditEntry>('audit.json');
  const spendingHistory = generateMockSpendingHistory();
  
  // Calculate current periods
  const now = new Date();
  const today = spendingHistory[spendingHistory.length - 1] || 20;
  const currentWeek = spendingHistory.slice(-7).reduce((sum, val) => sum + val, 0);
  const currentMonth = spendingHistory.reduce((sum, val) => sum + val, 0);
  
  // Calculate averages for projection
  const dailyAvg = spendingHistory.reduce((sum, val) => sum + val, 0) / spendingHistory.length;
  const weeklyAvg = dailyAvg * 7;
  const monthlyAvg = dailyAvg * 30;
  
  // Calculate variance for confidence
  const variance = spendingHistory.reduce((sum, val) => sum + Math.pow(val - dailyAvg, 2), 0) / spendingHistory.length;
  
  // Calculate trends
  const dailyTrend = calculateTrend(today, spendingHistory);
  const weeklyTrend = calculateTrend(currentWeek, [
    spendingHistory.slice(0, 7).reduce((sum, val) => sum + val, 0),
    spendingHistory.slice(7, 14).reduce((sum, val) => sum + val, 0),
    spendingHistory.slice(14, 21).reduce((sum, val) => sum + val, 0),
    spendingHistory.slice(21, 28).reduce((sum, val) => sum + val, 0),
  ]);
  const monthlyTrend = dailyTrend; // Simplified for demo
  
  // Project future spending with trend factor
  const trendMultiplier = {
    increasing: 1.15,
    decreasing: 0.85,
    stable: 1.0,
  };
  
  const dailyProjected = dailyAvg * trendMultiplier[dailyTrend];
  const weeklyProjected = weeklyAvg * trendMultiplier[weeklyTrend];
  const monthlyProjected = monthlyAvg * trendMultiplier[monthlyTrend];
  
  // Calculate runway (assuming a budget limit)
  const assumedMonthlyBudget = 1000; // Demo budget
  const runwayDays = assumedMonthlyBudget / dailyProjected;
  
  // Calculate confidence
  const confidence = calculateConfidence(spendingHistory.length, variance);
  
  // Calculate burn rate from real audit data if available
  const burnRate = auditEntries.length > 0 
    ? calculateBurnRate(auditEntries)
    : {
        dailyAverage: dailyAvg,
        weeklyAverage: weeklyAvg / 7,
        monthlyAverage: monthlyAvg / 30,
      };
  
  return {
    daily: {
      current: Math.round(today * 100) / 100,
      projected: Math.round(dailyProjected * 100) / 100,
      trend: dailyTrend,
    },
    weekly: {
      current: Math.round(currentWeek * 100) / 100,
      projected: Math.round(weeklyProjected * 100) / 100,
      trend: weeklyTrend,
    },
    monthly: {
      current: Math.round(currentMonth * 100) / 100,
      projected: Math.round(monthlyProjected * 100) / 100,
      trend: monthlyTrend,
    },
    runway: {
      days: Math.round(runwayDays),
      estimate: formatRunwayEstimate(runwayDays),
      confidence,
    },
    burnRate: {
      dailyAverage: Math.round(burnRate.dailyAverage * 100) / 100,
      weeklyAverage: Math.round(burnRate.weeklyAverage * 100) / 100,
      monthlyAverage: Math.round(burnRate.monthlyAverage * 100) / 100,
    },
    generatedAt: new Date().toISOString(),
  };
}

// GET /api/vault/forecast - Projected spend based on current burn rate
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<SpendingForecast>>> {
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('walletId');
    const period = searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | null;
    const includeHistorical = searchParams.get('includeHistorical') === 'true';

    // Calculate forecast
    const forecast = await calculateSpendingForecast(walletId || undefined);

    // Filter by period if requested
    let responseData: any = forecast;
    if (period) {
      responseData = {
        [period]: forecast[period],
        runway: forecast.runway,
        burnRate: forecast.burnRate,
        generatedAt: forecast.generatedAt,
      };
    }

    // Add historical data if requested (mock for demo)
    if (includeHistorical) {
      const mockHistory = generateMockSpendingHistory();
      responseData.historical = {
        dailySpending: mockHistory,
        period: `${mockHistory.length} days`,
        average: mockHistory.reduce((sum, val) => sum + val, 0) / mockHistory.length,
        variance: mockHistory.reduce((sum, val, _, arr) => {
          const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
          return sum + Math.pow(val - avg, 2);
        }, 0) / mockHistory.length,
      };
    }

    // Generate insights
    const insights = [];
    if (forecast.daily.trend === 'increasing') {
      insights.push('📈 Daily spending is trending upward');
    }
    if (forecast.runway.days < 30) {
      insights.push('⚠️ Runway is less than 30 days based on current burn rate');
    }
    if (forecast.runway.confidence === 'low') {
      insights.push('❓ Forecast confidence is low due to limited historical data');
    }
    if (forecast.burnRate.dailyAverage > 50) {
      insights.push('💰 High daily burn rate detected');
    }

    // Log audit entry
    await logAuditEntry({
      action: 'forecast_generate',
      endpoint: '/api/vault/forecast',
      method: 'GET',
      walletId: walletId || undefined,
      responseStatus: 200,
      requestBody: { period, includeHistorical },
    });

    return NextResponse.json({
      success: true,
      data: responseData,
      insights,
      metadata: {
        walletId: walletId || 'all',
        calculationMethod: 'exponential_smoothing',
        dataPoints: 30,
        confidenceLevel: forecast.runway.confidence,
      },
    });

  } catch (error) {
    console.error('Forecast GET error:', error);
    
    await logAuditEntry({
      action: 'forecast_generate_error',
      endpoint: '/api/vault/forecast',
      method: 'GET',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to generate spending forecast',
    }, { status: 500 });
  }
}

// POST /api/vault/forecast/recalculate - Force recalculation with custom parameters
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<SpendingForecast>>> {
  try {
    const body = await request.json();

    // Validate custom parameters
    const customBudget = body.monthlyBudget;
    const trendAdjustment = body.trendAdjustment || 1.0;
    const walletId = body.walletId;

    if (customBudget && (typeof customBudget !== 'number' || customBudget <= 0)) {
      return NextResponse.json({
        success: false,
        error: 'Monthly budget must be a positive number',
      }, { status: 400 });
    }

    if (typeof trendAdjustment !== 'number' || trendAdjustment < 0.1 || trendAdjustment > 5.0) {
      return NextResponse.json({
        success: false,
        error: 'Trend adjustment must be between 0.1 and 5.0',
      }, { status: 400 });
    }

    // Generate custom forecast
    let forecast = await calculateSpendingForecast(walletId);

    // Apply custom adjustments
    if (trendAdjustment !== 1.0) {
      forecast.daily.projected *= trendAdjustment;
      forecast.weekly.projected *= trendAdjustment;
      forecast.monthly.projected *= trendAdjustment;
    }

    // Recalculate runway with custom budget
    if (customBudget) {
      const customRunwayDays = customBudget / forecast.daily.projected;
      forecast.runway = {
        days: Math.round(customRunwayDays),
        estimate: formatRunwayEstimate(customRunwayDays),
        confidence: forecast.runway.confidence,
      };
    }

    // Log audit entry
    await logAuditEntry({
      action: 'forecast_recalculate',
      endpoint: '/api/vault/forecast/recalculate',
      method: 'POST',
      walletId: walletId || undefined,
      responseStatus: 200,
      requestBody: { customBudget, trendAdjustment },
    });

    return NextResponse.json({
      success: true,
      data: forecast,
      customParameters: {
        monthlyBudget: customBudget,
        trendAdjustment,
        walletId: walletId || 'all',
      },
    });

  } catch (error) {
    console.error('Forecast POST error:', error);
    
    await logAuditEntry({
      action: 'forecast_recalculate_error',
      endpoint: '/api/vault/forecast/recalculate',
      method: 'POST',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to recalculate forecast',
    }, { status: 500 });
  }
}