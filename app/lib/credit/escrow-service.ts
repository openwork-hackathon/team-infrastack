/**
 * Escrow Service - Lock and release funds for jobs and other purposes
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  Escrow, 
  Transfer, 
  EscrowNotFoundError, 
  WalletNotFoundError,
  InsufficientFundsError,
  CreditError 
} from './types';
import { WalletService } from './wallet-service';

export class EscrowService {
  private escrows = new Map<string, Escrow>();
  private walletService: WalletService;

  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  /**
   * Lock funds in escrow
   */
  async lockFunds(
    walletId: string, 
    amount: number, 
    purpose: string, 
    releaseCondition: string
  ): Promise<Escrow> {
    if (amount <= 0) {
      throw new CreditError('Escrow amount must be positive', 'INVALID_AMOUNT');
    }

    const wallet = await this.walletService.getWallet(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    // Check if wallet has sufficient available funds
    if (wallet.available < amount) {
      throw new InsufficientFundsError(wallet.available, amount);
    }

    const escrow: Escrow = {
      id: uuidv4(),
      wallet_id: walletId,
      amount,
      purpose,
      locked_at: new Date(),
      release_condition: releaseCondition
    };

    this.escrows.set(escrow.id, escrow);

    // Update wallet's reserved amount
    await this.walletService.updateReserved(walletId, amount);

    return escrow;
  }

  /**
   * Release escrow funds to a specific wallet
   */
  async releaseFunds(escrowId: string, toWalletId: string): Promise<Transfer> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new EscrowNotFoundError(escrowId);
    }

    if (escrow.released_at) {
      throw new CreditError(`Escrow ${escrowId} already released`, 'ESCROW_ALREADY_RELEASED');
    }

    // Verify recipient wallet exists
    const toWallet = await this.walletService.getWallet(toWalletId);
    if (!toWallet) {
      throw new WalletNotFoundError(toWalletId);
    }

    // Create transfer from escrow source to recipient
    const transfer = await this.walletService.internalTransfer(
      escrow.wallet_id,
      toWalletId,
      escrow.amount,
      `Escrow release: ${escrow.purpose}`,
      'escrow_release'
    );

    // Mark escrow as released
    escrow.released_at = new Date();

    // Reduce reserved amount in source wallet
    await this.walletService.updateReserved(escrow.wallet_id, -escrow.amount);

    return transfer;
  }

  /**
   * Cancel escrow and return funds to original wallet
   */
  async cancelEscrow(escrowId: string): Promise<void> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new EscrowNotFoundError(escrowId);
    }

    if (escrow.released_at) {
      throw new CreditError(`Cannot cancel released escrow ${escrowId}`, 'ESCROW_ALREADY_RELEASED');
    }

    // Mark as released (to prevent double-cancellation)
    escrow.released_at = new Date();

    // Reduce reserved amount (funds return to available balance)
    await this.walletService.updateReserved(escrow.wallet_id, -escrow.amount);
  }

  /**
   * Get active escrows for a wallet
   */
  async getActiveEscrows(walletId: string): Promise<Escrow[]> {
    return Array.from(this.escrows.values())
      .filter(escrow => escrow.wallet_id === walletId && !escrow.released_at)
      .sort((a, b) => b.locked_at.getTime() - a.locked_at.getTime());
  }

  /**
   * Get total amount reserved in escrow for a wallet
   */
  async getTotalReserved(walletId: string): Promise<number> {
    const activeEscrows = await this.getActiveEscrows(walletId);
    return activeEscrows.reduce((total, escrow) => total + escrow.amount, 0);
  }

  /**
   * Get escrow by ID
   */
  async getEscrow(escrowId: string): Promise<Escrow | null> {
    return this.escrows.get(escrowId) || null;
  }

  /**
   * Get all escrows for a wallet (including released ones)
   */
  async getEscrowHistory(walletId: string, limit: number = 100): Promise<Escrow[]> {
    return Array.from(this.escrows.values())
      .filter(escrow => escrow.wallet_id === walletId)
      .sort((a, b) => b.locked_at.getTime() - a.locked_at.getTime())
      .slice(0, limit);
  }

  /**
   * Update escrow purpose/condition (if not yet released)
   */
  async updateEscrow(
    escrowId: string, 
    updates: { purpose?: string; release_condition?: string }
  ): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new EscrowNotFoundError(escrowId);
    }

    if (escrow.released_at) {
      throw new CreditError('Cannot update released escrow', 'ESCROW_ALREADY_RELEASED');
    }

    if (updates.purpose !== undefined) {
      escrow.purpose = updates.purpose;
    }

    if (updates.release_condition !== undefined) {
      escrow.release_condition = updates.release_condition;
    }

    return escrow;
  }

  /**
   * Partially release escrow funds (useful for partial job completion)
   */
  async partialRelease(
    escrowId: string, 
    toWalletId: string, 
    amount: number
  ): Promise<{ transfer: Transfer; remainingEscrow: Escrow | null }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new EscrowNotFoundError(escrowId);
    }

    if (escrow.released_at) {
      throw new CreditError(`Escrow ${escrowId} already released`, 'ESCROW_ALREADY_RELEASED');
    }

    if (amount <= 0 || amount > escrow.amount) {
      throw new CreditError(
        `Invalid partial release amount: ${amount} (escrow has ${escrow.amount})`,
        'INVALID_AMOUNT'
      );
    }

    // Verify recipient wallet exists
    const toWallet = await this.walletService.getWallet(toWalletId);
    if (!toWallet) {
      throw new WalletNotFoundError(toWalletId);
    }

    // Create transfer for the partial amount
    const transfer = await this.walletService.internalTransfer(
      escrow.wallet_id,
      toWalletId,
      amount,
      `Partial escrow release: ${escrow.purpose}`,
      'escrow_release'
    );

    // Reduce reserved amount
    await this.walletService.updateReserved(escrow.wallet_id, -amount);

    // Update escrow amount
    escrow.amount -= amount;

    let remainingEscrow: Escrow | null = null;

    if (escrow.amount > 0) {
      // Still have funds in escrow
      remainingEscrow = { ...escrow };
    } else {
      // Escrow fully released
      escrow.released_at = new Date();
    }

    return { transfer, remainingEscrow };
  }

  /**
   * Get all escrows (admin function)
   */
  async getAllEscrows(): Promise<Escrow[]> {
    return Array.from(this.escrows.values());
  }

  /**
   * Find escrows by purpose pattern
   */
  async findEscrowsByPurpose(purposePattern: string): Promise<Escrow[]> {
    const regex = new RegExp(purposePattern, 'i');
    return Array.from(this.escrows.values())
      .filter(escrow => regex.test(escrow.purpose))
      .sort((a, b) => b.locked_at.getTime() - a.locked_at.getTime());
  }
}