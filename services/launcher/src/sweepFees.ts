import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { z } from "zod";
import { openDb } from "./db";
import { EnvAesKeyVault } from "./keyVault";
import { collectCreatorFees, isMainnet } from "./pumpportal";

// One-shot: for every launch with a dev wallet, claim outstanding pump.fun
// creator fees into the wallet, then send (balance - rent buffer) to a
// destination address. Used to drain everything to a treasury.
//
// Usage:
//   node dist/sweepFees.js <destination_pubkey>
//   node dist/sweepFees.js <destination_pubkey> --dry-run

const env = z
  .object({
    DB_PATH: z.string().default("./data/launcher.sqlite"),
    SOLANA_RPC_URL: z.string().url(),
    KEY_VAULT_MASTER_KEY_HEX: z.string().length(64),
    PUMPFUN_PRIORITY_FEE_SOL: z.string().default("0.00005"),
  })
  .parse(process.env);

// Drain the wallet to zero: send (balance - tx fee). Leaving any non-zero
// remainder below rent-exempt minimum (~890K lamports) makes the runtime
// reject the tx with InsufficientFundsForRent. Sending exactly balance - fee
// closes the system account at 0 lamports cleanly.
const TX_FEE_LAMPORTS = 5_000n;
const MIN_SWEEP_LAMPORTS = 10_000n;

interface LaunchRow {
  id: string;
  symbol: string;
  status: string;
  dev_wallet_pubkey: string;
  encrypted_privkey: string;
}

async function main() {
  const dest = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!dest) throw new Error("usage: sweepFees <dest_pubkey> [--dry-run]");
  const destination = new PublicKey(dest);

  const db = openDb(env.DB_PATH);
  const vault = new EnvAesKeyVault(env.KEY_VAULT_MASTER_KEY_HEX);
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

  const rows = db
    .prepare(
      `SELECT id, symbol, status, dev_wallet_pubkey, encrypted_privkey
       FROM launches
       WHERE dev_wallet_pubkey IS NOT NULL AND encrypted_privkey IS NOT NULL
       ORDER BY created_at ASC`,
    )
    .all() as LaunchRow[];

  console.log(
    `[sweep] ${rows.length} dev wallets to process → ${dest}${dryRun ? "  (DRY RUN)" : ""}`,
  );
  console.log(`[sweep] mainnet=${isMainnet(env.SOLANA_RPC_URL)}\n`);

  let totalSwept = 0n;
  for (const r of rows) {
    const tag = `${r.symbol} ${r.id.slice(0, 8)} ${r.dev_wallet_pubkey.slice(0, 6)}…`;
    try {
      const kp = Keypair.fromSecretKey(await vault.decrypt(r.encrypted_privkey));

      // Claim creator fees (best-effort) only if it's a launched token.
      if (r.status === "launched" && isMainnet(env.SOLANA_RPC_URL)) {
        try {
          if (dryRun) {
            console.log(`[sweep] ${tag}  (would call collectCreatorFee)`);
          } else {
            await collectCreatorFees({
              connection,
              signer: kp,
              priorityFeeSol: Number(env.PUMPFUN_PRIORITY_FEE_SOL),
            });
            await new Promise((r) => setTimeout(r, 1500));
          }
        } catch (e) {
          console.warn(
            `[sweep] ${tag}  collectCreatorFee failed: ${e instanceof Error ? e.message : e}`,
          );
        }
      }

      const bal = BigInt(await connection.getBalance(kp.publicKey));
      if (bal < MIN_SWEEP_LAMPORTS) {
        console.log(`[sweep] ${tag}  bal=${bal} lamports — skipping (dust)`);
        continue;
      }
      const send = bal - TX_FEE_LAMPORTS;

      if (dryRun) {
        console.log(
          `[sweep] ${tag}  bal=${bal} would send=${send} (${(Number(send) / 1e9).toFixed(6)} SOL)`,
        );
        totalSwept += send;
        continue;
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: kp.publicKey,
          toPubkey: destination,
          lamports: Number(send),
        }),
      );
      const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
      totalSwept += send;
      console.log(
        `[sweep] ${tag}  sent ${(Number(send) / 1e9).toFixed(6)} SOL  sig=${sig.slice(0, 16)}…`,
      );
    } catch (e) {
      console.error(
        `[sweep] ${tag}  FAILED: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  console.log(
    `\n[sweep] total ${dryRun ? "would-send" : "swept"}: ${(Number(totalSwept) / 1e9).toFixed(6)} SOL`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
