import { NextRequest, NextResponse } from 'next/server';
import { Budget, ApiResponse } from '../types';
import { loadJsonData, saveJsonData, logAuditEntry, generateMockBudgets } from '../utils';

const BUDGETS_FILE = 'budgets.json';

// Initialize with mock data on first run
async function initializeBudgets(): Promise<Budget[]> {
  let budgets = await loadJsonData<Budget>(BUDGETS_FILE);
  if (budgets.length === 0) {
    budgets = generateMockBudgets();
    await saveJsonData(BUDGETS_FILE, budgets);
  }
  return budgets;
}

// Helper function to calculate budget dates
function calculateBudgetDates(type: 'daily' | 'weekly' | 'monthly', startDate?: string) {
  const start = startDate ? new Date(startDate) : new Date();
  let end: Date;

  switch (type) {
    case 'daily':
      end = new Date(start);
      end.setDate(start.getDate() + 1);
      break;
    case 'weekly':
      end = new Date(start);
      end.setDate(start.getDate() + 7);
      break;
    case 'monthly':
      end = new Date(start);
      end.setMonth(start.getMonth() + 1);
      break;
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

// Helper function to update budget spending (would integrate with costs API in real implementation)
function updateBudgetSpending(budget: Budget): Budget {
  // In a real implementation, this would query the costs API
  // For demo, we'll use the existing spent amount or simulate
  const remaining = Math.max(0, budget.limit - budget.spent);
  const percentageUsed = (budget.spent / budget.limit) * 100;

  return {
    ...budget,
    remaining,
    percentageUsed: Math.round(percentageUsed * 10) / 10, // Round to 1 decimal
  };
}

// GET /api/vault/budgets - Get budget settings and current status
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Budget[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const type = searchParams.get('type') as 'daily' | 'weekly' | 'monthly' | null;
    const walletId = searchParams.get('walletId');

    let budgets = await initializeBudgets();

    // Update spending calculations
    budgets = budgets.map(updateBudgetSpending);

    // Filter inactive budgets unless requested
    if (!includeInactive) {
      budgets = budgets.filter(b => b.isActive);
    }

    // Filter by type if specified
    if (type) {
      budgets = budgets.filter(b => b.type === type);
    }

    // Filter by wallet if specified
    if (walletId) {
      budgets = budgets.filter(b => b.walletId === walletId || !b.walletId); // Include global budgets
    }

    // Calculate summary statistics
    const summary = {
      totalBudgets: budgets.length,
      totalLimit: budgets.reduce((sum, b) => sum + b.limit, 0),
      totalSpent: budgets.reduce((sum, b) => sum + b.spent, 0),
      averageUtilization: budgets.length > 0 
        ? budgets.reduce((sum, b) => sum + b.percentageUsed, 0) / budgets.length 
        : 0,
      overBudgetCount: budgets.filter(b => b.spent > b.limit).length,
    };

    // Log audit entry
    await logAuditEntry({
      action: 'budget_list',
      endpoint: '/api/vault/budgets',
      method: 'GET',
      walletId: walletId || undefined,
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: budgets,
      summary,
    });

  } catch (error) {
    console.error('Budgets GET error:', error);
    
    await logAuditEntry({
      action: 'budget_list_error',
      endpoint: '/api/vault/budgets',
      method: 'GET',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve budgets',
    }, { status: 500 });
  }
}

// POST /api/vault/budgets - Set budget limits
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Budget>>> {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.type || !body.limit) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: name, type, limit',
      }, { status: 400 });
    }

    // Validate type
    if (!['daily', 'weekly', 'monthly'].includes(body.type)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid budget type. Must be: daily, weekly, or monthly',
      }, { status: 400 });
    }

    // Validate limit
    if (typeof body.limit !== 'number' || body.limit <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Budget limit must be a positive number',
      }, { status: 400 });
    }

    // Validate walletId if provided
    if (body.walletId) {
      // In a real implementation, we'd verify the wallet exists
      // For demo, we'll accept any wallet ID
    }

    const budgets = await initializeBudgets();
    const dates = calculateBudgetDates(body.type, body.startDate);

    // Create new budget
    const newBudget: Budget = {
      id: `budget-${crypto.randomUUID()}`,
      name: body.name.trim(),
      type: body.type,
      limit: body.limit,
      spent: 0, // Start fresh
      remaining: body.limit,
      percentageUsed: 0,
      walletId: body.walletId || undefined,
      isActive: body.isActive !== false, // Default to true
      ...dates,
      createdAt: new Date().toISOString(),
    };

    budgets.push(newBudget);
    await saveJsonData(BUDGETS_FILE, budgets);

    // Log audit entry
    await logAuditEntry({
      action: 'budget_create',
      endpoint: '/api/vault/budgets',
      method: 'POST',
      walletId: newBudget.walletId,
      requestBody: { 
        name: body.name, 
        type: body.type, 
        limit: body.limit,
        walletId: body.walletId 
      },
      responseStatus: 201,
    });

    return NextResponse.json({
      success: true,
      data: newBudget,
    }, { status: 201 });

  } catch (error) {
    console.error('Budgets POST error:', error);
    
    await logAuditEntry({
      action: 'budget_create_error',
      endpoint: '/api/vault/budgets',
      method: 'POST',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to create budget',
    }, { status: 500 });
  }
}

// PUT /api/vault/budgets - Update existing budget
export async function PUT(request: NextRequest): Promise<NextResponse<ApiResponse<Budget>>> {
  try {
    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get('id');

    if (!budgetId) {
      return NextResponse.json({
        success: false,
        error: 'Missing budget ID parameter',
      }, { status: 400 });
    }

    const body = await request.json();
    const budgets = await initializeBudgets();
    const budgetIndex = budgets.findIndex(b => b.id === budgetId);

    if (budgetIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Budget not found',
      }, { status: 404 });
    }

    const existingBudget = budgets[budgetIndex];

    // Update allowed fields
    const updatedBudget: Budget = {
      ...existingBudget,
      name: body.name || existingBudget.name,
      limit: body.limit || existingBudget.limit,
      isActive: body.isActive !== undefined ? body.isActive : existingBudget.isActive,
    };

    // Recalculate derived fields
    const updated = updateBudgetSpending(updatedBudget);
    budgets[budgetIndex] = updated;

    await saveJsonData(BUDGETS_FILE, budgets);

    // Log audit entry
    await logAuditEntry({
      action: 'budget_update',
      endpoint: '/api/vault/budgets',
      method: 'PUT',
      walletId: updated.walletId,
      requestBody: body,
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });

  } catch (error) {
    console.error('Budgets PUT error:', error);
    
    await logAuditEntry({
      action: 'budget_update_error',
      endpoint: '/api/vault/budgets',
      method: 'PUT',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to update budget',
    }, { status: 500 });
  }
}