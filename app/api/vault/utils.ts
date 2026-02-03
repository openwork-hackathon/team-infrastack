// Vault utilities for file-based storage and validation

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { AuditEntry } from './types';

const DATA_DIR = path.join(process.cwd(), '.data');

export async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function loadJsonData<T>(filename: string): Promise<T[]> {
  try {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    if (existsSync(filePath)) {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error loading ${filename}:`, err);
  }
  return [];
}

export async function saveJsonData<T>(filename: string, data: T[]) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

export function validateWalletAddress(address: string): boolean {
  // Basic Ethereum address validation (42 chars, starts with 0x)
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function logAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
  const auditEntries = await loadJsonData<AuditEntry>('audit.json');
  
  const fullEntry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  
  auditEntries.push(fullEntry);
  await saveJsonData('audit.json', auditEntries);
  
  return fullEntry;
}

// Mock data generators for demo
export function generateMockWallets() {
  return [
    {
      id: 'wallet-1',
      name: 'Primary Wallet',
      address: '0x1234567890123456789012345678901234567890',
      network: 'ethereum',
      isActive: true,
      createdAt: '2024-01-15T10:00:00Z',
      lastSynced: '2024-02-03T08:30:00Z',
    },
    {
      id: 'wallet-2',
      name: 'Base L2 Wallet',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      network: 'base',
      isActive: true,
      createdAt: '2024-01-20T14:30:00Z',
      lastSynced: '2024-02-03T09:15:00Z',
    },
    {
      id: 'wallet-3',
      name: 'Test Wallet',
      address: '0x9876543210987654321098765432109876543210',
      network: 'base',
      isActive: false,
      createdAt: '2024-02-01T16:45:00Z',
    },
  ];
}

export function generateMockBudgets() {
  return [
    {
      id: 'budget-1',
      name: 'Daily Operations',
      type: 'daily' as const,
      limit: 100,
      spent: 73.50,
      remaining: 26.50,
      percentageUsed: 73.5,
      isActive: true,
      startDate: '2024-02-03T00:00:00Z',
      endDate: '2024-02-04T00:00:00Z',
      createdAt: '2024-02-01T12:00:00Z',
    },
    {
      id: 'budget-2',
      name: 'Weekly AI Spend',
      type: 'weekly' as const,
      limit: 500,
      spent: 234.80,
      remaining: 265.20,
      percentageUsed: 47.0,
      walletId: 'wallet-1',
      isActive: true,
      startDate: '2024-01-29T00:00:00Z',
      endDate: '2024-02-05T00:00:00Z',
      createdAt: '2024-01-29T09:00:00Z',
    },
    {
      id: 'budget-3',
      name: 'Monthly Infrastructure',
      type: 'monthly' as const,
      limit: 2000,
      spent: 456.30,
      remaining: 1543.70,
      percentageUsed: 22.8,
      isActive: true,
      startDate: '2024-02-01T00:00:00Z',
      endDate: '2024-03-01T00:00:00Z',
      createdAt: '2024-02-01T00:00:00Z',
    },
  ];
}

export function generateMockAlerts() {
  return [
    {
      id: 'alert-1',
      name: 'Daily Budget 75% Warning',
      budgetId: 'budget-1',
      thresholdPercentage: 75,
      webhookUrl: 'https://hooks.slack.com/services/example',
      isActive: true,
      lastTriggered: '2024-02-03T07:30:00Z',
      createdAt: '2024-02-01T12:05:00Z',
    },
    {
      id: 'alert-2',
      name: 'Weekly Budget 90% Critical',
      budgetId: 'budget-2',
      thresholdPercentage: 90,
      emailAddress: 'admin@example.com',
      isActive: true,
      createdAt: '2024-01-29T09:15:00Z',
    },
    {
      id: 'alert-3',
      name: 'Monthly Budget 50% Info',
      budgetId: 'budget-3',
      thresholdPercentage: 50,
      webhookUrl: 'https://api.teams.microsoft.com/webhook/example',
      isActive: false,
      createdAt: '2024-02-01T00:30:00Z',
    },
  ];
}

export function calculateBurnRate(auditEntries: AuditEntry[]) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentEntries = auditEntries.filter(entry => 
    entry.cost && new Date(entry.timestamp) >= oneMonthAgo
  );

  const dailySpend = recentEntries
    .filter(entry => new Date(entry.timestamp) >= oneDayAgo)
    .reduce((sum, entry) => sum + (entry.cost || 0), 0);

  const weeklySpend = recentEntries
    .filter(entry => new Date(entry.timestamp) >= oneWeekAgo)
    .reduce((sum, entry) => sum + (entry.cost || 0), 0);

  const monthlySpend = recentEntries
    .reduce((sum, entry) => sum + (entry.cost || 0), 0);

  return {
    dailyAverage: dailySpend,
    weeklyAverage: weeklySpend / 7,
    monthlyAverage: monthlySpend / 30,
  };
}