import { Connection, PublicKey } from "@solana/web3.js";
import type Database from "better-sqlite3";
import type { LaunchRecord } from "./db";
import { executeLaunch } from "./launcher";
import type { KeyVault } from "./keyVault";

export interface WatcherConfig {
  db: Database.Database;
  connection: Connection;
  rpcUrl: string;
  keyVault: KeyVault;
  stakingProgramId: PublicKey;
  protocolTreasury: PublicKey;
  depositLamports: bigint;
  devBuySol: number;
  slippageBps: number;
  priorityFeeSol: number;
  pollMs: number;
}

// Deposit watcher — transitions awaiting_deposit → ready_to_launch once the
// target SOL amount lands in the dev wallet. The actual launch is triggered
// explicitly by the user via POST /api/launches/:id/launch (see index.ts);
// see runLaunch() below for the execution path.
export function startWatcher(cfg: WatcherConfig): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const rows = cfg.db
        .prepare(`SELECT * FROM launches WHERE status = 'awaiting_deposit'`)
        .all() as LaunchRecord[];
      for (const r of rows) {
        try {
          const bal = await cfg.connection.getBalance(
            new PublicKey(r.dev_wallet_pubkey),
          );
          if (BigInt(bal) >= cfg.depositLamports) {
            cfg.db
              .prepare(
                `UPDATE launches SET status = 'ready_to_launch' WHERE id = ?`,
              )
              .run(r.id);
            console.log(
              `[watcher] deposit detected for ${r.symbol} ${r.id.slice(0, 8)} — awaiting user launch`,
            );
          }
        } catch (e) {
          // RPC errors shouldn't poison the whole tick
          console.error(`[watcher] balance check failed ${r.id}`, e);
        }
      }
    } catch (e) {
      console.error("[watcher] tick error", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.pollMs);
    }
  };
  setTimeout(tick, cfg.pollMs);
  return () => {
    stopped = true;
  };
}

// Triggered by the API. Returns promptly; launch runs async.
export async function runLaunch(
  cfg: WatcherConfig,
  record: LaunchRecord,
): Promise<void> {
  cfg.db
    .prepare(`UPDATE launches SET status='launching' WHERE id=?`)
    .run(record.id);
  try {
    const { mint, pool } = await executeLaunch({
      db: cfg.db,
      record,
      connection: cfg.connection,
      rpcUrl: cfg.rpcUrl,
      keyVault: cfg.keyVault,
      stakingProgramId: cfg.stakingProgramId,
      protocolTreasury: cfg.protocolTreasury,
      devBuySol: cfg.devBuySol,
      slippageBps: cfg.slippageBps,
      priorityFeeSol: cfg.priorityFeeSol,
    });
    cfg.db
      .prepare(
        `UPDATE launches SET status='launched', mint_pubkey=?, pool_pubkey=?, launched_at=? WHERE id=?`,
      )
      .run(mint, pool, Date.now(), record.id);
    console.log(`[watcher] launched ${record.symbol} mint=${mint}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    cfg.db
      .prepare(`UPDATE launches SET status='failed', error=? WHERE id=?`)
      .run(msg, record.id);
    console.error(`[watcher] launch failed for ${record.id}`, e);
  }
}
