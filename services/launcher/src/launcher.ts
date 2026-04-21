import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type { KeyVault } from "./keyVault";
import type Database from "better-sqlite3";
import type { LaunchRecord } from "./db";
import { createTokenOnPump, isMainnet } from "./pumpportal";
import { grindMintKeypair, popVanityMint, poolSize } from "./vanity";

const MINT_VANITY_SUFFIX = process.env.MINT_VANITY_SUFFIX ?? "prr";

async function getMintKeypair(ctx: LaunchContext): Promise<Keypair> {
  const pooled = await popVanityMint(ctx.db, ctx.keyVault);
  if (pooled) {
    console.log(
      `[vanity] popped ${pooled.publicKey.toBase58()} from pool (${poolSize(ctx.db)} remaining)`,
    );
    return pooled;
  }
  console.log(`[vanity] pool empty — grinding ${MINT_VANITY_SUFFIX} inline`);
  return grindMintKeypair(MINT_VANITY_SUFFIX);
}

export interface LaunchContext {
  db: Database.Database;
  record: LaunchRecord;
  connection: Connection;
  rpcUrl: string;
  keyVault: KeyVault;
  stakingProgramId: PublicKey;
  protocolTreasury: PublicKey;
  devBuySol: number;
  slippageBps: number;
  priorityFeeSol: number;
}

export async function executeLaunch(
  ctx: LaunchContext,
): Promise<{ mint: string; pool: string }> {
  const devKey = await ctx.keyVault.decrypt(ctx.record.encrypted_privkey);
  const devWallet = Keypair.fromSecretKey(devKey);

  const mintPubkey = isMainnet(ctx.rpcUrl)
    ? await createOnPumpFun(ctx, devWallet)
    : await createLocalnetMint(ctx, devWallet);

  // Staking is handled non-custodially via Streamflow. The indexer picks up
  // user-created locks by mint; nothing to provision at launch time.
  return { mint: mintPubkey.toBase58(), pool: mintPubkey.toBase58() };
}

async function createOnPumpFun(
  ctx: LaunchContext,
  devWallet: Keypair,
): Promise<PublicKey> {
  const rec = ctx.record;
  let imageBytes: Uint8Array | undefined;
  let imageFilename: string | undefined;
  if (rec.image_path) {
    const fs = await import("node:fs/promises");
    imageBytes = new Uint8Array(await fs.readFile(rec.image_path));
    imageFilename = rec.image_path.split("/").pop() ?? "image.png";
  }

  const mintKp = await getMintKeypair(ctx);
  const { mint } = await createTokenOnPump({
    connection: ctx.connection,
    creator: devWallet,
    mint: mintKp,
    name: rec.name,
    symbol: rec.symbol,
    description: rec.description,
    imageBytes,
    imageFilename,
    twitter: rec.twitter ?? undefined,
    telegram: rec.telegram ?? undefined,
    website: rec.website ?? undefined,
    buyAmountSol: ctx.devBuySol,
    slippageBps: ctx.slippageBps,
    priorityFeeSol: ctx.priorityFeeSol,
  });
  return mint;
}

async function createLocalnetMint(
  ctx: LaunchContext,
  devWallet: Keypair,
): Promise<PublicKey> {
  const mintKp = await getMintKeypair(ctx);
  const mint = await createMint(
    ctx.connection,
    devWallet,
    devWallet.publicKey,
    null,
    6,
    mintKp,
  );
  const devAta = await getAssociatedTokenAddress(mint, devWallet.publicKey);
  const ataTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      devWallet.publicKey,
      devAta,
      devWallet.publicKey,
      mint,
    ),
  );
  await sendAndConfirmTransaction(ctx.connection, ataTx, [devWallet]);
  await mintTo(
    ctx.connection,
    devWallet,
    mint,
    devAta,
    devWallet.publicKey,
    1_000_000_000_000_000n,
  );
  return mint;
}

