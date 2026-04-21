import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type Database from "better-sqlite3";
import type { KeyVault } from "./keyVault";
import { TIER_MULTIPLIER, type Tier } from "./escrows";
import { collectCreatorFees, isMainnet } from "./pumpportal";

// Every `intervalMs` (default 30 min), for each launched pool:
//   1. If mainnet, call pumpportal collectCreatorFee so SOL lands in the dev
//      wallet.
//   2. Pull the dev wallet's current spendable SOL (above gas reserve).
//   3. Compute each active lock's weight for THIS window:
//        weight = amount × tier_mult × (active_ms_in_window / interval_ms)
//   4. Distribute 90% pro-rata to lock owners. 10% to protocol_treasury.
//   5. Update claimed_sol on each lock.
//
// A lock is "active in the window" if its locked_at < windowEnd AND
// (ended_at IS NULL OR ended_at >= windowStart). Post-cliff locks still earn
// until the user actually withdraws and closes the stream on Streamflow.

const PROTOCOL_FEE_BPS = 1_000n; // 10%
const BPS = 10_000n;

interface LaunchRow {
  id: string;
  mint_pubkey: string | null;
  dev_wallet_pubkey: string;
  encrypted_privkey: string;
}

interface LockRow {
  stream_id: string;
  mint: string;
  wallet: string;
  tier: Tier;
  amount: string;
  locked_at: number;
  unlocks_at: number;
  ended_at: number | null;
}

export interface DistributionConfig {
  db: Database.Database;
  connection: Connection;
  rpcUrl: string;
  keyVault: KeyVault;
  protocolTreasury: PublicKey;
  gasReserveLamports: bigint;
  priorityFeeSol: number;
  intervalMs: number;
}

export function startDistributionWorker(
  cfg: DistributionConfig,
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const windowEnd = Date.now();
      const windowStart = windowEnd - cfg.intervalMs;
      const launches = cfg.db
        .prepare(
          `SELECT id, mint_pubkey, dev_wallet_pubkey, encrypted_privkey
           FROM launches
           WHERE status = 'launched' AND mint_pubkey IS NOT NULL`,
        )
        .all() as LaunchRow[];

      for (const l of launches) {
        try {
          await distributeForLaunch(cfg, l, windowStart, windowEnd);
        } catch (e) {
          console.error(`[distribution] failed for ${l.id}`, e);
        }
      }
    } catch (e) {
      console.error("[distribution] tick error", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.intervalMs);
    }
  };
  setTimeout(tick, cfg.intervalMs);
  return () => {
    stopped = true;
  };
}

async function distributeForLaunch(
  cfg: DistributionConfig,
  l: LaunchRow,
  windowStart: number,
  windowEnd: number,
) {
  const devKp = Keypair.fromSecretKey(
    await cfg.keyVault.decrypt(l.encrypted_privkey),
  );

  if (isMainnet(cfg.rpcUrl)) {
    await collectCreatorFees({
      connection: cfg.connection,
      signer: devKp,
      priorityFeeSol: cfg.priorityFeeSol,
    }).catch((e) =>
      console.warn(`[distribution] collectCreatorFee failed ${l.id}`, e),
    );
  }

  const bal = BigInt(await cfg.connection.getBalance(devKp.publicKey));
  if (bal <= cfg.gasReserveLamports) return;
  const available = bal - cfg.gasReserveLamports;
  if (available < 10_000n) return; // skip dust windows

  if (l.mint_pubkey) {
    const cur = cfg.db
      .prepare(`SELECT lifetime_rewards FROM pool_stats WHERE mint = ?`)
      .get(l.mint_pubkey) as { lifetime_rewards: string } | undefined;
    const next =
      (cur?.lifetime_rewards ? BigInt(cur.lifetime_rewards) : 0n) + available;
    cfg.db
      .prepare(`UPDATE pool_stats SET lifetime_rewards = ? WHERE mint = ?`)
      .run(next.toString(), l.mint_pubkey);
  }

  const protocolCut = (available * PROTOCOL_FEE_BPS) / BPS;
  const stakerCut = available - protocolCut;

  const locks = cfg.db
    .prepare(
      `SELECT stream_id, mint, wallet, tier, amount, locked_at, unlocks_at, ended_at
       FROM stake_locks
       WHERE mint = ?
         AND locked_at < ?
         AND (ended_at IS NULL OR ended_at >= ?)`,
    )
    .all(l.mint_pubkey, windowEnd, windowStart) as LockRow[];

  if (locks.length === 0) return;

  const windowMs = windowEnd - windowStart;
  let totalWeight = 0;
  const weights: { lock: LockRow; weight: number }[] = [];
  for (const lk of locks) {
    const activeStart = Math.max(lk.locked_at, windowStart);
    const activeEnd = Math.min(lk.ended_at ?? windowEnd, windowEnd);
    const activeMs = Math.max(0, activeEnd - activeStart);
    if (activeMs === 0) continue;
    const w =
      (Number(BigInt(lk.amount)) / 1_000_000) *
      TIER_MULTIPLIER[lk.tier] *
      (activeMs / windowMs);
    weights.push({ lock: lk, weight: w });
    totalWeight += w;
  }
  if (totalWeight <= 0) return;

  const payouts: { to: PublicKey; lamports: bigint }[] = [
    { to: cfg.protocolTreasury, lamports: protocolCut },
  ];

  let distributed = 0n;
  for (let i = 0; i < weights.length; i++) {
    const last = i === weights.length - 1;
    const share = last
      ? stakerCut - distributed
      : (stakerCut * BigInt(Math.floor(weights[i].weight * 1e6))) /
        BigInt(Math.floor(totalWeight * 1e6));
    if (share <= 0n) continue;
    payouts.push({
      to: new PublicKey(weights[i].lock.wallet),
      lamports: share,
    });
    const curClaim = cfg.db
      .prepare(`SELECT claimed_sol FROM stake_locks WHERE stream_id = ?`)
      .get(weights[i].lock.stream_id) as { claimed_sol: string } | undefined;
    const nextClaim =
      (curClaim?.claimed_sol ? BigInt(curClaim.claimed_sol) : 0n) + share;
    cfg.db
      .prepare(`UPDATE stake_locks SET claimed_sol = ? WHERE stream_id = ?`)
      .run(nextClaim.toString(), weights[i].lock.stream_id);
    distributed += share;
  }

  for (let i = 0; i < payouts.length; i += 10) {
    const batch = payouts.slice(i, i + 10);
    const tx = new Transaction();
    for (const p of batch) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: devKp.publicKey,
          toPubkey: p.to,
          lamports: Number(p.lamports),
        }),
      );
    }
    try {
      const sig = await sendAndConfirmTransaction(cfg.connection, tx, [devKp]);
      console.log(
        `[distribution] ${l.id} batch ${i / 10 + 1}: ${batch.length} payees → ${sig}`,
      );
    } catch (e) {
      console.error(`[distribution] batch tx failed`, e);
    }
  }
}
