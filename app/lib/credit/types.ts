/**
 * Core types for the Agent Credit Layer
 * Defines the complete financial infrastructure for agent-to-agent compute economics
 */

export interface Wallet {
  id: string;
  agent_id: string;
  balance: number;        // Total balance
  available: number;      // Balance - reserved - liens
  reserved: number;       // Locked in escrow
  created_at: Date;
  updated_at: Date;
}

export interface Lien {
  id: string;
  debtor_wallet_id: string;
  creditor_wallet_id: string;
  amount: number;
  priority: number;       // Lower = higher priority
  reason: string;
  created_at: Date;
  settled_at?: Date;
}

export interface Escrow {
  id: string;
  wallet_id: string;
  amount: number;
  purpose: string;        // e.g., "compute_job_123"
  locked_at: Date;
  release_condition: string;
  released_at?: Date;
}

export interface Transfer {
  id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  memo: string;
  transfer_type: 'direct' | 'lien_settlement' | 'royalty' | 'escrow_release';
  created_at: Date;
}

export interface RoyaltyAgreement {
  id: string;
  source_wallet_id: string;    // Who pays
  recipient_wallet_id: string;  // Who receives
  rate: number;                 // 0.0-1.0 (percentage)
  trigger: 'on_compute' | 'on_savings' | 'on_profit';
  active: boolean;
  created_at: Date;
}

export interface Bond {
  id: string;
  issuer_wallet_id: string;
  holder_wallet_id: string;
  face_value: number;
  purchase_price: number;
  maturity_date: Date;
  royalty_percentage: number;  // % of future royalties pledged
  status: 'active' | 'matured' | 'defaulted';
  created_at: Date;
}

// Response types for API operations
export interface SpendCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface JobCompletionResult {
  transfers: Transfer[];
  royaltiesPaid: Transfer[];
}

export interface DepositProcessResult {
  netDeposit: number;
  liensSettled: Transfer[];
}

// Error types
export class CreditError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CreditError';
  }
}

export class InsufficientFundsError extends CreditError {
  constructor(available: number, required: number) {
    super(`Insufficient funds: ${available} available, ${required} required`, 'INSUFFICIENT_FUNDS');
  }
}

export class WalletNotFoundError extends CreditError {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`, 'WALLET_NOT_FOUND');
  }
}

export class LienNotFoundError extends CreditError {
  constructor(lienId: string) {
    super(`Lien not found: ${lienId}`, 'LIEN_NOT_FOUND');
  }
}

export class EscrowNotFoundError extends CreditError {
  constructor(escrowId: string) {
    super(`Escrow not found: ${escrowId}`, 'ESCROW_NOT_FOUND');
  }
}