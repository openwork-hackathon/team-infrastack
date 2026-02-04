import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Lazy database initialization
let _db: Database.Database | null = null;

function getDatabase(): Database.Database {
  if (_db) return _db;

  // Initialize database
  const DB_PATH = process.env.CREDIT_DB_PATH || path.join(process.cwd(), 'data', 'credit.db');

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  _db.pragma('journal_mode = WAL');

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      agent_id TEXT UNIQUE NOT NULL,
      balance REAL DEFAULT 0,
      available REAL DEFAULT 0,
      reserved REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS liens (
      id TEXT PRIMARY KEY,
      debtor_wallet_id TEXT NOT NULL,
      creditor_wallet_id TEXT NOT NULL,
      amount REAL NOT NULL,
      priority INTEGER DEFAULT 0,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      settled_at TEXT,
      FOREIGN KEY (debtor_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (creditor_wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      amount REAL NOT NULL,
      purpose TEXT,
      release_condition TEXT,
      locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      released_at TEXT,
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      from_wallet_id TEXT,
      to_wallet_id TEXT,
      amount REAL NOT NULL,
      memo TEXT,
      transfer_type TEXT DEFAULT 'direct',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS royalty_agreements (
      id TEXT PRIMARY KEY,
      source_wallet_id TEXT NOT NULL,
      recipient_wallet_id TEXT NOT NULL,
      rate REAL NOT NULL,
      trigger TEXT DEFAULT 'on_compute',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (recipient_wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS bonds (
      id TEXT PRIMARY KEY,
      issuer_wallet_id TEXT NOT NULL,
      holder_wallet_id TEXT,
      face_value REAL NOT NULL,
      purchase_price REAL,
      maturity_date TEXT NOT NULL,
      royalty_percentage REAL NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issuer_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (holder_wallet_id) REFERENCES wallets(id)
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_agent ON wallets(agent_id);
    CREATE INDEX IF NOT EXISTS idx_liens_debtor ON liens(debtor_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_liens_creditor ON liens(creditor_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_escrows_wallet ON escrows(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_wallet_id);
  `);

  return _db;
}

export const db = getDatabase();
export default getDatabase;