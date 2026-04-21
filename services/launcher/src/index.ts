import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import crypto from "node:crypto";
import { openDb, type LaunchRecord } from "./db";
import { EnvAesKeyVault } from "./keyVault";
import { startWatcher, runLaunch, type WatcherConfig } from "./watcher";
import { startIndexer } from "./indexer";
import { startStreamflowIndexer } from "./streamflowIndexer";
import { startDistributionWorker } from "./distributionWorker";
import { startPumpPortalWs } from "./pumpportalWs";
import { startHoldersWorker } from "./holdersWorker";

const env = z
  .object({
    PORT: z.string().default("8787"),
    SOLANA_RPC_URL: z.string().url(),
    CLUSTER: z.string().default("localnet"),
    LAUNCH_DEPOSIT_LAMPORTS: z.string(),
    GAS_RESERVE_LAMPORTS: z.string(),
    DEV_BUY_SOL: z.string().default("0"),
    PUMPFUN_SLIPPAGE_BPS: z.string().default("500"),
    PUMPFUN_PRIORITY_FEE_SOL: z.string().default("0.00005"),
    STAKING_PROGRAM_ID: z.string(),
    PROTOCOL_TREASURY: z.string(),
    KEY_VAULT_MASTER_KEY_HEX: z.string().length(64),
    DB_PATH: z.string().default("./data/launcher.sqlite"),
    IMAGE_DIR: z.string().default("./data/images"),
    DISTRIBUTION_INTERVAL_MS: z.string().default("900000"),
  })
  .parse(process.env);

fs.mkdirSync(env.IMAGE_DIR, { recursive: true });
const db = openDb(env.DB_PATH);
const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
const keyVault = new EnvAesKeyVault(env.KEY_VAULT_MASTER_KEY_HEX);
const stakingProgramId = new PublicKey(env.STAKING_PROGRAM_ID);
const protocolTreasury = new PublicKey(env.PROTOCOL_TREASURY);

const watcherCfg: WatcherConfig = {
  db,
  connection,
  rpcUrl: env.SOLANA_RPC_URL,
  keyVault,
  stakingProgramId,
  protocolTreasury,
  depositLamports: BigInt(env.LAUNCH_DEPOSIT_LAMPORTS),
  devBuySol: Number(env.DEV_BUY_SOL),
  slippageBps: Number(env.PUMPFUN_SLIPPAGE_BPS),
  priorityFeeSol: Number(env.PUMPFUN_PRIORITY_FEE_SOL),
  pollMs: 5_000,
};
startWatcher(watcherCfg);

startIndexer({ db, connection, pollMs: 30_000 });
startStreamflowIndexer({
  db,
  connection,
  rpcUrl: env.SOLANA_RPC_URL,
  pollMs: 30_000,
});
startPumpPortalWs({ db, resubscribeMs: 15_000 });
startHoldersWorker({ db, connection, intervalMs: 300_000 });
startDistributionWorker({
  db,
  connection,
  rpcUrl: env.SOLANA_RPC_URL,
  keyVault,
  protocolTreasury,
  gasReserveLamports: BigInt(env.GAS_RESERVE_LAMPORTS),
  priorityFeeSol: Number(env.PUMPFUN_PRIORITY_FEE_SOL),
  intervalMs: Number(env.DISTRIBUTION_INTERVAL_MS),
});

const upload = multer({
  storage: multer.diskStorage({
    destination: env.IMAGE_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".png";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.mimetype)) {
      cb(new Error("only png/jpeg/gif/webp accepted"));
    } else cb(null, true);
  },
});

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  }),
);
app.use(express.json());
app.use("/images", express.static(env.IMAGE_DIR));

interface PoolStatsRow {
  mint: string;
  total_staked: string;
  total_weighted_shares: string;
  lifetime_rewards: string;
  mint_supply: string;
  stake_pct: number;
  price_sol: number;
  market_cap_sol: number;
  bonding_progress: number;
  graduated: number;
  holders: number;
  vol_24h_sol: number;
  tx_count_24h: number;
  updated_at: number;
}

function serialize(r: LaunchRecord, stats?: PoolStatsRow) {
  return {
    id: r.id,
    name: r.name,
    symbol: r.symbol,
    description: r.description,
    imageUrl: r.image_path
      ? `/images/${path.basename(r.image_path)}`
      : null,
    twitter: r.twitter,
    telegram: r.telegram,
    website: r.website,
    mint: r.mint_pubkey,
    pool: r.pool_pubkey,
    status: r.status,
    depositAddress: r.dev_wallet_pubkey,
    error: r.error,
    createdAt: r.created_at,
    launchedAt: r.launched_at,
    totalStaked: stats?.total_staked ?? "0",
    lifetimeRewards: stats?.lifetime_rewards ?? "0",
    mintSupply: stats?.mint_supply ?? "0",
    stakePct: stats?.stake_pct ?? 0,
    priceSol: stats?.price_sol ?? 0,
    marketCapSol: stats?.market_cap_sol ?? 0,
    bondingProgress: stats?.bonding_progress ?? 0,
    graduated: !!stats?.graduated,
    holders: stats?.holders ?? 0,
    vol24hSol: stats?.vol_24h_sol ?? 0,
    txCount24h: stats?.tx_count_24h ?? 0,
  };
}

app.get("/api/launches", (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const limit = Math.min(Number(req.query.limit ?? 100), 200);
  const rows = status
    ? (db
        .prepare(
          `SELECT * FROM launches WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(status, limit) as LaunchRecord[])
    : (db
        .prepare(`SELECT * FROM launches ORDER BY created_at DESC LIMIT ?`)
        .all(limit) as LaunchRecord[]);

  const statsStmt = db.prepare(`SELECT * FROM pool_stats WHERE mint = ?`);
  res.json({
    items: rows.map((r) =>
      serialize(
        r,
        r.mint_pubkey
          ? (statsStmt.get(r.mint_pubkey) as PoolStatsRow | undefined)
          : undefined,
      ),
    ),
  });
});

app.get("/api/tokens/:mint", (req, res) => {
  const row = db
    .prepare(`SELECT * FROM launches WHERE mint_pubkey = ?`)
    .get(req.params.mint) as LaunchRecord | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  const stats = db
    .prepare(`SELECT * FROM pool_stats WHERE mint = ?`)
    .get(req.params.mint) as PoolStatsRow | undefined;
  res.json(serialize(row, stats));
});

app.get("/api/tokens/:mint/stakers", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const includeEnded = req.query.all === "1";
  const rows = db
    .prepare(
      `SELECT stream_id, wallet, tier, amount, locked_at, unlocks_at, ended_at, claimed_sol
       FROM stake_locks
       WHERE mint = ? ${includeEnded ? "" : "AND ended_at IS NULL"}
       ORDER BY locked_at DESC LIMIT ?`,
    )
    .all(req.params.mint, limit);
  res.json({ items: rows });
});

app.get("/api/tokens/:mint/deposits", (req, res) => {
  const address =
    typeof req.query.address === "string" ? req.query.address : null;
  if (!address)
    return res.status(400).json({ error: "address query required" });
  const rows = db
    .prepare(
      `SELECT stream_id, tier, amount, locked_at, unlocks_at, ended_at, claimed_sol
       FROM stake_locks
       WHERE mint = ? AND wallet = ?
       ORDER BY locked_at DESC LIMIT 100`,
    )
    .all(req.params.mint, address);
  res.json({ items: rows });
});

app.get("/api/tokens/:mint/trades", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const rows = db
    .prepare(
      `SELECT signature, trader, side, sol_amount, token_amount, ts
       FROM trades WHERE mint = ?
       ORDER BY ts DESC LIMIT ?`,
    )
    .all(req.params.mint, limit) as {
    signature: string;
    trader: string;
    side: "buy" | "sell";
    sol_amount: number;
    token_amount: number;
    ts: number;
  }[];
  res.json({
    items: rows.map((r) => ({
      sig: r.signature,
      maker: r.trader,
      side: r.side,
      sol: r.sol_amount,
      tokens: r.token_amount,
      ts: r.ts,
    })),
  });
});

// Build candles from price_history. Each bucket aggregates a time window.
app.get("/api/tokens/:mint/candles", (req, res) => {
  const intervalSec =
    { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 }[
      String(req.query.interval ?? "1h")
    ] ?? 3600;
  const limit = Math.min(Number(req.query.limit ?? 200), 500);

  const rows = db
    .prepare(
      `SELECT recorded_at AS ts, price_sol AS price
       FROM price_history
       WHERE mint = ?
       ORDER BY recorded_at ASC`,
    )
    .all(req.params.mint) as { ts: number; price: number }[];

  if (rows.length === 0) return res.json({ items: [] });

  const buckets = new Map<
    number,
    { open: number; high: number; low: number; close: number }
  >();
  for (const r of rows) {
    const bucket = Math.floor(r.ts / 1000 / intervalSec) * intervalSec;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        open: r.price,
        high: r.price,
        low: r.price,
        close: r.price,
      });
    } else {
      existing.high = Math.max(existing.high, r.price);
      existing.low = Math.min(existing.low, r.price);
      existing.close = r.price;
    }
  }
  const sorted = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .slice(-limit);
  res.json({
    items: sorted.map(([time, c]) => ({ time, ...c })),
  });
});

app.get("/api/tokens/:mint/holders", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 20);
  const rows = db
    .prepare(
      `SELECT rank, address, amount FROM holders
       WHERE mint = ? ORDER BY rank ASC LIMIT ?`,
    )
    .all(req.params.mint, limit) as {
    rank: number;
    address: string;
    amount: string;
  }[];
  res.json({
    items: rows.map((r) => ({
      address: r.address,
      amount: Number(r.amount) / 1_000_000,
    })),
  });
});

const CreateLaunchSchema = z.object({
  name: z.string().min(1).max(64),
  symbol: z.string().min(1).max(10),
  description: z.string().max(500).default(""),
  twitter: z.string().max(200).optional().or(z.literal("")),
  telegram: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
});

app.post(
  "/api/launches",
  upload.single("image"),
  async (req, res) => {
    const parsed = CreateLaunchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const { name, symbol, description, twitter, telegram, website } =
      parsed.data;

    const dev = Keypair.generate();
    const encrypted = await keyVault.encrypt(dev.secretKey);
    const id = crypto.randomUUID();

    const row: LaunchRecord = {
      id,
      name,
      symbol,
      description,
      image_path: req.file?.path ?? null,
      image_mime: req.file?.mimetype ?? null,
      twitter: twitter || null,
      telegram: telegram || null,
      website: website || null,
      dev_wallet_pubkey: dev.publicKey.toBase58(),
      encrypted_privkey: encrypted,
      mint_pubkey: null,
      pool_pubkey: null,
      status: "awaiting_deposit",
      error: null,
      created_at: Date.now(),
      launched_at: null,
    };

    db.prepare(
      `INSERT INTO launches (id, name, symbol, description, image_path, image_mime, twitter, telegram, website, dev_wallet_pubkey, encrypted_privkey, status, created_at)
       VALUES (@id, @name, @symbol, @description, @image_path, @image_mime, @twitter, @telegram, @website, @dev_wallet_pubkey, @encrypted_privkey, @status, @created_at)`,
    ).run(row);

    res.json({
      id,
      depositAddress: dev.publicKey.toBase58(),
      depositLamports: env.LAUNCH_DEPOSIT_LAMPORTS,
      status: "awaiting_deposit",
    });
  },
);

app.get("/api/launches/:id", (req, res) => {
  const row = db
    .prepare(`SELECT * FROM launches WHERE id = ?`)
    .get(req.params.id) as LaunchRecord | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  const stats = row.mint_pubkey
    ? (db
        .prepare(`SELECT * FROM pool_stats WHERE mint = ?`)
        .get(row.mint_pubkey) as PoolStatsRow | undefined)
    : undefined;
  res.json(serialize(row, stats));
});

app.post("/api/launches/:id/launch", async (req, res) => {
  const row = db
    .prepare(`SELECT * FROM launches WHERE id = ?`)
    .get(req.params.id) as LaunchRecord | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.status !== "ready_to_launch") {
    return res.status(409).json({
      error: `cannot launch from status ${row.status}`,
    });
  }
  // Run async — client polls GET /api/launches/:id for progress.
  void runLaunch(watcherCfg, row);
  res.json({ ok: true, status: "launching" });
});

// SOL/USD rate for USD display
app.get("/api/sol-usd", async (_req, res) => {
  const { getSolUsd } = await import("./pumpfunOnchain");
  const price = await getSolUsd();
  res.json({ price });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(Number(env.PORT), () => {
  console.log(`[launcher] listening on :${env.PORT}`);
});
