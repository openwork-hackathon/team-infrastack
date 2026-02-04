/**
 * Bond Service - Issue and manage bonds backed by future royalties
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  Bond, 
  Transfer, 
  WalletNotFoundError,
  InsufficientFundsError,
  CreditError 
} from './types';
import { WalletService } from './wallet-service';

export class BondService {
  private bonds = new Map<string, Bond>();
  private walletService: WalletService;

  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  /**
   * Issue a new bond backed by future royalties
   */
  async issueBond(
    issuerWalletId: string, 
    faceValue: number, 
    royaltyPercentage: number, 
    maturityDays: number
  ): Promise<Bond> {
    if (faceValue <= 0) {
      throw new CreditError('Face value must be positive', 'INVALID_AMOUNT');
    }

    if (royaltyPercentage < 0 || royaltyPercentage > 100) {
      throw new CreditError('Royalty percentage must be between 0 and 100', 'INVALID_PERCENTAGE');
    }

    if (maturityDays <= 0) {
      throw new CreditError('Maturity days must be positive', 'INVALID_MATURITY');
    }

    // Verify issuer wallet exists
    const issuerWallet = await this.walletService.getWallet(issuerWalletId);
    if (!issuerWallet) {
      throw new WalletNotFoundError(issuerWalletId);
    }

    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + maturityDays);

    const bond: Bond = {
      id: uuidv4(),
      issuer_wallet_id: issuerWalletId,
      holder_wallet_id: '', // Will be set when purchased
      face_value: faceValue,
      purchase_price: 0, // Will be set when purchased
      maturity_date: maturityDate,
      royalty_percentage: royaltyPercentage,
      status: 'active',
      created_at: new Date()
    };

    this.bonds.set(bond.id, bond);

    return bond;
  }

  /**
   * Purchase a bond
   */
  async purchaseBond(bondId: string, buyerWalletId: string, offerPrice?: number): Promise<Transfer> {
    const bond = this.bonds.get(bondId);
    if (!bond) {
      throw new CreditError(`Bond not found: ${bondId}`, 'BOND_NOT_FOUND');
    }

    if (bond.holder_wallet_id) {
      throw new CreditError('Bond already purchased', 'BOND_ALREADY_PURCHASED');
    }

    if (bond.status !== 'active') {
      throw new CreditError(`Bond is not available for purchase (status: ${bond.status})`, 'BOND_NOT_AVAILABLE');
    }

    if (bond.issuer_wallet_id === buyerWalletId) {
      throw new CreditError('Cannot purchase own bond', 'SELF_PURCHASE_ERROR');
    }

    // Verify buyer wallet exists
    const buyerWallet = await this.walletService.getWallet(buyerWalletId);
    if (!buyerWallet) {
      throw new WalletNotFoundError(buyerWalletId);
    }

    // Use offered price or default to 80% of face value
    const purchasePrice = offerPrice || Math.floor(bond.face_value * 0.8);

    if (buyerWallet.available < purchasePrice) {
      throw new InsufficientFundsError(buyerWallet.available, purchasePrice);
    }

    // Execute the purchase transfer
    const transfer = await this.walletService.internalTransfer(
      buyerWalletId,
      bond.issuer_wallet_id,
      purchasePrice,
      `Bond purchase: ${bondId} (${bond.royalty_percentage}% royalty claim)`,
      'direct'
    );

    // Update bond ownership
    bond.holder_wallet_id = buyerWalletId;
    bond.purchase_price = purchasePrice;

    return transfer;
  }

  /**
   * Mature a bond (pay face value to holder)
   */
  async matureBond(bondId: string): Promise<Transfer> {
    const bond = this.bonds.get(bondId);
    if (!bond) {
      throw new CreditError(`Bond not found: ${bondId}`, 'BOND_NOT_FOUND');
    }

    if (bond.status !== 'active') {
      throw new CreditError(`Bond cannot be matured (status: ${bond.status})`, 'BOND_NOT_ACTIVE');
    }

    if (!bond.holder_wallet_id) {
      throw new CreditError('Bond has no holder', 'BOND_NO_HOLDER');
    }

    if (new Date() < bond.maturity_date) {
      throw new CreditError('Bond has not reached maturity date', 'BOND_NOT_MATURE');
    }

    // Check if issuer has sufficient funds
    const issuerWallet = await this.walletService.getWallet(bond.issuer_wallet_id);
    if (!issuerWallet) {
      // Issuer wallet missing - default the bond
      bond.status = 'defaulted';
      throw new CreditError('Bond defaulted: issuer wallet not found', 'BOND_DEFAULTED');
    }

    if (issuerWallet.available < bond.face_value) {
      // Insufficient funds - default the bond
      bond.status = 'defaulted';
      throw new CreditError(
        `Bond defaulted: issuer has ${issuerWallet.available}, bond requires ${bond.face_value}`,
        'BOND_DEFAULTED'
      );
    }

    // Execute maturity payment
    const transfer = await this.walletService.internalTransfer(
      bond.issuer_wallet_id,
      bond.holder_wallet_id,
      bond.face_value,
      `Bond maturity payment: ${bondId}`,
      'direct'
    );

    // Mark bond as matured
    bond.status = 'matured';

    return transfer;
  }

  /**
   * Check for bonds that should be matured or defaulted
   */
  async checkForDefaults(): Promise<Bond[]> {
    const now = new Date();
    const defaultedBonds: Bond[] = [];

    for (const bond of this.bonds.values()) {
      if (bond.status === 'active' && bond.holder_wallet_id && now >= bond.maturity_date) {
        try {
          // Attempt to mature the bond
          await this.matureBond(bond.id);
        } catch (error) {
          // If maturation fails, it's likely defaulted
          if (error instanceof CreditError && error.code === 'BOND_DEFAULTED') {
            defaultedBonds.push(bond);
          }
        }
      }
    }

    return defaultedBonds;
  }

  /**
   * Get bond by ID
   */
  async getBond(bondId: string): Promise<Bond | null> {
    return this.bonds.get(bondId) || null;
  }

  /**
   * Get bonds issued by a wallet
   */
  async getBondsIssuedBy(issuerWalletId: string): Promise<Bond[]> {
    return Array.from(this.bonds.values())
      .filter(bond => bond.issuer_wallet_id === issuerWalletId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Get bonds held by a wallet
   */
  async getBondsHeldBy(holderWalletId: string): Promise<Bond[]> {
    return Array.from(this.bonds.values())
      .filter(bond => bond.holder_wallet_id === holderWalletId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Get available bonds for purchase
   */
  async getAvailableBonds(): Promise<Bond[]> {
    return Array.from(this.bonds.values())
      .filter(bond => bond.status === 'active' && !bond.holder_wallet_id)
      .sort((a, b) => a.maturity_date.getTime() - b.maturity_date.getTime());
  }

  /**
   * Get bonds by status
   */
  async getBondsByStatus(status: Bond['status']): Promise<Bond[]> {
    return Array.from(this.bonds.values())
      .filter(bond => bond.status === status)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Calculate potential return on investment for a bond
   */
  calculatePotentialROI(bond: Bond, purchasePrice?: number): {
    purchasePrice: number;
    faceValue: number;
    potentialGain: number;
    roiPercentage: number;
    daysToMaturity: number;
    annualizedROI: number;
  } {
    const price = purchasePrice || Math.floor(bond.face_value * 0.8);
    const potentialGain = bond.face_value - price;
    const roiPercentage = (potentialGain / price) * 100;
    
    const now = new Date();
    const daysToMaturity = Math.max(0, Math.ceil((bond.maturity_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    
    const annualizedROI = daysToMaturity > 0 ? (roiPercentage * 365) / daysToMaturity : 0;

    return {
      purchasePrice: price,
      faceValue: bond.face_value,
      potentialGain,
      roiPercentage,
      daysToMaturity,
      annualizedROI
    };
  }

  /**
   * Cancel an unpurchased bond
   */
  async cancelBond(bondId: string): Promise<void> {
    const bond = this.bonds.get(bondId);
    if (!bond) {
      throw new CreditError(`Bond not found: ${bondId}`, 'BOND_NOT_FOUND');
    }

    if (bond.holder_wallet_id) {
      throw new CreditError('Cannot cancel purchased bond', 'BOND_ALREADY_PURCHASED');
    }

    if (bond.status !== 'active') {
      throw new CreditError(`Cannot cancel bond with status: ${bond.status}`, 'BOND_NOT_ACTIVE');
    }

    // Remove the bond
    this.bonds.delete(bondId);
  }

  /**
   * Get bonds nearing maturity (within specified days)
   */
  async getBondsNearingMaturity(withinDays: number = 7): Promise<Bond[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + withinDays);

    return Array.from(this.bonds.values())
      .filter(bond => 
        bond.status === 'active' &&
        bond.holder_wallet_id &&
        bond.maturity_date <= cutoffDate
      )
      .sort((a, b) => a.maturity_date.getTime() - b.maturity_date.getTime());
  }

  /**
   * Get all bonds (admin function)
   */
  async getAllBonds(): Promise<Bond[]> {
    return Array.from(this.bonds.values());
  }

  /**
   * Update bond terms (only for unpurchased bonds)
   */
  async updateBondTerms(
    bondId: string, 
    updates: { 
      face_value?: number; 
      royalty_percentage?: number; 
      maturity_date?: Date;
    }
  ): Promise<Bond> {
    const bond = this.bonds.get(bondId);
    if (!bond) {
      throw new CreditError(`Bond not found: ${bondId}`, 'BOND_NOT_FOUND');
    }

    if (bond.holder_wallet_id) {
      throw new CreditError('Cannot update terms of purchased bond', 'BOND_ALREADY_PURCHASED');
    }

    if (bond.status !== 'active') {
      throw new CreditError(`Cannot update bond with status: ${bond.status}`, 'BOND_NOT_ACTIVE');
    }

    if (updates.face_value !== undefined) {
      if (updates.face_value <= 0) {
        throw new CreditError('Face value must be positive', 'INVALID_AMOUNT');
      }
      bond.face_value = updates.face_value;
    }

    if (updates.royalty_percentage !== undefined) {
      if (updates.royalty_percentage < 0 || updates.royalty_percentage > 100) {
        throw new CreditError('Royalty percentage must be between 0 and 100', 'INVALID_PERCENTAGE');
      }
      bond.royalty_percentage = updates.royalty_percentage;
    }

    if (updates.maturity_date !== undefined) {
      if (updates.maturity_date <= new Date()) {
        throw new CreditError('Maturity date must be in the future', 'INVALID_MATURITY');
      }
      bond.maturity_date = updates.maturity_date;
    }

    return bond;
  }
}