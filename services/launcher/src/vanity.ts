import { Keypair } from "@solana/web3.js";
import type Database from "better-sqlite3";
import type { KeyVault } from "./keyVault";

// Brute-force a Solana keypair whose base58 public key ends with `suffix`.
// base58 has 58 symbols; a 3-char suffix expects ~195K tries on average.
// If grinding takes more than maxMs, fall back to a random keypair so the
// launch doesn't stall indefinitely on an unlucky run.
export function grindMintKeypair(suffix: string, maxMs = 90_000): Keypair {
  const start = Date.now();
  let tries = 0;
  while (Date.now() - start < maxMs) {
    const kp = Keypair.generate();
    tries++;
    if (kp.publicKey.toBase58().endsWith(suffix)) {
      console.log(
        `[vanity] matched ${suffix} after ${tries} tries in ${Date.now() - start}ms`,
      );
      return kp;
    }
  }
  console.warn(
    `[vanity] gave up on ${suffix} after ${tries} tries in ${Date.now() - start}ms — using random mint`,
  );
  return Keypair.generate();
}

// Atomically pop one unused pre-ground key. Returns null if the pool is
// empty. Caller must use the keypair or the slot stays marked used — we
// never hand out the same key twice.
export async function popVanityMint(
  db: Database.Database,
  vault: KeyVault,
): Promise<Keypair | null> {
  const row = db
    .prepare(
      `UPDATE vanity_mints SET used_at = ?
       WHERE pubkey = (
         SELECT pubkey FROM vanity_mints WHERE used_at IS NULL
         ORDER BY created_at ASC LIMIT 1
       )
       RETURNING pubkey, encrypted_privkey`,
    )
    .get(Date.now()) as
    | { pubkey: string; encrypted_privkey: string }
    | undefined;
  if (!row) return null;
  const secret = await vault.decrypt(row.encrypted_privkey);
  return Keypair.fromSecretKey(secret);
}

export function poolSize(db: Database.Database): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM vanity_mints WHERE used_at IS NULL`,
      )
      .get() as { c: number }
  ).c;
}
