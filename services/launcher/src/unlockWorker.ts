import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import type Database from "better-sqlite3";
import type { KeyVault } from "./keyVault";
import { getMintTokenProgram } from "./tokenProgram";

// Every minute, returns tokens to users whose lock period has elapsed.
// Pulls from the escrow's ATA → sender's ATA (creating it if needed — paid by
// the escrow itself from its small SOL reserve).

interface DepositRow {
  id: number;
  mint: string;
  escrow_pubkey: string;
  sender_address: string;
  amount: string;
  unlocks_at: number;
}

interface EscrowRow {
  pubkey: string;
  encrypted_privkey: string;
  ata: string | null;
}

export interface UnlockWorkerConfig {
  db: Database.Database;
  connection: Connection;
  keyVault: KeyVault;
  pollMs: number;
}

export function startUnlockWorker(cfg: UnlockWorkerConfig): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const now = Date.now();
      const due = cfg.db
        .prepare(
          `SELECT id, mint, escrow_pubkey, sender_address, amount, unlocks_at
           FROM stake_deposits
           WHERE returned_at IS NULL AND unlocks_at <= ?
           ORDER BY unlocks_at ASC LIMIT 50`,
        )
        .all(now) as DepositRow[];

      for (const d of due) {
        try {
          await returnDeposit(cfg, d);
        } catch (e) {
          console.error(`[unlock-worker] failed deposit ${d.id}`, e);
        }
      }
    } catch (e) {
      console.error("[unlock-worker] tick error", e);
    } finally {
      if (!stopped) setTimeout(tick, cfg.pollMs);
    }
  };
  setTimeout(tick, cfg.pollMs);
  return () => {
    stopped = true;
  };
}

async function returnDeposit(cfg: UnlockWorkerConfig, d: DepositRow) {
  const escrow = cfg.db
    .prepare(
      `SELECT pubkey, encrypted_privkey, ata FROM stake_escrows WHERE pubkey = ?`,
    )
    .get(d.escrow_pubkey) as EscrowRow | undefined;
  if (!escrow || !escrow.ata) throw new Error("escrow not found");

  const escrowKp = Keypair.fromSecretKey(
    await cfg.keyVault.decrypt(escrow.encrypted_privkey),
  );
  const escrowAta = new PublicKey(escrow.ata);
  const mint = new PublicKey(d.mint);
  const sender = new PublicKey(d.sender_address);
  const tokenProgram = await getMintTokenProgram(cfg.connection, mint);
  const senderAta = await getAssociatedTokenAddress(
    mint,
    sender,
    true,
    tokenProgram,
  );

  const tx = new Transaction();
  try {
    await getAccount(cfg.connection, senderAta, undefined, tokenProgram);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        escrowKp.publicKey,
        senderAta,
        sender,
        mint,
        tokenProgram,
      ),
    );
  }

  tx.add(
    createTransferInstruction(
      escrowAta,
      senderAta,
      escrowKp.publicKey,
      BigInt(d.amount),
      [],
      tokenProgram,
    ),
  );
  const sig = await sendAndConfirmTransaction(cfg.connection, tx, [escrowKp]);

  cfg.db
    .prepare(
      `UPDATE stake_deposits SET returned_at = ?, return_sig = ? WHERE id = ?`,
    )
    .run(Date.now(), sig, d.id);
  console.log(
    `[unlock-worker] returned ${d.amount} ${d.mint.slice(0, 6)}… to ${d.sender_address.slice(0, 6)}…`,
  );
}
