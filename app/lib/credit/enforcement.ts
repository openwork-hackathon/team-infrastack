/**
 * Credit Enforcement - Integration layer for pre-flight checks and job lifecycle
 */
import { 
  SpendCheckResult, 
  JobCompletionResult, 
  DepositProcessResult,
  Transfer,
  Escrow,
  WalletNotFoundError,
  InsufficientFundsError,
  CreditError 
} from './types';
import { WalletService } from './wallet-service';
import { LienService } from './lien-service';
import { EscrowService } from './escrow-service';
import { RoyaltyService } from './royalty-service';

export class CreditEnforcement {
  private walletService: WalletService;
  private lienService: LienService;
  private escrowService: EscrowService;
  private royaltyService: RoyaltyService;

  constructor(
    walletService: WalletService,
    lienService: LienService,
    escrowService: EscrowService,
    royaltyService: RoyaltyService
  ) {
    this.walletService = walletService;
    this.lienService = lienService;
    this.escrowService = escrowService;
    this.royaltyService = royaltyService;
  }

  /**
   * Pre-flight check before API calls - ensures wallet can spend the required amount
   */
  async canSpend(walletId: string, amount: number): Promise<SpendCheckResult> {
    if (amount <= 0) {
      return { allowed: false, reason: 'Invalid amount: must be positive' };
    }

    try {
      const wallet = await this.walletService.getWallet(walletId);
      if (!wallet) {
        return { allowed: false, reason: `Wallet not found: ${walletId}` };
      }

      const availableBalance = await this.walletService.getAvailableBalance(walletId);
      
      if (availableBalance < amount) {
        const totalLiens = await this.lienService.getTotalLienAmount(walletId);
        const totalReserved = await this.escrowService.getTotalReserved(walletId);
        
        return { 
          allowed: false, 
          reason: `Insufficient funds: ${availableBalance} available (balance: ${wallet.balance}, liens: ${totalLiens}, reserved: ${totalReserved}), ${amount} required` 
        };
      }

      return { allowed: true };
    } catch (error) {
      return { 
        allowed: false, 
        reason: `Error checking wallet: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Reserve funds for a job before execution
   */
  async reserveForJob(walletId: string, estimatedCost: number, jobId: string): Promise<Escrow> {
    // First check if funds are available
    const canSpendResult = await this.canSpend(walletId, estimatedCost);
    if (!canSpendResult.allowed) {
      throw new InsufficientFundsError(0, estimatedCost); // Available balance included in canSpend check
    }

    // Lock funds in escrow
    const escrow = await this.escrowService.lockFunds(
      walletId,
      estimatedCost,
      `Compute job: ${jobId}`,
      `Job completion or cancellation: ${jobId}`
    );

    return escrow;
  }

  /**
   * Complete a job and handle all financial settlements
   */
  async completeJob(
    escrowId: string, 
    actualCost: number, 
    savingsGenerated: number = 0
  ): Promise<JobCompletionResult> {
    if (actualCost < 0) {
      throw new CreditError('Actual cost cannot be negative', 'INVALID_COST');
    }

    if (savingsGenerated < 0) {
      throw new CreditError('Savings generated cannot be negative', 'INVALID_SAVINGS');
    }

    const escrow = await this.escrowService.getEscrow(escrowId);
    if (!escrow) {
      throw new CreditError(`Escrow not found: ${escrowId}`, 'ESCROW_NOT_FOUND');
    }

    const transfers: Transfer[] = [];
    const royaltiesPaid: Transfer[] = [];

    try {
      // If actual cost is less than escrowed amount, return the difference
      if (actualCost < escrow.amount) {
        const refundAmount = escrow.amount - actualCost;
        
        // Partially release escrow - refund unused portion
        if (refundAmount > 0) {
          const { transfer } = await this.escrowService.partialRelease(
            escrowId,
            escrow.wallet_id, // Return to original wallet
            refundAmount
          );
          transfers.push(transfer);
        }

        // The remaining escrow amount should equal actualCost
        // We'll release this to a "system" wallet or simply cancel the remaining escrow
        if (actualCost > 0) {
          await this.escrowService.cancelEscrow(escrowId);
        }
      } else if (actualCost > escrow.amount) {
        // Need to charge more than escrowed - create a lien for the difference
        const additionalCost = actualCost - escrow.amount;
        
        await this.lienService.createLien(
          escrow.wallet_id,
          'SYSTEM', // System wallet for compute costs
          additionalCost,
          `Additional compute cost for job (escrow ${escrowId})`,
          1 // High priority
        );

        // Release all escrowed funds to system
        await this.escrowService.cancelEscrow(escrowId);
      } else {
        // Exact match - simply cancel escrow (funds consumed)
        await this.escrowService.cancelEscrow(escrowId);
      }

      // Handle royalty distributions if savings were generated
      if (savingsGenerated > 0) {
        const computeRoyalties = await this.royaltyService.distributeRoyalties(
          escrow.wallet_id,
          savingsGenerated,
          'on_savings'
        );
        royaltiesPaid.push(...computeRoyalties);

        // Also trigger any "on_compute" royalties based on actual cost
        if (actualCost > 0) {
          const profitRoyalties = await this.royaltyService.distributeRoyalties(
            escrow.wallet_id,
            actualCost,
            'on_compute'
          );
          royaltiesPaid.push(...profitRoyalties);
        }
      }

    } catch (error) {
      // If anything fails, we should still try to clean up the escrow
      try {
        await this.escrowService.cancelEscrow(escrowId);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup escrow ${escrowId}:`, cleanupError);
      }
      
      throw error;
    }

    return { transfers, royaltiesPaid };
  }

  /**
   * Process a deposit with automatic lien settlement
   */
  async processDeposit(walletId: string, amount: number): Promise<DepositProcessResult> {
    if (amount <= 0) {
      throw new CreditError('Deposit amount must be positive', 'INVALID_AMOUNT');
    }

    // First, make the deposit
    const depositTransfer = await this.walletService.deposit(
      walletId,
      amount,
      `External deposit: ${amount}`
    );

    // Then, automatically settle liens in priority order
    const liensSettled = await this.lienService.autoSettleOnDeposit(walletId, amount);

    // Calculate net deposit (amount that remains available after lien settlement)
    const totalSettled = liensSettled.reduce((sum, transfer) => sum + transfer.amount, 0);
    const netDeposit = amount - totalSettled;

    return { netDeposit, liensSettled };
  }

  /**
   * Get comprehensive financial status for a wallet
   */
  async getWalletStatus(walletId: string): Promise<{
    wallet: any;
    availableBalance: number;
    totalLiens: number;
    totalReserved: number;
    activeLiens: any[];
    activeEscrows: any[];
    recentTransfers: any[];
  }> {
    const wallet = await this.walletService.getWallet(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    const [
      availableBalance,
      totalLiens,
      totalReserved,
      activeLiens,
      activeEscrows,
      recentTransfers
    ] = await Promise.all([
      this.walletService.getAvailableBalance(walletId),
      this.lienService.getTotalLienAmount(walletId),
      this.escrowService.getTotalReserved(walletId),
      this.lienService.getLiensAgainst(walletId),
      this.escrowService.getActiveEscrows(walletId),
      this.walletService.getTransferHistory(walletId, 10)
    ]);

    return {
      wallet,
      availableBalance,
      totalLiens,
      totalReserved,
      activeLiens,
      activeEscrows,
      recentTransfers
    };
  }

  /**
   * Emergency wallet recovery - settle all liens and release all escrows
   */
  async emergencyWalletRecovery(walletId: string): Promise<{
    liensSettled: Transfer[];
    escrowsCancelled: string[];
    errors: string[];
  }> {
    const wallet = await this.walletService.getWallet(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    const liensSettled: Transfer[] = [];
    const escrowsCancelled: string[] = [];
    const errors: string[] = [];

    // Try to settle all liens
    const liens = await this.lienService.getLiensAgainst(walletId);
    for (const lien of liens) {
      try {
        const transfer = await this.lienService.settleLien(lien.id);
        liensSettled.push(transfer);
      } catch (error) {
        errors.push(`Failed to settle lien ${lien.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Cancel all active escrows
    const escrows = await this.escrowService.getActiveEscrows(walletId);
    for (const escrow of escrows) {
      try {
        await this.escrowService.cancelEscrow(escrow.id);
        escrowsCancelled.push(escrow.id);
      } catch (error) {
        errors.push(`Failed to cancel escrow ${escrow.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { liensSettled, escrowsCancelled, errors };
  }

  /**
   * Validate system integrity - check for inconsistencies
   */
  async validateSystemIntegrity(): Promise<{
    valid: boolean;
    issues: string[];
    walletSummary: {
      totalWallets: number;
      totalBalance: number;
      totalAvailable: number;
      totalReserved: number;
      totalLiens: number;
    };
  }> {
    const issues: string[] = [];
    
    try {
      const allWallets = await this.walletService.getAllWallets();
      let totalBalance = 0;
      let totalAvailable = 0;
      let totalReserved = 0;
      let totalLiens = 0;

      // Check each wallet for consistency
      for (const wallet of allWallets) {
        totalBalance += wallet.balance;
        totalAvailable += wallet.available;
        totalReserved += wallet.reserved;

        const liens = await this.lienService.getTotalLienAmount(wallet.id);
        totalLiens += liens;

        const escrowReserved = await this.escrowService.getTotalReserved(wallet.id);

        // Check if available balance calculation is correct
        const expectedAvailable = Math.max(0, wallet.balance - wallet.reserved - liens);
        if (Math.abs(wallet.available - expectedAvailable) > 0.01) {
          issues.push(`Wallet ${wallet.id}: available balance mismatch (has ${wallet.available}, expected ${expectedAvailable})`);
        }

        // Check if reserved amount matches escrow total
        if (Math.abs(wallet.reserved - escrowReserved) > 0.01) {
          issues.push(`Wallet ${wallet.id}: reserved amount mismatch (wallet has ${wallet.reserved}, escrows total ${escrowReserved})`);
        }
      }

      const walletSummary = {
        totalWallets: allWallets.length,
        totalBalance,
        totalAvailable,
        totalReserved,
        totalLiens
      };

      return {
        valid: issues.length === 0,
        issues,
        walletSummary
      };

    } catch (error) {
      issues.push(`System validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        valid: false,
        issues,
        walletSummary: {
          totalWallets: 0,
          totalBalance: 0,
          totalAvailable: 0,
          totalReserved: 0,
          totalLiens: 0
        }
      };
    }
  }
}