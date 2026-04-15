import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  createMint,
  TOKEN_PROGRAM_ID,
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type { KeyVault } from "./keyVault";
import type Database from "better-sqlite3";
import type { LaunchRecord } from "./db";
import { createTokenOnPump, isMainnet } from "./pumpportal";
import { createEscrowsForLaunch } from "./escrows";

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

  // Send-to-stake model: no on-chain pool program. Just generate the 3
  // tier-specific staking wallets + their ATAs so users can transfer to them.
  await createEscrowsForLaunch({
    db: ctx.db,
    connection: ctx.connection,
    keyVault: ctx.keyVault,
    devWallet,
    launchId: ctx.record.id,
    mint: mintPubkey,
  });

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

  const mintKp = Keypair.generate();
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
  const mint = await createMint(
    ctx.connection,
    devWallet,
    devWallet.publicKey,
    null,
    6,
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

async function initStakingPool(
  ctx: LaunchContext,
  devWallet: Keypair,
  mint: PublicKey,
): Promise<PublicKey> {
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), mint.toBuffer()],
    ctx.stakingProgramId,
  );
  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault"), pool.toBuffer()],
    ctx.stakingProgramId,
  );
  const [rewardVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward"), pool.toBuffer()],
    ctx.stakingProgramId,
  );

  const discriminator = Buffer.from([116, 233, 199, 204, 115, 159, 171, 36]);
  const data = Buffer.concat([discriminator, ctx.protocolTreasury.toBuffer()]);

  const ix = {
    programId: ctx.stakingProgramId,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: stakeVault, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: devWallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  };
  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(ctx.connection, tx, [devWallet]);
  return pool;
}
