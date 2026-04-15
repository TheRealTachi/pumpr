import "dotenv/config";
import Database from "better-sqlite3";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { EnvAesKeyVault } from "../src/keyVault";
import { collectCreatorFees } from "../src/pumpportal";

const MINT = process.argv[2];
if (!MINT) {
  console.error("usage: ts-node scripts/claim.ts <mint>");
  process.exit(1);
}

const db = new Database(process.env.DB_PATH ?? "./data/launcher.sqlite");
const conn = new Connection(
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  "confirmed",
);
const vault = new EnvAesKeyVault(process.env.KEY_VAULT_MASTER_KEY_HEX!);

async function main() {
  const row = db
    .prepare(
      `SELECT id, dev_wallet_pubkey, encrypted_privkey FROM launches WHERE mint_pubkey = ?`,
    )
    .get(MINT) as
    | { id: string; dev_wallet_pubkey: string; encrypted_privkey: string }
    | undefined;
  if (!row) throw new Error(`mint ${MINT} not in DB`);

  const kp = Keypair.fromSecretKey(await vault.decrypt(row.encrypted_privkey));
  const before = BigInt(await conn.getBalance(kp.publicKey));
  console.log(
    `dev wallet ${kp.publicKey.toBase58()} balance before: ${Number(before) / 1e9} SOL`,
  );

  const sig = await collectCreatorFees({
    connection: conn,
    signer: kp,
    priorityFeeSol: 0.0001,
  });
  if (!sig) {
    console.log("pumpportal said nothing to claim (400)");
    return;
  }
  console.log(`claim tx: https://solscan.io/tx/${sig}`);

  await new Promise((r) => setTimeout(r, 3000));
  const after = BigInt(await conn.getBalance(kp.publicKey));
  const delta = after - before;
  console.log(
    `balance after:  ${Number(after) / 1e9} SOL (+${Number(delta) / 1e9})`,
  );
  if (delta > 0n) {
    db.prepare(
      `UPDATE pool_stats SET lifetime_rewards = CAST(
         (CAST(COALESCE(lifetime_rewards,'0') AS INTEGER) + ?) AS TEXT
       ) WHERE mint = ?`,
    ).run(Number(delta), MINT);
    console.log(`lifetime_rewards +${Number(delta)} lamports`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
