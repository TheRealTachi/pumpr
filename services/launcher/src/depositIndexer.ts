import { Connection, PublicKey } from "@solana/web3.js";
import type Database from "better-sqlite3";
import { TIER_SECONDS, type Tier } from "./escrows";

// Polls each escrow's ATA. When the token balance increases, scans recent
// signatures to find the incoming transfer and records the deposit.
//
// This is the MVP approach — fine for low-volume localnet/testnet. In
// production, swap for a Geyser stream or Helius webhook subscribed to each
// ATA for real-time credit.

interface EscrowRow {
  pubkey: string;
  launch_id: string;
  mint: string;
  tier: Tier;
  ata: string | null;
  last_indexed_amount: string;
}

export interface DepositIndexerConfig {
  db: Database.Database;
  connection: Connection;
  pollMs: number;
}

export function startDepositIndexer(cfg: DepositIndexerConfig): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const escrows = cfg.db
        .prepare(`SELECT * FROM stake_escrows WHERE ata IS NOT NULL`)
        .all() as EscrowRow[];

      for (const e of escrows) {
        try {
          await indexEscrow(cfg, e);
        } catch (err) {
          console.error(
            `[deposit-indexer] failed for escrow ${e.pubkey}`,
            err,
          );
        }
      }
    } catch (e) {
      console.error("[deposit-indexer] tick error", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.pollMs);
    }
  };
  setTimeout(tick, cfg.pollMs);
  return () => {
    stopped = true;
  };
}

async function indexEscrow(cfg: DepositIndexerConfig, e: EscrowRow) {
  const ataPk = new PublicKey(e.ata!);
  const info = await cfg.connection.getTokenAccountBalance(ataPk);
  const current = BigInt(info.value.amount);
  const last = BigInt(e.last_indexed_amount || "0");
  if (current <= last) return;

  const deltaMin = current - last;
  // Scan recent signatures on this ATA to find incoming transfers we haven't
  // recorded. We match by deposit_sig uniqueness in the INSERT path.
  const sigs = await cfg.connection.getSignaturesForAddress(ataPk, {
    limit: 20,
  });
  const known = new Set<string>(
    (
      cfg.db
        .prepare(
          `SELECT deposit_sig FROM stake_deposits WHERE escrow_pubkey = ? AND deposit_sig IS NOT NULL`,
        )
        .all(e.pubkey) as { deposit_sig: string }[]
    ).map((r) => r.deposit_sig),
  );

  let matched = 0n;
  for (const s of sigs) {
    if (known.has(s.signature)) continue;
    const tx = await cfg.connection.getParsedTransaction(s.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta || tx.meta.err) continue;

    // Compare pre/post token balances for the ATA to derive deposit amount.
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];
    const ataPost = post.find((p) => p.owner === e.pubkey);
    const ataPre = pre.find((p) => p.owner === e.pubkey);
    if (!ataPost) continue;
    const postRaw = BigInt(ataPost.uiTokenAmount.amount);
    const preRaw = ataPre ? BigInt(ataPre.uiTokenAmount.amount) : 0n;
    const credit = postRaw - preRaw;
    if (credit <= 0n) continue;

    // Sender is whoever's token-account balance decreased by the same amount.
    let sender: string | null = null;
    for (let i = 0; i < pre.length; i++) {
      const p = pre[i];
      const matching = post.find(
        (q) => q.accountIndex === p.accountIndex && q.owner === p.owner,
      );
      if (!matching || p.owner === e.pubkey) continue;
      const diff =
        BigInt(p.uiTokenAmount.amount) -
        BigInt(matching.uiTokenAmount.amount);
      if (diff === credit) {
        sender = p.owner ?? null;
        break;
      }
    }
    // Fallback: use the fee payer (typically == sender).
    if (!sender) sender = tx.transaction.message.accountKeys[0]?.pubkey?.toBase58() ?? null;
    if (!sender) continue;

    const received_at = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
    const unlocks_at = received_at + TIER_SECONDS[e.tier] * 1000;

    cfg.db
      .prepare(
        `INSERT INTO stake_deposits
         (mint, escrow_pubkey, tier, sender_address, amount, deposit_sig, received_at, unlocks_at)
         VALUES (@mint, @escrow, @tier, @sender, @amount, @sig, @recv, @unlock)`,
      )
      .run({
        mint: e.mint,
        escrow: e.pubkey,
        tier: e.tier,
        sender,
        amount: credit.toString(),
        sig: s.signature,
        recv: received_at,
        unlock: unlocks_at,
      });
    matched += credit;
    console.log(
      `[deposit-indexer] ${e.tier} · ${credit} from ${sender.slice(0, 6)}… → ${e.pubkey.slice(0, 6)}…`,
    );
  }

  // Update last_indexed_amount so we don't rescan. If we couldn't match the
  // full delta (e.g. dust transfer from an exchange routed differently), we
  // still bump the cursor — operator should investigate any warning below.
  if (matched < deltaMin) {
    console.warn(
      `[deposit-indexer] unaccounted delta on ${e.pubkey}: +${deltaMin - matched}`,
    );
  }
  cfg.db
    .prepare(
      `UPDATE stake_escrows SET last_indexed_amount = ? WHERE pubkey = ?`,
    )
    .run(current.toString(), e.pubkey);
}
