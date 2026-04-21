import { Connection } from "@solana/web3.js";
import type Database from "better-sqlite3";
import { TIER_SECONDS, type Tier } from "./escrows";

// Polls Streamflow for all streams per launch mint, upserts them into
// stake_locks. Only records immutable self-locks (sender == recipient,
// cancelableBy{Sender,Recipient}=false, transferableBy{Sender,Recipient}=false)
// whose cliff duration matches one of our tiers.
//
// Streamflow SDK is ESM-only; we load it dynamically so the launcher can stay
// CJS for ts-node.

// Tiers must be checked longest-first so that a 10-day lock counts as 7d,
// not 3d. Each tier requires the actual lock duration to be at least its
// threshold; anything under 1 day is ignored.
const TIER_ORDER: { tier: Tier; seconds: number }[] = (
  Object.entries(TIER_SECONDS) as [Tier, number][]
)
  .map(([tier, seconds]) => ({ tier, seconds }))
  .sort((a, b) => b.seconds - a.seconds);

function tierFor(cliffSeconds: number): Tier | null {
  // Small slack (5 min) to absorb signing-delay between client timestamp and
  // on-chain createdAt.
  const slack = 300;
  for (const { tier, seconds } of TIER_ORDER) {
    if (cliffSeconds + slack >= seconds) return tier;
  }
  return null;
}

export interface StreamflowIndexerConfig {
  db: Database.Database;
  connection: Connection;
  rpcUrl: string;
  pollMs: number;
}

interface LaunchedMintRow {
  mint_pubkey: string;
}

interface LockRow {
  stream_id: string;
  ended_at: number | null;
}

export function startStreamflowIndexer(
  cfg: StreamflowIndexerConfig,
): () => void {
  let stopped = false;
  let clientP: Promise<unknown> | null = null;

  const getClient = async () => {
    if (!clientP) {
      clientP = import("@streamflow/stream").then(
        ({ SolanaStreamClient }) => new SolanaStreamClient(cfg.rpcUrl),
      );
    }
    return clientP;
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const client = (await getClient()) as {
        searchStreams: (data: {
          mint?: string;
        }) => Promise<
          {
            publicKey: { toBase58: () => string };
            account: StreamAccount;
          }[]
        >;
      };

      const mints = cfg.db
        .prepare(
          `SELECT mint_pubkey FROM launches
           WHERE status = 'launched' AND mint_pubkey IS NOT NULL`,
        )
        .all() as LaunchedMintRow[];

      for (const { mint_pubkey } of mints) {
        try {
          const accounts = await client.searchStreams({ mint: mint_pubkey });
          indexMint(cfg.db, mint_pubkey, accounts);
        } catch (e) {
          console.error(
            `[streamflow-indexer] failed for ${mint_pubkey.slice(0, 6)}…`,
            e,
          );
        }
      }
    } catch (e) {
      console.error("[streamflow-indexer] tick error", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.pollMs);
    }
  };
  setTimeout(tick, cfg.pollMs);
  return () => {
    stopped = true;
  };
}

interface StreamAccount {
  sender: string;
  recipient: string;
  mint: string;
  createdAt: number;
  start: number;
  cliff: number;
  depositedAmount: { toString(): string };
  cancelableBySender: boolean;
  cancelableByRecipient: boolean;
  transferableBySender: boolean;
  transferableByRecipient: boolean;
  closed: boolean;
}

function indexMint(
  db: Database.Database,
  mint: string,
  accounts: {
    publicKey: { toBase58: () => string };
    account: StreamAccount;
  }[],
) {
  const now = Date.now();
  const existing = new Map<string, LockRow>(
    (
      db
        .prepare(
          `SELECT stream_id, ended_at FROM stake_locks WHERE mint = ?`,
        )
        .all(mint) as LockRow[]
    ).map((r) => [r.stream_id, r]),
  );

  const insert = db.prepare(
    `INSERT INTO stake_locks
     (stream_id, mint, wallet, tier, amount, locked_at, unlocks_at, ended_at, first_seen_at)
     VALUES (@stream_id, @mint, @wallet, @tier, @amount, @locked_at, @unlocks_at, @ended_at, @first_seen_at)`,
  );
  const markEnded = db.prepare(
    `UPDATE stake_locks SET ended_at = ? WHERE stream_id = ? AND ended_at IS NULL`,
  );

  for (const { publicKey, account: s } of accounts) {
    const streamId = publicKey.toBase58();

    // Must be an immutable self-lock for this mint.
    if (s.sender !== s.recipient) continue;
    if (s.cancelableBySender || s.cancelableByRecipient) continue;
    if (s.transferableBySender || s.transferableByRecipient) continue;

    const cliffSeconds = s.cliff - s.createdAt;
    const tier = tierFor(cliffSeconds);
    if (!tier) continue;

    const amount = s.depositedAmount.toString();
    if (amount === "0") continue;

    const lockedAt = s.createdAt * 1000;
    const unlocksAt = s.cliff * 1000;
    const endedAt = s.closed ? now : null;

    const row = existing.get(streamId);
    if (!row) {
      insert.run({
        stream_id: streamId,
        mint,
        wallet: s.sender,
        tier,
        amount,
        locked_at: lockedAt,
        unlocks_at: unlocksAt,
        ended_at: endedAt,
        first_seen_at: now,
      });
      console.log(
        `[streamflow-indexer] new ${tier} lock ${streamId.slice(0, 6)}… ${amount} for ${s.sender.slice(0, 6)}…`,
      );
    } else if (endedAt && row.ended_at === null) {
      markEnded.run(endedAt, streamId);
    }
  }
}
