import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import type Database from "better-sqlite3";
import {
  fetchBondingCurve,
  fetchCreatorVaultLamports,
} from "./pumpfunOnchain";
import { getMintTokenProgram } from "./tokenProgram";

// Pool stats indexer. For every launched token we:
//   1. Pull its pump.fun bonding curve account (price, MC, graduation %).
//   2. Sum our stake_locks table to derive total-staked for this mint.
//   3. Read mint supply for stake %.
//   4. Count unique holders from the token's largest accounts (top 20).

export interface IndexerConfig {
  db: Database.Database;
  connection: Connection;
  pollMs: number;
}

export function startIndexer(cfg: IndexerConfig): () => void {
  let stopped = false;
  const upsert = cfg.db.prepare(`
    INSERT INTO pool_stats (mint, total_staked, total_weighted_shares, lifetime_rewards, mint_supply, stake_pct, price_sol, market_cap_sol, bonding_progress, graduated, holders, updated_at)
    VALUES (@mint, @total_staked, '0', '0', @mint_supply, @stake_pct, @price_sol, @market_cap_sol, @bonding_progress, @graduated, @holders, @updated_at)
    ON CONFLICT(mint) DO UPDATE SET
      total_staked = excluded.total_staked,
      mint_supply = excluded.mint_supply,
      stake_pct = excluded.stake_pct,
      price_sol = excluded.price_sol,
      market_cap_sol = excluded.market_cap_sol,
      bonding_progress = excluded.bonding_progress,
      graduated = excluded.graduated,
      holders = excluded.holders,
      updated_at = excluded.updated_at
  `);

  const tick = async () => {
    if (stopped) return;
    try {
      const rows = cfg.db
        .prepare(
          `SELECT mint_pubkey AS mint
           FROM launches
           WHERE status = 'launched' AND mint_pubkey IS NOT NULL`,
        )
        .all() as { mint: string }[];

      for (const r of rows) {
        try {
          const mintPk = new PublicKey(r.mint);
          const tokenProgram = await getMintTokenProgram(
            cfg.connection,
            mintPk,
          ).catch(() => null);
          const devWallet = cfg.db
            .prepare(
              `SELECT dev_wallet_pubkey FROM launches WHERE mint_pubkey = ?`,
            )
            .get(r.mint) as { dev_wallet_pubkey: string } | undefined;
          const [mintInfo, bonding, stakeSum, largest, unclaimedLamports] =
            await Promise.all([
              tokenProgram
                ? getMint(
                    cfg.connection,
                    mintPk,
                    undefined,
                    tokenProgram,
                  ).catch(() => null)
                : null,
              fetchBondingCurve(cfg.connection, mintPk).catch(() => null),
              Promise.resolve(
                cfg.db
                  .prepare(
                    `SELECT COALESCE(SUM(CAST(amount AS INTEGER)),0) AS total
                     FROM stake_locks WHERE mint = ? AND ended_at IS NULL`,
                  )
                  .get(r.mint) as { total: number },
              ),
              cfg.connection
                .getTokenLargestAccounts(mintPk)
                .catch(() => ({ value: [] })),
              devWallet
                ? fetchCreatorVaultLamports(
                    cfg.connection,
                    new PublicKey(devWallet.dev_wallet_pubkey),
                  ).catch(() => 0n)
                : Promise.resolve(0n),
            ]);
          const supply = mintInfo?.supply ?? 0n;
          const staked = BigInt(stakeSum?.total ?? 0);
          const stakePct =
            supply > 0n
              ? Number((staked * 10_000n) / supply) / 100
              : 0;
          upsert.run({
            mint: r.mint,
            total_staked: staked.toString(),
            mint_supply: supply.toString(),
            stake_pct: stakePct,
            price_sol: bonding?.priceSolPerToken ?? 0,
            market_cap_sol: bonding?.marketCapSol ?? 0,
            bonding_progress: bonding?.bondingProgressPct ?? 0,
            graduated: bonding?.complete ? 1 : 0,
            holders: largest.value.length,
            updated_at: Date.now(),
          });
          cfg.db
            .prepare(
              `UPDATE pool_stats SET creator_unclaimed_lamports = ? WHERE mint = ?`,
            )
            .run(unclaimedLamports.toString(), r.mint);
          if (bonding?.priceSolPerToken) {
            cfg.db
              .prepare(
                `INSERT INTO price_history (mint, price_sol, market_cap_sol, recorded_at)
                 VALUES (?, ?, ?, ?)`,
              )
              .run(
                r.mint,
                bonding.priceSolPerToken,
                bonding.marketCapSol,
                Date.now(),
              );
          }

          const vol = cfg.db
            .prepare(
              `SELECT COALESCE(SUM(sol_amount), 0) AS v, COUNT(*) AS c
               FROM trades WHERE mint = ? AND ts >= ?`,
            )
            .get(r.mint, Date.now() - 24 * 3600 * 1000) as {
            v: number;
            c: number;
          };
          cfg.db
            .prepare(
              `UPDATE pool_stats SET vol_24h_sol = ?, tx_count_24h = ? WHERE mint = ?`,
            )
            .run(vol.v, vol.c, r.mint);
        } catch (e) {
          console.error(`[indexer] failed for ${r.mint}`, e);
        }
      }
    } catch (e) {
      console.error("[indexer] tick error", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.pollMs);
    }
  };
  setTimeout(tick, cfg.pollMs);
  return () => {
    stopped = true;
  };
}
