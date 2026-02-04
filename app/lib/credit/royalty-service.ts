/**
 * Royalty Service - Manage royalty agreements and automatic distributions
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  RoyaltyAgreement, 
  Transfer, 
  WalletNotFoundError,
  CreditError 
} from './types';
import { WalletService } from './wallet-service';

export class RoyaltyService {
  private agreements = new Map<string, RoyaltyAgreement>();
  private walletService: WalletService;

  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  /**
   * Create a royalty agreement
   */
  async createAgreement(
    sourceWalletId: string, 
    recipientWalletId: string, 
    rate: number, 
    trigger: RoyaltyAgreement['trigger']
  ): Promise<RoyaltyAgreement> {
    if (rate < 0 || rate > 1) {
      throw new CreditError('Royalty rate must be between 0 and 1', 'INVALID_RATE');
    }

    if (sourceWalletId === recipientWalletId) {
      throw new CreditError('Source and recipient wallets cannot be the same', 'SAME_WALLET_ERROR');
    }

    // Verify both wallets exist
    const sourceWallet = await this.walletService.getWallet(sourceWalletId);
    const recipientWallet = await this.walletService.getWallet(recipientWalletId);

    if (!sourceWallet) throw new WalletNotFoundError(sourceWalletId);
    if (!recipientWallet) throw new WalletNotFoundError(recipientWalletId);

    const agreement: RoyaltyAgreement = {
      id: uuidv4(),
      source_wallet_id: sourceWalletId,
      recipient_wallet_id: recipientWalletId,
      rate,
      trigger,
      active: true,
      created_at: new Date()
    };

    this.agreements.set(agreement.id, agreement);

    return agreement;
  }

  /**
   * Deactivate a royalty agreement
   */
  async deactivateAgreement(agreementId: string): Promise<void> {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) {
      throw new CreditError(`Royalty agreement not found: ${agreementId}`, 'AGREEMENT_NOT_FOUND');
    }

    agreement.active = false;
  }

  /**
   * Reactivate a royalty agreement
   */
  async reactivateAgreement(agreementId: string): Promise<void> {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) {
      throw new CreditError(`Royalty agreement not found: ${agreementId}`, 'AGREEMENT_NOT_FOUND');
    }

    agreement.active = true;
  }

  /**
   * Distribute royalties based on a trigger event
   */
  async distributeRoyalties(
    sourceWalletId: string, 
    grossAmount: number, 
    trigger: RoyaltyAgreement['trigger']
  ): Promise<Transfer[]> {
    if (grossAmount <= 0) {
      throw new CreditError('Gross amount must be positive', 'INVALID_AMOUNT');
    }

    // Get active agreements for this source wallet and trigger
    const activeAgreements = Array.from(this.agreements.values())
      .filter(agreement => 
        agreement.source_wallet_id === sourceWalletId &&
        agreement.trigger === trigger &&
        agreement.active
      );

    if (activeAgreements.length === 0) {
      return []; // No royalties to distribute
    }

    const sourceWallet = await this.walletService.getWallet(sourceWalletId);
    if (!sourceWallet) {
      throw new WalletNotFoundError(sourceWalletId);
    }

    const transfers: Transfer[] = [];
    let totalRoyaltiesOwed = 0;

    // Calculate total royalties owed
    for (const agreement of activeAgreements) {
      const royaltyAmount = Math.floor(grossAmount * agreement.rate); // Floor to avoid fractional credits
      totalRoyaltiesOwed += royaltyAmount;
    }

    // Check if source wallet has sufficient funds for all royalties
    if (sourceWallet.available < totalRoyaltiesOwed) {
      throw new CreditError(
        `Insufficient funds for royalty distribution: ${sourceWallet.available} available, ${totalRoyaltiesOwed} required`,
        'INSUFFICIENT_FUNDS_FOR_ROYALTIES'
      );
    }

    // Execute royalty transfers
    for (const agreement of activeAgreements) {
      const royaltyAmount = Math.floor(grossAmount * agreement.rate);
      
      if (royaltyAmount > 0) {
        try {
          const transfer = await this.walletService.internalTransfer(
            sourceWalletId,
            agreement.recipient_wallet_id,
            royaltyAmount,
            `Royalty payment: ${agreement.rate * 100}% of ${grossAmount} (${trigger})`,
            'royalty'
          );
          
          transfers.push(transfer);
        } catch (error) {
          // Log error but continue with other royalties
          console.warn(`Failed to distribute royalty to ${agreement.recipient_wallet_id}:`, error);
        }
      }
    }

    return transfers;
  }

  /**
   * Get active agreements for a wallet (where wallet is source or recipient)
   */
  async getActiveAgreements(walletId: string): Promise<RoyaltyAgreement[]> {
    return Array.from(this.agreements.values())
      .filter(agreement => 
        (agreement.source_wallet_id === walletId || agreement.recipient_wallet_id === walletId) &&
        agreement.active
      )
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Get agreements where wallet is the source (paying royalties)
   */
  async getSourceAgreements(walletId: string): Promise<RoyaltyAgreement[]> {
    return Array.from(this.agreements.values())
      .filter(agreement => agreement.source_wallet_id === walletId && agreement.active)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Get agreements where wallet is the recipient (receiving royalties)
   */
  async getRecipientAgreements(walletId: string): Promise<RoyaltyAgreement[]> {
    return Array.from(this.agreements.values())
      .filter(agreement => agreement.recipient_wallet_id === walletId && agreement.active)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Calculate expected royalty obligations for a gross amount
   */
  async calculateRoyaltyObligations(
    sourceWalletId: string, 
    grossAmount: number, 
    trigger: RoyaltyAgreement['trigger']
  ): Promise<{ recipient_wallet_id: string; amount: number; rate: number }[]> {
    const activeAgreements = Array.from(this.agreements.values())
      .filter(agreement => 
        agreement.source_wallet_id === sourceWalletId &&
        agreement.trigger === trigger &&
        agreement.active
      );

    return activeAgreements.map(agreement => ({
      recipient_wallet_id: agreement.recipient_wallet_id,
      amount: Math.floor(grossAmount * agreement.rate),
      rate: agreement.rate
    }));
  }

  /**
   * Update royalty rate for an existing agreement
   */
  async updateRoyaltyRate(agreementId: string, newRate: number): Promise<RoyaltyAgreement> {
    if (newRate < 0 || newRate > 1) {
      throw new CreditError('Royalty rate must be between 0 and 1', 'INVALID_RATE');
    }

    const agreement = this.agreements.get(agreementId);
    if (!agreement) {
      throw new CreditError(`Royalty agreement not found: ${agreementId}`, 'AGREEMENT_NOT_FOUND');
    }

    if (!agreement.active) {
      throw new CreditError('Cannot update rate of inactive agreement', 'AGREEMENT_INACTIVE');
    }

    agreement.rate = newRate;

    return agreement;
  }

  /**
   * Get royalty agreement by ID
   */
  async getAgreement(agreementId: string): Promise<RoyaltyAgreement | null> {
    return this.agreements.get(agreementId) || null;
  }

  /**
   * Get all agreements by trigger type
   */
  async getAgreementsByTrigger(trigger: RoyaltyAgreement['trigger']): Promise<RoyaltyAgreement[]> {
    return Array.from(this.agreements.values())
      .filter(agreement => agreement.trigger === trigger && agreement.active)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Get total royalty rate burden for a source wallet and trigger
   */
  async getTotalRoyaltyRate(
    sourceWalletId: string, 
    trigger: RoyaltyAgreement['trigger']
  ): Promise<number> {
    const activeAgreements = Array.from(this.agreements.values())
      .filter(agreement => 
        agreement.source_wallet_id === sourceWalletId &&
        agreement.trigger === trigger &&
        agreement.active
      );

    return activeAgreements.reduce((total, agreement) => total + agreement.rate, 0);
  }

  /**
   * Delete a royalty agreement permanently
   */
  async deleteAgreement(agreementId: string): Promise<void> {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) {
      throw new CreditError(`Royalty agreement not found: ${agreementId}`, 'AGREEMENT_NOT_FOUND');
    }

    this.agreements.delete(agreementId);
  }

  /**
   * Get all agreements (admin function)
   */
  async getAllAgreements(): Promise<RoyaltyAgreement[]> {
    return Array.from(this.agreements.values());
  }
}