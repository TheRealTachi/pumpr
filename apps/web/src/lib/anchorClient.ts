import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { STAKING_PROGRAM_ID } from "./config";

const PROGRAM_ID = new PublicKey(STAKING_PROGRAM_ID);

export function poolPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), mint.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function stakeVaultPda(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault"), pool.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function rewardVaultPda(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reward"), pool.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function stakeAccountPda(pool: PublicKey, user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), pool.toBuffer(), user.toBuffer()],
    PROGRAM_ID,
  )[0];
}

// Anchor discriminators — sha256("global:<ix>") first 8 bytes.
const DISC = {
  stake: Buffer.from([206, 176, 202, 18, 200, 209, 179, 108]),
  request_unstake: Buffer.from([44, 154, 164, 111, 239, 50, 221, 14]),
  unstake: Buffer.from([90, 95, 107, 42, 205, 124, 50, 225]),
  claim: Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]),
  tick: Buffer.from([116, 216, 81, 204, 166, 198, 133, 94]),
};

function u64(n: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export function stakeIx(args: {
  mint: PublicKey;
  user: PublicKey;
  userToken: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  const pool = poolPda(args.mint);
  const stakeAcc = stakeAccountPda(pool, args.user);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: stakeAcc, isSigner: false, isWritable: true },
      { pubkey: stakeVaultPda(pool), isSigner: false, isWritable: true },
      { pubkey: args.userToken, isSigner: false, isWritable: true },
      { pubkey: args.user, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.stake, u64(args.amount)]),
  });
}

export function requestUnstakeIx(args: {
  mint: PublicKey;
  user: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  const pool = poolPda(args.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: stakeAccountPda(pool, args.user), isSigner: false, isWritable: true },
      { pubkey: args.user, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([DISC.request_unstake, u64(args.amount)]),
  });
}

export function unstakeIx(args: {
  mint: PublicKey;
  user: PublicKey;
  userToken: PublicKey;
}): TransactionInstruction {
  const pool = poolPda(args.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: stakeAccountPda(pool, args.user), isSigner: false, isWritable: true },
      { pubkey: stakeVaultPda(pool), isSigner: false, isWritable: true },
      { pubkey: args.userToken, isSigner: false, isWritable: true },
      { pubkey: args.user, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: DISC.unstake,
  });
}

export function claimIx(args: {
  mint: PublicKey;
  user: PublicKey;
}): TransactionInstruction {
  const pool = poolPda(args.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: stakeAccountPda(pool, args.user), isSigner: false, isWritable: true },
      { pubkey: rewardVaultPda(pool), isSigner: false, isWritable: true },
      { pubkey: args.user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISC.claim,
  });
}

export async function buildStakeTx(
  connection: Connection,
  wallet: WalletContextState,
  mint: PublicKey,
  amount: bigint,
): Promise<Transaction> {
  if (!wallet.publicKey) throw new Error("wallet not connected");
  const user = wallet.publicKey;
  const userAta = await getAssociatedTokenAddress(mint, user);
  const tx = new Transaction();
  const ataInfo = await connection.getAccountInfo(userAta);
  if (!ataInfo) {
    tx.add(createAssociatedTokenAccountInstruction(user, userAta, user, mint));
  }
  tx.add(stakeIx({ mint, user, userToken: userAta, amount }));
  return tx;
}

// re-export so callers don't need separate import
export { BN, AnchorProvider, Program };
