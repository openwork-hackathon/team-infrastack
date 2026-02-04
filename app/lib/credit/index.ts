/**
 * Agent Credit Layer - Export all services and provide singleton instances
 */

// Export all types
export * from './types';

// Export all services
export { WalletService } from './wallet-service';
export { LienService } from './lien-service';
export { EscrowService } from './escrow-service';
export { RoyaltyService } from './royalty-service';
export { BondService } from './bond-service';
export { CreditEnforcement } from './enforcement';

// Import services for singleton creation
import { WalletService } from './wallet-service';
import { LienService } from './lien-service';
import { EscrowService } from './escrow-service';
import { RoyaltyService } from './royalty-service';
import { BondService } from './bond-service';
import { CreditEnforcement } from './enforcement';

/**
 * Singleton instances - use these for consistent state across the application
 */

// Create wallet service first (others depend on it)
export const walletService = new WalletService();

// Create services that depend on wallet service
export const lienService = new LienService(walletService);
export const escrowService = new EscrowService(walletService);
export const royaltyService = new RoyaltyService(walletService);
export const bondService = new BondService(walletService);

// Create enforcement service that orchestrates all others
export const creditEnforcement = new CreditEnforcement(
  walletService,
  lienService,
  escrowService,
  royaltyService
);

/**
 * Convenience object containing all services
 */
export const creditSystem = {
  walletService,
  lienService,
  escrowService,
  royaltyService,
  bondService,
  creditEnforcement
} as const;

/**
 * Initialize the credit system with default settings
 */
export async function initializeCreditSystem(config?: {
  createSystemWallet?: boolean;
  systemWalletId?: string;
}) {
  // Create system wallet for compute costs if requested
  if (config?.createSystemWallet) {
    try {
      const systemWalletId = config.systemWalletId || 'SYSTEM';
      const existingWallet = await walletService.getWalletByAgent(systemWalletId);
      
      if (!existingWallet) {
        const systemWallet = await walletService.createWallet(systemWalletId);
        console.log(`Created system wallet: ${systemWallet.id} for agent: ${systemWalletId}`);
      }
    } catch (error) {
      console.warn('Failed to create system wallet:', error);
    }
  }

  return creditSystem;
}

/**
 * Get system health status
 */
export async function getSystemHealth() {
  try {
    const integrity = await creditEnforcement.validateSystemIntegrity();
    const allWallets = await walletService.getAllWallets();
    const allLiens = await lienService.getAllLiens();
    const allEscrows = await escrowService.getAllEscrows();
    const allAgreements = await royaltyService.getAllAgreements();
    const allBonds = await bondService.getAllBonds();

    return {
      status: integrity.valid ? 'healthy' : 'issues_detected',
      integrity,
      counts: {
        wallets: allWallets.length,
        liens: allLiens.length,
        escrows: allEscrows.length,
        royaltyAgreements: allAgreements.length,
        bonds: allBonds.length
      },
      uptime: Date.now(), // Could be enhanced with actual uptime tracking
      version: '1.0.0'
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      counts: {
        wallets: 0,
        liens: 0,
        escrows: 0,
        royaltyAgreements: 0,
        bonds: 0
      },
      uptime: Date.now(),
      version: '1.0.0'
    };
  }
}

/**
 * Utility functions for common operations
 */
export const creditUtils = {
  /**
   * Create an agent wallet if it doesn't exist
   */
  async ensureWallet(agentId: string) {
    let wallet = await walletService.getWalletByAgent(agentId);
    if (!wallet) {
      wallet = await walletService.createWallet(agentId);
    }
    return wallet;
  },

  /**
   * Quick balance check
   */
  async getQuickBalance(agentId: string) {
    const wallet = await walletService.getWalletByAgent(agentId);
    if (!wallet) return null;
    
    return {
      balance: wallet.balance,
      available: await walletService.getAvailableBalance(wallet.id),
      liens: await lienService.getTotalLienAmount(wallet.id),
      reserved: await escrowService.getTotalReserved(wallet.id)
    };
  },

  /**
   * Process a simple agent-to-agent payment
   */
  async agentPayment(fromAgentId: string, toAgentId: string, amount: number, memo: string) {
    const fromWallet = await this.ensureWallet(fromAgentId);
    const toWallet = await this.ensureWallet(toAgentId);

    const canSpend = await creditEnforcement.canSpend(fromWallet.id, amount);
    if (!canSpend.allowed) {
      throw new Error(canSpend.reason);
    }

    return await walletService.internalTransfer(fromWallet.id, toWallet.id, amount, memo);
  },

  /**
   * Set up compute job payment
   */
  async setupComputeJob(agentId: string, estimatedCost: number, jobId: string) {
    const wallet = await this.ensureWallet(agentId);
    return await creditEnforcement.reserveForJob(wallet.id, estimatedCost, jobId);
  },

  /**
   * Complete compute job payment
   */
  async completeComputeJob(escrowId: string, actualCost: number, savingsGenerated?: number) {
    return await creditEnforcement.completeJob(escrowId, actualCost, savingsGenerated);
  }
} as const;

/**
 * Default export for convenience
 */
export default creditSystem;