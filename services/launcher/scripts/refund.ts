import "dotenv/config";
import Database from "better-sqlite3";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { EnvAesKeyVault } from "../src/keyVault";

const TARGET = process.argv[2];
if (!TARGET) {
  console.error("usage: ts-node scripts/refund.ts <target-pubkey>");
  process.exit(1);
}

const target = new PublicKey(TARGET);
const conn = new Connection(
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  "confirmed",
);
const vault = new EnvAesKeyVault(process.env.KEY_VAULT_MASTER_KEY_HEX!);
const db = new Database(process.env.DB_PATH ?? "./data/launcher.sqlite");

interface Row {
  id: string;
  dev_wallet_pubkey: string;
  encrypted_privkey: string;
}

async function main() {
  const rows = db
    .prepare(`SELECT id, dev_wallet_pubkey, encrypted_privkey FROM launches`)
    .all() as Row[];

  // also sweep any escrow wallets in case we funded their SOL reserve
  interface EscrowRow {
    pubkey: string;
    encrypted_privkey: string;
  }
  const escrows = db
    .prepare(`SELECT pubkey, encrypted_privkey FROM stake_escrows`)
    .all() as EscrowRow[];

  const wallets: { label: string; pubkey: string; encrypted: string }[] = [
    ...rows.map((r) => ({
      label: `dev ${r.id.slice(0, 8)}`,
      pubkey: r.dev_wallet_pubkey,
      encrypted: r.encrypted_privkey,
    })),
    ...escrows.map((e) => ({
      label: `escrow ${e.pubkey.slice(0, 6)}`,
      pubkey: e.pubkey,
      encrypted: e.encrypted_privkey,
    })),
  ];

  let total = 0n;
  for (const w of wallets) {
    try {
      const bal = BigInt(await conn.getBalance(new PublicKey(w.pubkey)));
      if (bal <= 5_000n) {
        console.log(`${w.label} ${w.pubkey} — ${bal} lamports, skip`);
        continue;
      }
      const send = bal - 5_000n; // leave tx fee
      const kp = Keypair.fromSecretKey(await vault.decrypt(w.encrypted));
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: kp.publicKey,
          toPubkey: target,
          lamports: Number(send),
        }),
      );
      const sig = await sendAndConfirmTransaction(conn, tx, [kp]);
      console.log(`${w.label} → ${send} lamports · ${sig}`);
      total += send;
    } catch (e) {
      console.error(`${w.label} failed:`, e);
    }
  }
  console.log(`\nTotal swept: ${total} lamports (${Number(total) / 1e9} SOL)`);
  process.exit(0);
}

main();
