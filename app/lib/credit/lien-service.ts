/**
 * Lien Service - Debt management and automatic lien settlement
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  Lien, 
  Transfer, 
  LienNotFoundError, 
  WalletNotFoundError,
  CreditError 
} from './types';
import { WalletService } from './wallet-service';

export class LienService {
  private liens = new Map<string, Lien>();
  private walletService: WalletService;

  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  /**
   * Create a lien against a debtor wallet
   */
  async createLien(
    debtorWalletId: string, 
    creditorWalletId: string, 
    amount: number, 
    reason: string,
    priority: number = 1
  ): Promise<Lien> {
    if (amount <= 0) {
      throw new CreditError('Lien amount must be positive', 'INVALID_AMOUNT');
    }

    // Verify both wallets exist
    const debtorWallet = await this.walletService.getWallet(debtorWalletId);
    const creditorWallet = await this.walletService.getWallet(creditorWalletId);

    if (!debtorWallet) throw new WalletNotFoundError(debtorWalletId);
    if (!creditorWallet) throw new WalletNotFoundError(creditorWalletId);

    const lien: Lien = {
      id: uuidv4(),
      debtor_wallet_id: debtorWalletId,
      creditor_wallet_id: creditorWalletId,
      amount,
      priority,
      reason,
      created_at: new Date()
    };

    this.liens.set(lien.id, lien);

    // Recalculate debtor's available balance
    await this.walletService.recalculateAvailable(debtorWalletId);

    return lien;
  }

  /**
   * Get all liens against a wallet (debts owed by this wallet)
   */
  async getLiensAgainst(walletId: string): Promise<Lien[]> {
    return Array.from(this.liens.values())
      .filter(lien => lien.debtor_wallet_id === walletId && !lien.settled_at)
      .sort((a, b) => a.priority - b.priority); // Lower priority number = higher priority
  }

  /**
   * Get all liens owed to a wallet (debts owed to this wallet)
   */
  async getLiensOwed(walletId: string): Promise<Lien[]> {
    return Array.from(this.liens.values())
      .filter(lien => lien.creditor_wallet_id === walletId && !lien.settled_at)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get total amount of liens against a wallet
   */
  async getTotalLienAmount(walletId: string): Promise<number> {
    const liens = await this.getLiensAgainst(walletId);
    return liens.reduce((total, lien) => total + lien.amount, 0);
  }

  /**
   * Settle a specific lien
   */
  async settleLien(lienId: string): Promise<Transfer> {
    const lien = this.liens.get(lienId);
    if (!lien) {
      throw new LienNotFoundError(lienId);
    }

    if (lien.settled_at) {
      throw new CreditError(`Lien ${lienId} already settled`, 'LIEN_ALREADY_SETTLED');
    }

    // Check if debtor has sufficient available funds
    const debtorWallet = await this.walletService.getWallet(lien.debtor_wallet_id);
    if (!debtorWallet) {
      throw new WalletNotFoundError(lien.debtor_wallet_id);
    }

    if (debtorWallet.available < lien.amount) {
      throw new CreditError(
        `Insufficient funds to settle lien: ${debtorWallet.available} available, ${lien.amount} required`,
        'INSUFFICIENT_FUNDS'
      );
    }

    // Execute the transfer
    const transfer = await this.walletService.internalTransfer(
      lien.debtor_wallet_id,
      lien.creditor_wallet_id,
      lien.amount,
      `Lien settlement: ${lien.reason}`,
      'lien_settlement'
    );

    // Mark lien as settled
    lien.settled_at = new Date();

    // Recalculate debtor's available balance
    await this.walletService.recalculateAvailable(lien.debtor_wallet_id);

    return transfer;
  }

  /**
   * Automatically settle liens when funds are deposited
   * Settles liens in priority order (lower priority number = higher priority)
   */
  async autoSettleOnDeposit(walletId: string, depositAmount: number): Promise<Transfer[]> {
    const wallet = await this.walletService.getWallet(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    const liens = await this.getLiensAgainst(walletId);
    const transfers: Transfer[] = [];
    let remainingBalance = wallet.available;

    for (const lien of liens) {
      if (remainingBalance >= lien.amount) {
        try {
          const transfer = await this.settleLien(lien.id);
          transfers.push(transfer);
          remainingBalance -= lien.amount;
        } catch (error) {
          // If settlement fails for any reason, continue with next lien
          console.warn(`Failed to auto-settle lien ${lien.id}:`, error);
          continue;
        }
      } else {
        // Can't afford this lien, and since they're sorted by priority,
        // we can't afford any subsequent liens either
        break;
      }
    }

    return transfers;
  }

  /**
   * Get lien by ID
   */
  async getLien(lienId: string): Promise<Lien | null> {
    return this.liens.get(lienId) || null;
  }

  /**
   * Update lien priority
   */
  async updateLienPriority(lienId: string, newPriority: number): Promise<Lien> {
    const lien = this.liens.get(lienId);
    if (!lien) {
      throw new LienNotFoundError(lienId);
    }

    if (lien.settled_at) {
      throw new CreditError('Cannot update priority of settled lien', 'LIEN_ALREADY_SETTLED');
    }

    lien.priority = newPriority;

    // Recalculate debtor's available balance (priorities may affect settlement order)
    await this.walletService.recalculateAvailable(lien.debtor_wallet_id);

    return lien;
  }

  /**
   * Cancel/void an unsettled lien
   */
  async cancelLien(lienId: string): Promise<void> {
    const lien = this.liens.get(lienId);
    if (!lien) {
      throw new LienNotFoundError(lienId);
    }

    if (lien.settled_at) {
      throw new CreditError('Cannot cancel settled lien', 'LIEN_ALREADY_SETTLED');
    }

    // Remove the lien
    this.liens.delete(lienId);

    // Recalculate debtor's available balance
    await this.walletService.recalculateAvailable(lien.debtor_wallet_id);
  }

  /**
   * Get all liens (admin function)
   */
  async getAllLiens(): Promise<Lien[]> {
    return Array.from(this.liens.values());
  }

  /**
   * Get settlement history for liens
   */
  async getSettlementHistory(walletId: string, limit: number = 100): Promise<Lien[]> {
    return Array.from(this.liens.values())
      .filter(lien => 
        (lien.debtor_wallet_id === walletId || lien.creditor_wallet_id === walletId) 
        && lien.settled_at
      )
      .sort((a, b) => (b.settled_at?.getTime() || 0) - (a.settled_at?.getTime() || 0))
      .slice(0, limit);
  }
}