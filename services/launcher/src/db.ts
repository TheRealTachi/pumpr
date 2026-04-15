import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type LaunchStatus =
  | "awaiting_deposit"
  | "ready_to_launch"
  | "launching"
  | "launched"
  | "failed";

export interface LaunchRecord {
  id: string;
  name: string;
  symbol: string;
  description: string;
  image_path: string | null;
  image_mime: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  dev_wallet_pubkey: string;
  encrypted_privkey: string;
  mint_pubkey: string | null;
  pool_pubkey: string | null;
  status: LaunchStatus;
  error: string | null;
  created_at: number;
  launched_at: number | null;
}

export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const ensureColumn = (table: string, col: string, type = "TEXT") => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    } catch {
      /* already exists */
    }
  };
  const migrate = () => {
    ["image_path", "image_mime", "twitter", "telegram", "website"].forEach(
      (c) => ensureColumn("launches", c, "TEXT"),
    );
    ensureColumn("pool_stats", "price_sol", "REAL NOT NULL DEFAULT 0");
    ensureColumn("pool_stats", "market_cap_sol", "REAL NOT NULL DEFAULT 0");
    ensureColumn(
      "pool_stats",
      "bonding_progress",
      "REAL NOT NULL DEFAULT 0",
    );
    ensureColumn(
      "pool_stats",
      "graduated",
      "INTEGER NOT NULL DEFAULT 0",
    );
    ensureColumn("pool_stats", "holders", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("pool_stats", "vol_24h_sol", "REAL NOT NULL DEFAULT 0");
    ensureColumn("pool_stats", "tx_count_24h", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(
      "pool_stats",
      "creator_unclaimed_lamports",
      "TEXT NOT NULL DEFAULT '0'",
    );
  };
  db.exec(`
    CREATE TABLE IF NOT EXISTS launches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      image_mime TEXT,
      twitter TEXT,
      telegram TEXT,
      website TEXT,
      dev_wallet_pubkey TEXT NOT NULL UNIQUE,
      encrypted_privkey TEXT NOT NULL,
      mint_pubkey TEXT,
      pool_pubkey TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      launched_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_status ON launches(status);

    /* pool stats populated by indexer */
    CREATE TABLE IF NOT EXISTS pool_stats (
      mint TEXT PRIMARY KEY,
      total_staked TEXT NOT NULL DEFAULT '0',
      total_weighted_shares TEXT NOT NULL DEFAULT '0',
      lifetime_rewards TEXT NOT NULL DEFAULT '0',
      mint_supply TEXT NOT NULL DEFAULT '0',
      stake_pct REAL NOT NULL DEFAULT 0,
      price_sol REAL NOT NULL DEFAULT 0,
      market_cap_sol REAL NOT NULL DEFAULT 0,
      bonding_progress REAL NOT NULL DEFAULT 0,
      graduated INTEGER NOT NULL DEFAULT 0,
      holders INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    /* 3 escrow wallets per pool — 1d / 3d / 7d lock periods */
    CREATE TABLE IF NOT EXISTS stake_escrows (
      pubkey TEXT PRIMARY KEY,
      launch_id TEXT NOT NULL,
      mint TEXT NOT NULL,
      tier TEXT NOT NULL,                       /* '1d' | '3d' | '7d' */
      encrypted_privkey TEXT NOT NULL,
      ata TEXT,                                 /* escrow's associated token account */
      last_indexed_amount TEXT NOT NULL DEFAULT '0',
      created_at INTEGER NOT NULL,
      UNIQUE(launch_id, tier)
    );
    CREATE INDEX IF NOT EXISTS idx_escrows_mint ON stake_escrows(mint);

    /* User deposits into an escrow */
    CREATE TABLE IF NOT EXISTS stake_deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint TEXT NOT NULL,
      escrow_pubkey TEXT NOT NULL,
      tier TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      deposit_sig TEXT,
      received_at INTEGER NOT NULL,             /* unix ms */
      unlocks_at INTEGER NOT NULL,              /* unix ms */
      returned_at INTEGER,
      return_sig TEXT,
      pending_sol TEXT NOT NULL DEFAULT '0',
      claimed_sol TEXT NOT NULL DEFAULT '0'
    );
    CREATE INDEX IF NOT EXISTS idx_deposits_mint_sender ON stake_deposits(mint, sender_address);
    CREATE INDEX IF NOT EXISTS idx_deposits_active ON stake_deposits(returned_at) WHERE returned_at IS NULL;

    /* Price history for chart — one row per indexer tick, aggregated to
       candles by the API */
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint TEXT NOT NULL,
      price_sol REAL NOT NULL,
      market_cap_sol REAL NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_mint_ts ON price_history(mint, recorded_at);

    /* Trade feed ingested from pumpportal websocket */
    CREATE TABLE IF NOT EXISTS trades (
      signature TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      trader TEXT NOT NULL,
      side TEXT NOT NULL,              /* 'buy' | 'sell' */
      sol_amount REAL NOT NULL,
      token_amount REAL NOT NULL,
      market_cap_sol REAL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trades_mint_ts ON trades(mint, ts);

    /* Top holders — refreshed every 5 min */
    CREATE TABLE IF NOT EXISTS holders (
      mint TEXT NOT NULL,
      rank INTEGER NOT NULL,
      address TEXT NOT NULL,
      amount TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (mint, rank)
    );
  `);
  migrate();
  return db;
}
