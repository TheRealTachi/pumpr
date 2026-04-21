import "dotenv/config";
import { Keypair } from "@solana/web3.js";
import { z } from "zod";
import { openDb } from "./db";
import { EnvAesKeyVault } from "./keyVault";

// Pre-grinds N vanity mint keypairs and stashes them encrypted in the DB so
// the launcher can pop one instantly on each launch instead of grinding
// live. Usage:
//   MINT_VANITY_SUFFIX=prr npx ts-node src/grindPool.ts 50

const env = z
  .object({
    DB_PATH: z.string().default("./data/launcher.sqlite"),
    KEY_VAULT_MASTER_KEY_HEX: z.string().length(64),
    MINT_VANITY_SUFFIX: z.string().default("prr"),
  })
  .parse(process.env);

async function main() {
  const n = Number(process.argv[2] ?? 50);
  if (!Number.isFinite(n) || n <= 0) throw new Error("pass a positive count");

  const db = openDb(env.DB_PATH);
  const vault = new EnvAesKeyVault(env.KEY_VAULT_MASTER_KEY_HEX);
  const suffix = env.MINT_VANITY_SUFFIX;

  const existing = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM vanity_mints WHERE used_at IS NULL`,
      )
      .get() as { c: number }
  ).c;
  console.log(`[grind-pool] ${existing} unused keys already pooled`);

  const insert = db.prepare(
    `INSERT INTO vanity_mints (pubkey, encrypted_privkey, created_at)
     VALUES (?, ?, ?)`,
  );

  const start = Date.now();
  for (let i = 0; i < n; i++) {
    const iterStart = Date.now();
    let tries = 0;
    let kp: Keypair;
    while (true) {
      kp = Keypair.generate();
      tries++;
      if (kp.publicKey.toBase58().endsWith(suffix)) break;
    }
    const enc = await vault.encrypt(kp.secretKey);
    insert.run(kp.publicKey.toBase58(), enc, Date.now());
    console.log(
      `[grind-pool] ${i + 1}/${n} ${kp.publicKey.toBase58()} (${tries} tries, ${Date.now() - iterStart}ms)`,
    );
  }
  const totalSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[grind-pool] done — ${n} keys in ${totalSec}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
