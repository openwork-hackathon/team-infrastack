import getDatabase from './database';
import { Wallet, Lien, Escrow, Transfer, RoyaltyAgreement, Bond } from './types';

export class CreditStore {
  private get db() {
    return getDatabase();
  }
  // Helper function to convert SQLite results to typed objects with Date conversion
  private convertDates<T>(obj: any): T {
    const result = { ...obj };
    
    // Convert date strings back to Date objects
    if (result.created_at) result.created_at = new Date(result.created_at);
    if (result.updated_at) result.updated_at = new Date(result.updated_at);
    if (result.settled_at) result.settled_at = new Date(result.settled_at);
    if (result.locked_at) result.locked_at = new Date(result.locked_at);
    if (result.released_at) result.released_at = new Date(result.released_at);
    if (result.maturity_date) result.maturity_date = new Date(result.maturity_date);
    
    // Convert boolean-like integers
    if ('active' in result) result.active = Boolean(result.active);
    
    return result as T;
  }

  // Wallets
  getWallet(id: string): Wallet | null {
    const result = this.db.prepare('SELECT * FROM wallets WHERE id = ?').get(id);
    return result ? this.convertDates<Wallet>(result) : null;
  }
  
  getWalletByAgent(agentId: string): Wallet | null {
    const result = this.db.prepare('SELECT * FROM wallets WHERE agent_id = ?').get(agentId);
    return result ? this.convertDates<Wallet>(result) : null;
  }
  
  saveWallet(wallet: Wallet): void {
    this.db.prepare(`
      INSERT INTO wallets (id, agent_id, balance, available, reserved, created_at, updated_at)
      VALUES (@id, @agent_id, @balance, @available, @reserved, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        balance = @balance,
        available = @available,
        reserved = @reserved,
        updated_at = @updated_at
    `).run({
      id: wallet.id,
      agent_id: wallet.agent_id,
      balance: wallet.balance,
      available: wallet.available,
      reserved: wallet.reserved,
      created_at: wallet.created_at?.toISOString() || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  getAllWallets(): Wallet[] {
    const results = this.db.prepare('SELECT * FROM wallets').all();
    return results.map(result => this.convertDates<Wallet>(result));
  }

  // Liens
  getLien(id: string): Lien | null {
    const result = this.db.prepare('SELECT * FROM liens WHERE id = ?').get(id);
    return result ? this.convertDates<Lien>(result) : null;
  }
  
  getLiensAgainst(walletId: string): Lien[] {
    const results = this.db.prepare('SELECT * FROM liens WHERE debtor_wallet_id = ? AND settled_at IS NULL ORDER BY priority ASC')
      .all(walletId);
    return results.map(result => this.convertDates<Lien>(result));
  }
  
  getLiensOwed(walletId: string): Lien[] {
    const results = this.db.prepare('SELECT * FROM liens WHERE creditor_wallet_id = ? AND settled_at IS NULL')
      .all(walletId);
    return results.map(result => this.convertDates<Lien>(result));
  }
  
  saveLien(lien: Lien): void {
    this.db.prepare(`
      INSERT INTO liens (id, debtor_wallet_id, creditor_wallet_id, amount, priority, reason, created_at, settled_at)
      VALUES (@id, @debtor_wallet_id, @creditor_wallet_id, @amount, @priority, @reason, @created_at, @settled_at)
      ON CONFLICT(id) DO UPDATE SET
        amount = @amount,
        settled_at = @settled_at
    `).run({
      id: lien.id,
      debtor_wallet_id: lien.debtor_wallet_id,
      creditor_wallet_id: lien.creditor_wallet_id,
      amount: lien.amount,
      priority: lien.priority,
      reason: lien.reason,
      created_at: lien.created_at?.toISOString() || new Date().toISOString(),
      settled_at: lien.settled_at?.toISOString() || null
    });
  }

  getAllLiens(): Lien[] {
    const results = this.db.prepare('SELECT * FROM liens').all();
    return results.map(result => this.convertDates<Lien>(result));
  }

  deleteLien(id: string): void {
    this.db.prepare('DELETE FROM liens WHERE id = ?').run(id);
  }

  getLienSettlementHistory(walletId: string, limit = 100): Lien[] {
    const results = this.db.prepare(`
      SELECT * FROM liens 
      WHERE (debtor_wallet_id = ? OR creditor_wallet_id = ?) AND settled_at IS NOT NULL
      ORDER BY settled_at DESC
      LIMIT ?
    `).all(walletId, walletId, limit);
    return results.map(result => this.convertDates<Lien>(result));
  }

  // Escrows
  getEscrow(id: string): Escrow | null {
    const result = this.db.prepare('SELECT * FROM escrows WHERE id = ?').get(id);
    return result ? this.convertDates<Escrow>(result) : null;
  }
  
  getActiveEscrows(walletId: string): Escrow[] {
    const results = this.db.prepare('SELECT * FROM escrows WHERE wallet_id = ? AND released_at IS NULL')
      .all(walletId);
    return results.map(result => this.convertDates<Escrow>(result));
  }
  
  saveEscrow(escrow: Escrow): void {
    this.db.prepare(`
      INSERT INTO escrows (id, wallet_id, amount, purpose, release_condition, locked_at, released_at)
      VALUES (@id, @wallet_id, @amount, @purpose, @release_condition, @locked_at, @released_at)
      ON CONFLICT(id) DO UPDATE SET
        amount = @amount,
        released_at = @released_at
    `).run({
      id: escrow.id,
      wallet_id: escrow.wallet_id,
      amount: escrow.amount,
      purpose: escrow.purpose,
      release_condition: escrow.release_condition,
      locked_at: escrow.locked_at?.toISOString() || new Date().toISOString(),
      released_at: escrow.released_at?.toISOString() || null
    });
  }

  getAllEscrows(): Escrow[] {
    const results = this.db.prepare('SELECT * FROM escrows').all();
    return results.map(result => this.convertDates<Escrow>(result));
  }

  getEscrowHistory(walletId: string, limit = 100): Escrow[] {
    const results = this.db.prepare(`
      SELECT * FROM escrows 
      WHERE wallet_id = ?
      ORDER BY locked_at DESC
      LIMIT ?
    `).all(walletId, limit);
    return results.map(result => this.convertDates<Escrow>(result));
  }

  findEscrowsByPurpose(purposePattern: string): Escrow[] {
    const results = this.db.prepare(`
      SELECT * FROM escrows 
      WHERE purpose LIKE ?
      ORDER BY locked_at DESC
    `).all(`%${purposePattern}%`);
    return results.map(result => this.convertDates<Escrow>(result));
  }

  // Transfers
  saveTransfer(transfer: Transfer): void {
    this.db.prepare(`
      INSERT INTO transfers (id, from_wallet_id, to_wallet_id, amount, memo, transfer_type, created_at)
      VALUES (@id, @from_wallet_id, @to_wallet_id, @amount, @memo, @transfer_type, @created_at)
    `).run({
      id: transfer.id,
      from_wallet_id: transfer.from_wallet_id || null,
      to_wallet_id: transfer.to_wallet_id,
      amount: transfer.amount,
      memo: transfer.memo,
      transfer_type: transfer.transfer_type,
      created_at: transfer.created_at?.toISOString() || new Date().toISOString()
    });
  }
  
  getTransferHistory(walletId: string, limit = 100): Transfer[] {
    const results = this.db.prepare(`
      SELECT * FROM transfers 
      WHERE from_wallet_id = ? OR to_wallet_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(walletId, walletId, limit);
    return results.map(result => this.convertDates<Transfer>(result));
  }

  // Royalty Agreements
  getRoyaltyAgreement(id: string): RoyaltyAgreement | null {
    const result = this.db.prepare('SELECT * FROM royalty_agreements WHERE id = ?').get(id);
    return result ? this.convertDates<RoyaltyAgreement>(result) : null;
  }
  
  getActiveAgreements(walletId: string): RoyaltyAgreement[] {
    const results = this.db.prepare('SELECT * FROM royalty_agreements WHERE source_wallet_id = ? AND active = 1')
      .all(walletId);
    return results.map(result => this.convertDates<RoyaltyAgreement>(result));
  }
  
  saveRoyaltyAgreement(agreement: RoyaltyAgreement): void {
    this.db.prepare(`
      INSERT INTO royalty_agreements (id, source_wallet_id, recipient_wallet_id, rate, trigger, active, created_at)
      VALUES (@id, @source_wallet_id, @recipient_wallet_id, @rate, @trigger, @active, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        rate = @rate,
        active = @active
    `).run({
      id: agreement.id,
      source_wallet_id: agreement.source_wallet_id,
      recipient_wallet_id: agreement.recipient_wallet_id,
      rate: agreement.rate,
      trigger: agreement.trigger,
      active: agreement.active ? 1 : 0,
      created_at: agreement.created_at?.toISOString() || new Date().toISOString()
    });
  }

  // Bonds
  getBond(id: string): Bond | null {
    const result = this.db.prepare('SELECT * FROM bonds WHERE id = ?').get(id);
    return result ? this.convertDates<Bond>(result) : null;
  }
  
  getAvailableBonds(): Bond[] {
    const results = this.db.prepare("SELECT * FROM bonds WHERE holder_wallet_id IS NULL AND status = 'active'")
      .all();
    return results.map(result => this.convertDates<Bond>(result));
  }
  
  getBondsByIssuer(walletId: string): Bond[] {
    const results = this.db.prepare('SELECT * FROM bonds WHERE issuer_wallet_id = ?')
      .all(walletId);
    return results.map(result => this.convertDates<Bond>(result));
  }
  
  saveBond(bond: Bond): void {
    this.db.prepare(`
      INSERT INTO bonds (id, issuer_wallet_id, holder_wallet_id, face_value, purchase_price, maturity_date, royalty_percentage, status, created_at)
      VALUES (@id, @issuer_wallet_id, @holder_wallet_id, @face_value, @purchase_price, @maturity_date, @royalty_percentage, @status, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        holder_wallet_id = @holder_wallet_id,
        purchase_price = @purchase_price,
        status = @status
    `).run({
      id: bond.id,
      issuer_wallet_id: bond.issuer_wallet_id,
      holder_wallet_id: bond.holder_wallet_id || null,
      face_value: bond.face_value,
      purchase_price: bond.purchase_price || null,
      maturity_date: bond.maturity_date?.toISOString() || new Date().toISOString(),
      royalty_percentage: bond.royalty_percentage,
      status: bond.status,
      created_at: bond.created_at?.toISOString() || new Date().toISOString()
    });
  }
}

export const creditStore = new CreditStore();