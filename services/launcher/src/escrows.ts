import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type Database from "better-sqlite3";
import type { KeyVault } from "./keyVault";
import { getMintTokenProgram } from "./tokenProgram";

export const TIERS = ["1d", "3d", "7d"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_SECONDS: Record<Tier, number> = {
  "1d": 86_400,
  "3d": 3 * 86_400,
  "7d": 7 * 86_400,
};

export const TIER_MULTIPLIER: Record<Tier, number> = {
  "1d": 1.0,
  "3d": 1.75,
  "7d": 3.0,
};

export interface EscrowRow {
  pubkey: string;
  launch_id: string;
  mint: string;
  tier: Tier;
  encrypted_privkey: string;
  ata: string | null;
  last_indexed_amount: string;
  created_at: number;
}

/**
 * Generate 3 escrow keypairs for a launch, fund each with rent for its ATA,
 * and record them in the DB. Escrow ATAs are created upfront so users can
 * simply `SPL transfer` to the escrow pubkey without a create-ATA step.
 */
export async function createEscrowsForLaunch(args: {
  db: Database.Database;
  connection: Connection;
  keyVault: KeyVault;
  devWallet: Keypair;
  launchId: string;
  mint: PublicKey;
}): Promise<EscrowRow[]> {
  const tokenProgram = await getMintTokenProgram(args.connection, args.mint);
  const out: EscrowRow[] = [];
  for (const tier of TIERS) {
    const kp = Keypair.generate();
    const ata = await getAssociatedTokenAddress(
      args.mint,
      kp.publicKey,
      true,
      tokenProgram,
    );

    // Create the escrow's ATA from the dev wallet (payer). The dev wallet
    // owns the ATA's rent but NOT the token account itself — the escrow does.
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        args.devWallet.publicKey,
        ata,
        kp.publicKey,
        args.mint,
        tokenProgram,
      ),
    );
    await sendAndConfirmTransaction(args.connection, tx, [args.devWallet]);

    // Escrow needs a few lamports to pay for its own unlock-return tx fees.
    // Budget ~0.001 SOL per escrow (covers dozens of returns).
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: args.devWallet.publicKey,
        toPubkey: kp.publicKey,
        lamports: 1_000_000,
      }),
    );
    await sendAndConfirmTransaction(args.connection, fundTx, [args.devWallet]);

    const encrypted = await args.keyVault.encrypt(kp.secretKey);
    const row: EscrowRow = {
      pubkey: kp.publicKey.toBase58(),
      launch_id: args.launchId,
      mint: args.mint.toBase58(),
      tier,
      encrypted_privkey: encrypted,
      ata: ata.toBase58(),
      last_indexed_amount: "0",
      created_at: Date.now(),
    };
    args.db
      .prepare(
        `INSERT INTO stake_escrows
         (pubkey, launch_id, mint, tier, encrypted_privkey, ata, last_indexed_amount, created_at)
         VALUES (@pubkey, @launch_id, @mint, @tier, @encrypted_privkey, @ata, @last_indexed_amount, @created_at)`,
      )
      .run(row);
    out.push(row);
  }
  return out;
}

export function escrowsForMint(
  db: Database.Database,
  mint: string,
): EscrowRow[] {
  return db
    .prepare(`SELECT * FROM stake_escrows WHERE mint = ? ORDER BY tier`)
    .all(mint) as EscrowRow[];
}
