/**
 * Wallet Service - Core wallet management and balance operations
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  Wallet, 
  Transfer, 
  WalletNotFoundError, 
  InsufficientFundsError,
  CreditError 
} from './types';

export class WalletService {
  private wallets = new Map<string, Wallet>();
  private walletsByAgent = new Map<string, string>(); // agent_id -> wallet_id
  private transfers = new Map<string, Transfer>();

  /**
   * Create a new wallet for an agent
   */
  async createWallet(agentId: string): Promise<Wallet> {
    // Check if agent already has a wallet
    if (this.walletsByAgent.has(agentId)) {
      throw new CreditError(`Agent ${agentId} already has a wallet`, 'WALLET_EXISTS');
    }

    const walletId = uuidv4();
    const now = new Date();
    
    const wallet: Wallet = {
      id: walletId,
      agent_id: agentId,
      balance: 0,
      available: 0,
      reserved: 0,
      created_at: now,
      updated_at: now
    };

    this.wallets.set(walletId, wallet);
    this.walletsByAgent.set(agentId, walletId);

    return wallet;
  }

  /**
   * Get wallet by ID
   */
  async getWallet(walletId: string): Promise<Wallet | null> {
    const wallet = this.wallets.get(walletId);
    return wallet || null;
  }

  /**
   * Get wallet by agent ID
   */
  async getWalletByAgent(agentId: string): Promise<Wallet | null> {
    const walletId = this.walletsByAgent.get(agentId);
    if (!walletId) return null;
    
    return this.getWallet(walletId);
  }

  /**
   * Deposit funds into a wallet
   */
  async deposit(walletId: string, amount: number, memo: string): Promise<Transfer> {
    if (amount <= 0) {
      throw new CreditError('Deposit amount must be positive', 'INVALID_AMOUNT');
    }

    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    // Create transfer record
    const transfer: Transfer = {
      id: uuidv4(),
      from_wallet_id: 'EXTERNAL', // External deposit
      to_wallet_id: walletId,
      amount,
      memo,
      transfer_type: 'direct',
      created_at: new Date()
    };

    // Update wallet balance
    wallet.balance += amount;
    wallet.updated_at = new Date();

    // Recalculate available balance
    await this.recalculateAvailable(walletId);

    // Store transfer
    this.transfers.set(transfer.id, transfer);

    return transfer;
  }

  /**
   * Get available balance (balance - reserved - liens)
   */
  async getAvailableBalance(walletId: string): Promise<number> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    return wallet.available;
  }

  /**
   * Internal helper to recalculate available balance
   * This will be called by other services when liens/escrows change
   */
  async recalculateAvailable(walletId: string): Promise<void> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    // Get total liens against this wallet
    const totalLiens = await this.getTotalLienAmount(walletId);
    
    // Get total reserved in escrow
    const totalReserved = wallet.reserved;

    // Calculate available = balance - reserved - liens
    wallet.available = Math.max(0, wallet.balance - totalReserved - totalLiens);
    wallet.updated_at = new Date();
  }

  /**
   * Helper method to get total lien amount (will be called by LienService)
   */
  private async getTotalLienAmount(walletId: string): Promise<number> {
    // This will be implemented by LienService
    // For now, return 0 to avoid circular dependency
    return 0;
  }

  /**
   * Internal transfer between wallets (used by other services)
   */
  async internalTransfer(
    fromWalletId: string, 
    toWalletId: string, 
    amount: number, 
    memo: string,
    transferType: Transfer['transfer_type'] = 'direct'
  ): Promise<Transfer> {
    if (amount <= 0) {
      throw new CreditError('Transfer amount must be positive', 'INVALID_AMOUNT');
    }

    const fromWallet = this.wallets.get(fromWalletId);
    const toWallet = this.wallets.get(toWalletId);

    if (!fromWallet) throw new WalletNotFoundError(fromWalletId);
    if (!toWallet) throw new WalletNotFoundError(toWalletId);

    // Check available balance
    if (fromWallet.available < amount) {
      throw new InsufficientFundsError(fromWallet.available, amount);
    }

    // Create transfer record
    const transfer: Transfer = {
      id: uuidv4(),
      from_wallet_id: fromWalletId,
      to_wallet_id: toWalletId,
      amount,
      memo,
      transfer_type: transferType,
      created_at: new Date()
    };

    // Update balances
    fromWallet.balance -= amount;
    fromWallet.updated_at = new Date();

    toWallet.balance += amount;
    toWallet.updated_at = new Date();

    // Recalculate available balances
    await this.recalculateAvailable(fromWalletId);
    await this.recalculateAvailable(toWalletId);

    // Store transfer
    this.transfers.set(transfer.id, transfer);

    return transfer;
  }

  /**
   * Update reserved amount (called by EscrowService)
   */
  async updateReserved(walletId: string, deltaAmount: number): Promise<void> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    wallet.reserved += deltaAmount;
    wallet.reserved = Math.max(0, wallet.reserved); // Ensure non-negative
    wallet.updated_at = new Date();

    await this.recalculateAvailable(walletId);
  }

  /**
   * Get transfer history for a wallet
   */
  async getTransferHistory(walletId: string, limit: number = 100): Promise<Transfer[]> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    return Array.from(this.transfers.values())
      .filter(t => t.from_wallet_id === walletId || t.to_wallet_id === walletId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit);
  }

  /**
   * Get all wallets (admin function)
   */
  async getAllWallets(): Promise<Wallet[]> {
    return Array.from(this.wallets.values());
  }
}