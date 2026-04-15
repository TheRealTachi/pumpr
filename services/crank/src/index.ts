import "dotenv/config";
import { z } from "zod";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const env = z
  .object({
    SOLANA_RPC_URL: z.string().url(),
    CLUSTER: z.string().default("localnet"),
    STAKING_PROGRAM_ID: z.string(),
    PROTOCOL_TREASURY: z.string(),
    KEY_VAULT_MASTER_KEY_HEX: z.string().length(64),
    DB_PATH: z.string(),
    GAS_RESERVE_LAMPORTS: z.string(),
    MIN_SWEEP_LAMPORTS: z.string(),
    POLL_MS: z.string().default("60000"),
    PUMPFUN_PRIORITY_FEE_SOL: z.string().default("0.000001"),
  })
  .parse(process.env);

const conn = new Connection(env.SOLANA_RPC_URL, "confirmed");
const stakingProgramId = new PublicKey(env.STAKING_PROGRAM_ID);
const protocolTreasury = new PublicKey(env.PROTOCOL_TREASURY);
const gasReserve = BigInt(env.GAS_RESERVE_LAMPORTS);
const minSweep = BigInt(env.MIN_SWEEP_LAMPORTS);
const masterKey = Buffer.from(env.KEY_VAULT_MASTER_KEY_HEX, "hex");
const priorityFeeSol = Number(env.PUMPFUN_PRIORITY_FEE_SOL);
const isMainnet = env.CLUSTER === "mainnet";
const db = new Database(env.DB_PATH, { readonly: false });

function decrypt(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
}

// anchor discriminator for "global:deposit_rewards"
const DEPOSIT_DISC = Buffer.from([86, 193, 51, 74, 128, 63, 19, 25]);

function depositRewardsIx(args: {
  pool: PublicKey;
  rewardVault: PublicKey;
  payer: PublicKey;
  amountLamports: bigint;
}): TransactionInstruction {
  const amt = Buffer.alloc(8);
  amt.writeBigUInt64LE(args.amountLamports);
  return new TransactionInstruction({
    programId: stakingProgramId,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: true },
      { pubkey: args.rewardVault, isSigner: false, isWritable: true },
      { pubkey: protocolTreasury, isSigner: false, isWritable: true },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DEPOSIT_DISC, amt]),
  });
}

// Claim all outstanding pump.fun creator fees for `signer`. Returns signature
// or null if there was nothing to claim (pumpportal returns 400 in that case).
async function collectCreatorFees(signer: Keypair): Promise<string | null> {
  const body = {
    publicKey: signer.publicKey.toBase58(),
    action: "collectCreatorFee",
    priorityFee: priorityFeeSol,
    pool: "pump",
  };
  const res = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 400) return null;
  if (!res.ok)
    throw new Error(`pumpportal ${res.status}: ${await res.text()}`);
  const data = new Uint8Array(await res.arrayBuffer());
  const tx = VersionedTransaction.deserialize(data);
  tx.sign([signer]);
  const sig = await conn.sendTransaction(tx);
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

interface Row {
  id: string;
  dev_wallet_pubkey: string;
  encrypted_privkey: string;
  pool_pubkey: string;
}

async function tick() {
  const rows = db
    .prepare(
      `SELECT id, dev_wallet_pubkey, encrypted_privkey, pool_pubkey
       FROM launches WHERE status = 'launched' AND pool_pubkey IS NOT NULL`,
    )
    .all() as Row[];

  for (const r of rows) {
    try {
      const kp = Keypair.fromSecretKey(decrypt(r.encrypted_privkey));

      if (isMainnet) {
        const claim = await collectCreatorFees(kp).catch((e) => {
          console.warn(`[crank] collectCreatorFee failed for ${r.id}`, e);
          return null;
        });
        if (claim) console.log(`[crank] claimed pump.fun fees ${r.id} → ${claim}`);
      }

      const bal = BigInt(await conn.getBalance(kp.publicKey));
      if (bal <= gasReserve) continue;
      const sweepable = bal - gasReserve;
      if (sweepable < minSweep) continue;

      const pool = new PublicKey(r.pool_pubkey);
      const [rewardVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("reward"), pool.toBuffer()],
        stakingProgramId,
      );

      const ix = depositRewardsIx({
        pool,
        rewardVault,
        payer: kp.publicKey,
        amountLamports: sweepable,
      });
      const tx = new Transaction().add(ix);
      const sig = await sendAndConfirmTransaction(conn, tx, [kp]);
      console.log(
        `[crank] swept ${sweepable} lamports for ${r.id} → ${sig}`,
      );
    } catch (e) {
      console.error(`[crank] sweep failed for ${r.id}`, e);
    }
  }
}

async function loop() {
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[crank] tick error", e);
    }
    await new Promise((r) => setTimeout(r, Number(env.POLL_MS)));
  }
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
