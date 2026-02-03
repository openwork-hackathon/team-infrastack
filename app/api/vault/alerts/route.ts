import { NextRequest, NextResponse } from 'next/server';
import { Alert, ApiResponse } from '../types';
import { loadJsonData, saveJsonData, validateUrl, validateEmail, logAuditEntry, generateMockAlerts } from '../utils';

const ALERTS_FILE = 'alerts.json';

// Initialize with mock data on first run
async function initializeAlerts(): Promise<Alert[]> {
  let alerts = await loadJsonData<Alert>(ALERTS_FILE);
  if (alerts.length === 0) {
    alerts = generateMockAlerts();
    await saveJsonData(ALERTS_FILE, alerts);
  }
  return alerts;
}

// Helper function to validate budget exists (in real implementation, would check budgets table)
async function validateBudgetExists(budgetId: string): Promise<boolean> {
  // For demo purposes, we'll assume these budget IDs exist
  const validBudgetIds = ['budget-1', 'budget-2', 'budget-3'];
  return validBudgetIds.includes(budgetId) || budgetId.startsWith('budget-');
}

// Helper function to trigger alert webhook (simulate)
async function triggerAlert(alert: Alert, currentPercentage: number) {
  console.log(`🚨 Alert triggered: ${alert.name}`);
  console.log(`📊 Threshold: ${alert.thresholdPercentage}% | Current: ${currentPercentage}%`);
  
  if (alert.webhookUrl) {
    console.log(`📡 Webhook would be called: ${alert.webhookUrl}`);
    // In real implementation:
    // await fetch(alert.webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     alert: alert.name,
    //     budgetId: alert.budgetId,
    //     threshold: alert.thresholdPercentage,
    //     current: currentPercentage,
    //     timestamp: new Date().toISOString()
    //   })
    // });
  }

  if (alert.emailAddress) {
    console.log(`📧 Email would be sent to: ${alert.emailAddress}`);
    // In real implementation: send email
  }

  // Update last triggered
  const alerts = await loadJsonData<Alert>(ALERTS_FILE);
  const alertIndex = alerts.findIndex(a => a.id === alert.id);
  if (alertIndex >= 0) {
    alerts[alertIndex].lastTriggered = new Date().toISOString();
    await saveJsonData(ALERTS_FILE, alerts);
  }
}

// GET /api/vault/alerts - List alert configurations
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Alert[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const budgetId = searchParams.get('budgetId');

    let alerts = await initializeAlerts();

    // Filter inactive alerts unless requested
    if (!includeInactive) {
      alerts = alerts.filter(a => a.isActive);
    }

    // Filter by budget if specified
    if (budgetId) {
      alerts = alerts.filter(a => a.budgetId === budgetId);
    }

    // Sort by threshold percentage
    alerts.sort((a, b) => a.thresholdPercentage - b.thresholdPercentage);

    // Log audit entry
    await logAuditEntry({
      action: 'alert_list',
      endpoint: '/api/vault/alerts',
      method: 'GET',
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: alerts,
    });

  } catch (error) {
    console.error('Alerts GET error:', error);
    
    await logAuditEntry({
      action: 'alert_list_error',
      endpoint: '/api/vault/alerts',
      method: 'GET',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve alerts',
    }, { status: 500 });
  }
}

// POST /api/vault/alerts - Create alert
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Alert>>> {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.budgetId || !body.thresholdPercentage) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: name, budgetId, thresholdPercentage',
      }, { status: 400 });
    }

    // Validate threshold percentage
    if (typeof body.thresholdPercentage !== 'number' || 
        body.thresholdPercentage <= 0 || 
        body.thresholdPercentage > 100) {
      return NextResponse.json({
        success: false,
        error: 'Threshold percentage must be between 1 and 100',
      }, { status: 400 });
    }

    // Validate budget exists
    if (!(await validateBudgetExists(body.budgetId))) {
      return NextResponse.json({
        success: false,
        error: 'Budget not found',
      }, { status: 404 });
    }

    // Validate webhook URL if provided
    if (body.webhookUrl && !validateUrl(body.webhookUrl)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook URL format',
      }, { status: 400 });
    }

    // Validate email if provided
    if (body.emailAddress && !validateEmail(body.emailAddress)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email address format',
      }, { status: 400 });
    }

    // Must have at least one notification method
    if (!body.webhookUrl && !body.emailAddress) {
      return NextResponse.json({
        success: false,
        error: 'At least one notification method required (webhookUrl or emailAddress)',
      }, { status: 400 });
    }

    const alerts = await initializeAlerts();

    // Check for duplicate alert on same budget with same threshold
    const duplicateAlert = alerts.find(a => 
      a.budgetId === body.budgetId && 
      a.thresholdPercentage === body.thresholdPercentage &&
      a.isActive
    );

    if (duplicateAlert) {
      return NextResponse.json({
        success: false,
        error: 'Alert already exists for this budget and threshold',
      }, { status: 409 });
    }

    // Create new alert
    const newAlert: Alert = {
      id: `alert-${crypto.randomUUID()}`,
      name: body.name.trim(),
      budgetId: body.budgetId,
      thresholdPercentage: body.thresholdPercentage,
      webhookUrl: body.webhookUrl || undefined,
      emailAddress: body.emailAddress || undefined,
      isActive: body.isActive !== false, // Default to true
      createdAt: new Date().toISOString(),
    };

    alerts.push(newAlert);
    await saveJsonData(ALERTS_FILE, alerts);

    // Log audit entry
    await logAuditEntry({
      action: 'alert_create',
      endpoint: '/api/vault/alerts',
      method: 'POST',
      requestBody: {
        name: body.name,
        budgetId: body.budgetId,
        thresholdPercentage: body.thresholdPercentage,
        hasWebhook: !!body.webhookUrl,
        hasEmail: !!body.emailAddress,
      },
      responseStatus: 201,
    });

    return NextResponse.json({
      success: true,
      data: newAlert,
    }, { status: 201 });

  } catch (error) {
    console.error('Alerts POST error:', error);
    
    await logAuditEntry({
      action: 'alert_create_error',
      endpoint: '/api/vault/alerts',
      method: 'POST',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to create alert',
    }, { status: 500 });
  }
}

// PUT /api/vault/alerts - Update existing alert
export async function PUT(request: NextRequest): Promise<NextResponse<ApiResponse<Alert>>> {
  try {
    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

    if (!alertId) {
      return NextResponse.json({
        success: false,
        error: 'Missing alert ID parameter',
      }, { status: 400 });
    }

    const body = await request.json();
    const alerts = await initializeAlerts();
    const alertIndex = alerts.findIndex(a => a.id === alertId);

    if (alertIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Alert not found',
      }, { status: 404 });
    }

    const existingAlert = alerts[alertIndex];

    // Validate fields if provided
    if (body.thresholdPercentage !== undefined) {
      if (typeof body.thresholdPercentage !== 'number' || 
          body.thresholdPercentage <= 0 || 
          body.thresholdPercentage > 100) {
        return NextResponse.json({
          success: false,
          error: 'Threshold percentage must be between 1 and 100',
        }, { status: 400 });
      }
    }

    if (body.webhookUrl && !validateUrl(body.webhookUrl)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook URL format',
      }, { status: 400 });
    }

    if (body.emailAddress && !validateEmail(body.emailAddress)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email address format',
      }, { status: 400 });
    }

    // Update alert
    const updatedAlert: Alert = {
      ...existingAlert,
      name: body.name || existingAlert.name,
      thresholdPercentage: body.thresholdPercentage || existingAlert.thresholdPercentage,
      webhookUrl: body.webhookUrl !== undefined ? body.webhookUrl : existingAlert.webhookUrl,
      emailAddress: body.emailAddress !== undefined ? body.emailAddress : existingAlert.emailAddress,
      isActive: body.isActive !== undefined ? body.isActive : existingAlert.isActive,
    };

    alerts[alertIndex] = updatedAlert;
    await saveJsonData(ALERTS_FILE, alerts);

    // Log audit entry
    await logAuditEntry({
      action: 'alert_update',
      endpoint: '/api/vault/alerts',
      method: 'PUT',
      requestBody: body,
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: updatedAlert,
    });

  } catch (error) {
    console.error('Alerts PUT error:', error);
    
    await logAuditEntry({
      action: 'alert_update_error',
      endpoint: '/api/vault/alerts',
      method: 'PUT',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to update alert',
    }, { status: 500 });
  }
}

// DELETE /api/vault/alerts - Remove alert
export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

    if (!alertId) {
      return NextResponse.json({
        success: false,
        error: 'Missing alert ID parameter',
      }, { status: 400 });
    }

    const alerts = await initializeAlerts();
    const alertIndex = alerts.findIndex(a => a.id === alertId);

    if (alertIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Alert not found',
      }, { status: 404 });
    }

    const removedAlert = alerts[alertIndex];
    alerts.splice(alertIndex, 1);
    await saveJsonData(ALERTS_FILE, alerts);

    // Log audit entry
    await logAuditEntry({
      action: 'alert_delete',
      endpoint: '/api/vault/alerts',
      method: 'DELETE',
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: null,
    });

  } catch (error) {
    console.error('Alerts DELETE error:', error);
    
    await logAuditEntry({
      action: 'alert_delete_error',
      endpoint: '/api/vault/alerts',
      method: 'DELETE',
      responseStatus: 500,
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to delete alert',
    }, { status: 500 });
  }
}

// POST /api/vault/alerts/test - Test alert notification
export async function POST_test(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

    if (!alertId) {
      return NextResponse.json({
        success: false,
        error: 'Missing alert ID parameter',
      }, { status: 400 });
    }

    const alerts = await initializeAlerts();
    const alert = alerts.find(a => a.id === alertId);

    if (!alert) {
      return NextResponse.json({
        success: false,
        error: 'Alert not found',
      }, { status: 404 });
    }

    // Trigger test alert with fake percentage
    await triggerAlert(alert, 85); // Simulate 85% usage

    // Log audit entry
    await logAuditEntry({
      action: 'alert_test',
      endpoint: '/api/vault/alerts/test',
      method: 'POST',
      responseStatus: 200,
    });

    return NextResponse.json({
      success: true,
      data: null,
    });

  } catch (error) {
    console.error('Alert test error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test alert',
    }, { status: 500 });
  }
}