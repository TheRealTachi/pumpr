import { Connection, PublicKey } from "@solana/web3.js";
import type Database from "better-sqlite3";

// Refreshes top holders every N minutes. getTokenLargestAccounts returns up
// to 20 entries. We cache them in the `holders` table so the frontend can
// render without hitting RPC on every page load.

export interface HoldersWorkerConfig {
  db: Database.Database;
  connection: Connection;
  intervalMs: number;
}

export function startHoldersWorker(cfg: HoldersWorkerConfig): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const rows = cfg.db
        .prepare(
          `SELECT mint_pubkey AS mint FROM launches
           WHERE status = 'launched' AND mint_pubkey IS NOT NULL`,
        )
        .all() as { mint: string }[];

      for (const r of rows) {
        try {
          const res = await cfg.connection.getTokenLargestAccounts(
            new PublicKey(r.mint),
          );
          const tx = cfg.db.transaction(() => {
            cfg.db.prepare(`DELETE FROM holders WHERE mint = ?`).run(r.mint);
            const stmt = cfg.db.prepare(
              `INSERT INTO holders (mint, rank, address, amount, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
            );
            res.value.forEach((acc, i) => {
              stmt.run(
                r.mint,
                i + 1,
                acc.address.toBase58(),
                acc.amount,
                Date.now(),
              );
            });
          });
          tx();
          // also bump the holder count in pool_stats
          cfg.db
            .prepare(
              `UPDATE pool_stats SET holders = ?, updated_at = ? WHERE mint = ?`,
            )
            .run(res.value.length, Date.now(), r.mint);
          await sleep(1000); // be nice to the RPC
        } catch (e) {
          console.error(`[holders] ${r.mint}`, e);
        }
      }
    } catch (e) {
      console.error("[holders] tick", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.intervalMs);
    }
  };
  setTimeout(tick, 10_000);
  return () => {
    stopped = true;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
