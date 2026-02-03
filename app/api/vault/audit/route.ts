import { NextRequest, NextResponse } from 'next/server';
import { AuditEntry, ApiResponse, PaginationParams, DateRange } from '../types';
import { loadJsonData, logAuditEntry } from '../utils';

const AUDIT_FILE = 'audit.json';

// Generate mock audit entries for demo
function generateMockAuditEntries(): AuditEntry[] {
  const now = new Date();
  const entries: AuditEntry[] = [];

  // Generate entries for the past 30 days
  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(now.getTime() - (i * 2 * 60 * 60 * 1000)); // Every 2 hours back
    const actions = [
      'api_call', 'wallet_create', 'budget_create', 'alert_triggered', 
      'cost_logged', 'forecast_generated', 'alert_create'
    ];
    const endpoints = [
      '/api/vault/costs', '/api/vault/wallets', '/api/vault/budgets',
      '/api/vault/alerts', '/api/vault/forecast', '/api/vault/audit'
    ];
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    const providers = ['anthropic', 'openai', 'google', null];
    const models = ['claude-3', 'gpt-4', 'gemini-pro', null];

    const action = actions[i % actions.length];
    const endpoint = endpoints[i % endpoints.length];
    const method = methods[i % methods.length];
    const provider = providers[i % providers.length];
    const model = models[i % models.length];

    entries.push({
      id: `audit-${crypto.randomUUID()}`,
      timestamp: timestamp.toISOString(),
      action,
      endpoint,
      method,
      walletId: i % 3 === 0 ? `wallet-${i % 3 + 1}` : undefined,
      model: provider && model ? model : undefined,
      provider: provider || undefined,
      tokens: provider ? Math.floor(Math.random() * 5000) + 100 : undefined,
      cost: provider ? Math.random() * 2 + 0.01 : undefined,
      caller: `192.168.1.${(i % 254) + 1}`,
      responseStatus: i % 10 === 0 ? 500 : (i % 20 === 0 ? 404 : 200),
      userAgent: i % 2 === 0 ? 'AgentVault-Client/1.0' : 'curl/7.68.0',
      requestBody: action === 'api_call' ? { query: `test-${i}` } : undefined,
    });
  }

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// Initialize with mock data on first run
async function initializeAuditEntries(): Promise<AuditEntry[]> {
  let entries = await loadJsonData<AuditEntry>(AUDIT_FILE);
  if (entries.length === 0) {
    entries = generateMockAuditEntries();
    // Don't save mock data, let it be generated fresh each time for demo
  }
  return entries;
}

// Helper function to apply filters
function applyFilters(entries: AuditEntry[], params: {
  startDate?: string;
  endDate?: string;
  action?: string;
  model?: string;
  provider?: string;
  walletId?: string;
  caller?: string;
  status?: string;
}): AuditEntry[] {
  let filtered = entries;

  // Date range filter
  if (params.startDate) {
    const startDate = new Date(params.startDate);
    filtered = filtered.filter(entry => new Date(entry.timestamp) >= startDate);
  }

  if (params.endDate) {
    const endDate = new Date(params.endDate);
    filtered = filtered.filter(entry => new Date(entry.timestamp) <= endDate);
  }

  // Action filter
  if (params.action) {
    filtered = filtered.filter(entry => 
      entry.action.toLowerCase().includes(params.action!.toLowerCase())
    );
  }

  // Model filter
  if (params.model) {
    filtered = filtered.filter(entry => 
      entry.model && entry.model.toLowerCase().includes(params.model!.toLowerCase())
    );
  }

  // Provider filter
  if (params.provider) {
    filtered = filtered.filter(entry => 
      entry.provider && entry.provider.toLowerCase() === params.provider!.toLowerCase()
    );
  }

  // Wallet filter
  if (params.walletId) {
    filtered = filtered.filter(entry => entry.walletId === params.walletId);
  }

  // Caller filter
  if (params.caller) {
    filtered = filtered.filter(entry => 
      entry.caller && entry.caller.includes(params.caller!)
    );
  }

  // Status filter
  if (params.status) {
    const statusCode = parseInt(params.status);
    if (!isNaN(statusCode)) {
      filtered = filtered.filter(entry => entry.responseStatus === statusCode);
    }
  }

  return filtered;
}

// Helper function to calculate audit statistics
function calculateAuditStats(entries: AuditEntry[]) {
  const totalEntries = entries.length;
  const successfulRequests = entries.filter(e => e.responseStatus < 400).length;
  const errorRequests = entries.filter(e => e.responseStatus >= 400).length;
  const totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0);
  const totalTokens = entries.reduce((sum, e) => sum + (e.tokens || 0), 0);

  const actionCounts = entries.reduce((acc, entry) => {
    acc[entry.action] = (acc[entry.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const providerCounts = entries.reduce((acc, entry) => {
    if (entry.provider) {
      acc[entry.provider] = (acc[entry.provider] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const topEndpoints = Object.entries(
    entries.reduce((acc, entry) => {
      acc[entry.endpoint] = (acc[entry.endpoint] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([endpoint, count]) => ({ endpoint, count }));

  return {
    totalEntries,
    successfulRequests,
    errorRequests,
    successRate: totalEntries > 0 ? (successfulRequests / totalEntries) * 100 : 0,
    totalCost: Math.round(totalCost * 100) / 100,
    totalTokens,
    actionCounts,
    providerCounts,
    topEndpoints,
  };
}

// GET /api/vault/audit - Paginated list of all API calls
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<AuditEntry[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 1000); // Max 1000
    const sortBy = searchParams.get('sortBy') || 'timestamp';
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc';

    // Filter parameters
    const filters = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      action: searchParams.get('action') || undefined,
      model: searchParams.get('model') || undefined,
      provider: searchParams.get('provider') ?? undefined,
      walletId: searchParams.get('walletId') || undefined,
      caller: searchParams.get('caller') || undefined,
      status: searchParams.get('status') || undefined,
    };

    // Special query parameters
    const includeStats = searchParams.get('includeStats') === 'true';
    const export_format = searchParams.get('export'); // 'csv' or 'json'

    let entries = await initializeAuditEntries();

    // Apply filters
    entries = applyFilters(entries, filters);

    // Calculate stats if requested
    const stats = includeStats ? calculateAuditStats(entries) : undefined;

    // Sort entries
    entries.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Handle export formats
    if (export_format === 'csv') {
      const csvHeaders = [
        'Timestamp', 'Action', 'Endpoint', 'Method', 'Status', 
        'Provider', 'Model', 'Tokens', 'Cost', 'Caller', 'Wallet ID'
      ].join(',');
      
      const csvRows = entries.map(entry => [
        entry.timestamp,
        entry.action,
        entry.endpoint,
        entry.method,
        entry.responseStatus,
        entry.provider || '',
        entry.model || '',
        entry.tokens || '',
        entry.cost || '',
        entry.caller || '',
        entry.walletId || ''
      ].join(','));

      const csvContent = [csvHeaders, ...csvRows].join('\n');
      
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Paginate results
    const total = entries.length;
    const startIndex = (page - 1) * limit;
    const paginatedEntries = entries.slice(startIndex, startIndex + limit);

    // Log this audit request (meta!)
    await logAuditEntry({
      action: 'audit_list',
      endpoint: '/api/vault/audit',
      method: 'GET',
      responseStatus: 200,
      caller: request.headers.get('x-forwarded-for') || 'localhost',
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: paginatedEntries,
      pagination: {
        page,
        limit,
        total,
        hasMore: startIndex + limit < total,
      },
      filters,
      stats,
    });

  } catch (error) {
    console.error('Audit GET error:', error);
    
    await logAuditEntry({
      action: 'audit_list_error',
      endpoint: '/api/vault/audit',
      method: 'GET',
      responseStatus: 500,
      caller: request.headers.get('x-forwarded-for') || 'localhost',
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve audit log',
    }, { status: 500 });
  }
}

// DELETE /api/vault/audit - Clean up old audit entries
export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<{ deletedCount: number }>>> {
  try {
    const { searchParams } = new URL(request.url);
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '90', 10);

    if (olderThanDays < 1) {
      return NextResponse.json({
        success: false,
        error: 'olderThanDays must be at least 1',
      }, { status: 400 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let entries = await loadJsonData<AuditEntry>(AUDIT_FILE);
    const originalCount = entries.length;

    // Keep only entries newer than cutoff
    entries = entries.filter(entry => new Date(entry.timestamp) > cutoffDate);
    const deletedCount = originalCount - entries.length;

    // Save cleaned data (only if we're working with real data, not mock)
    if (originalCount > 0) {
      // await saveJsonData(AUDIT_FILE, entries); // Uncomment for real cleanup
    }

    // Log this cleanup action
    await logAuditEntry({
      action: 'audit_cleanup',
      endpoint: '/api/vault/audit',
      method: 'DELETE',
      responseStatus: 200,
      requestBody: { olderThanDays, deletedCount },
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount },
    });

  } catch (error) {
    console.error('Audit DELETE error:', error);
    
    await logAuditEntry({
      action: 'audit_cleanup_error',
      endpoint: '/api/vault/audit',
      method: 'DELETE',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to clean up audit log',
    }, { status: 500 });
  }
}