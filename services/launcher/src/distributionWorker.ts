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

// Every hour, for each pool:
//   1. If mainnet, call pumpportal collectCreatorFee so SOL lands in the dev
//      wallet.
//   2. Pull the dev wallet's current spendable SOL (above gas reserve).
//   3. Compute each active deposit's weight for THIS window:
//        weight = amount × tier_mult × fraction_of_hour_active
//   4. Distribute 90% pro-rata to sender addresses. 10% to protocol_treasury.
//   5. Update claimed_sol on each deposit.
//
// Deposits in cooldown (returned_at set) also earn for the fraction of the
// hour they were active before unlock.

const PROTOCOL_FEE_BPS = 1_000n; // 10%
const BPS = 10_000n;
const HOUR_MS = 60 * 60 * 1000;

interface LaunchRow {
  id: string;
  mint_pubkey: string | null;
  dev_wallet_pubkey: string;
  encrypted_privkey: string;
}

interface DepositRow {
  id: number;
  mint: string;
  tier: Tier;
  sender_address: string;
  amount: string;
  received_at: number;
  unlocks_at: number;
  returned_at: number | null;
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
      const windowStart = windowEnd - HOUR_MS;
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

  const protocolCut = (available * PROTOCOL_FEE_BPS) / BPS;
  const stakerCut = available - protocolCut;

  // Active deposits during this window
  const deposits = cfg.db
    .prepare(
      `SELECT id, mint, tier, sender_address, amount, received_at, unlocks_at, returned_at
       FROM stake_deposits
       WHERE mint = ?
         AND received_at < ?
         AND (returned_at IS NULL OR returned_at >= ?)`,
    )
    .all(l.mint_pubkey, windowEnd, windowStart) as DepositRow[];

  if (deposits.length === 0) return;

  // Weight = amount × tier_mult × (active_ms_in_window / HOUR_MS)
  let totalWeight = 0;
  const weights: { dep: DepositRow; weight: number }[] = [];
  for (const d of deposits) {
    const activeStart = Math.max(d.received_at, windowStart);
    const activeEnd = Math.min(d.returned_at ?? windowEnd, windowEnd);
    const activeMs = Math.max(0, activeEnd - activeStart);
    if (activeMs === 0) continue;
    const w =
      (Number(BigInt(d.amount)) / 1_000_000) *
      TIER_MULTIPLIER[d.tier] *
      (activeMs / HOUR_MS);
    weights.push({ dep: d, weight: w });
    totalWeight += w;
  }
  if (totalWeight <= 0) return;

  // Build a single tx that pays protocol + each staker. Solana tx limit is
  // ~1232 bytes; a system_program::transfer ix is ~12 bytes + 32×3 pubkeys =
  // ~108 bytes. In practice ~10 transfers per tx is safe. Batch accordingly.
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
      to: new PublicKey(weights[i].dep.sender_address),
      lamports: share,
    });
    cfg.db
      .prepare(
        `UPDATE stake_deposits SET claimed_sol = CAST(CAST(claimed_sol AS INTEGER) + ? AS TEXT) WHERE id = ?`,
      )
      .run(Number(share), weights[i].dep.id);
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
