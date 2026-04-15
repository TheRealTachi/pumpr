import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { PumprrStaking } from "../target/types/pumprr_staking";

const ONE_DAY = 86_400;
const ONE_WEEK = 7 * ONE_DAY;

describe("pumprr-staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PumprrStaking as Program<PumprrStaking>;

  let mint: PublicKey;
  let treasury: Keypair;
  let alice: Keypair;
  let bob: Keypair;

  const fundSol = async (kp: Keypair, sol = 10) => {
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      sol * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  };

  const poolPda = (m: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), m.toBuffer()],
      program.programId,
    )[0];

  const stakeVaultPda = (pool: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stake_vault"), pool.toBuffer()],
      program.programId,
    )[0];

  const rewardVaultPda = (pool: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("reward"), pool.toBuffer()],
      program.programId,
    )[0];

  const stakeAccountPda = (pool: PublicKey, user: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), pool.toBuffer(), user.toBuffer()],
      program.programId,
    )[0];

  before(async () => {
    treasury = Keypair.generate();
    alice = Keypair.generate();
    bob = Keypair.generate();
    await Promise.all([fundSol(alice), fundSol(bob), fundSol(treasury, 1)]);

    mint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6,
    );
  });

  it("inits pool, stakes, deposits rewards, and claims", async () => {
    const pool = poolPda(mint);
    const stakeVault = stakeVaultPda(pool);
    const rewardVault = rewardVaultPda(pool);

    await program.methods
      .initPool(treasury.publicKey)
      .accounts({
        pool,
        mint,
        stakeVault,
        rewardVault,
        payer: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const aliceAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      mint,
      alice.publicKey,
    );
    const bobAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      mint,
      bob.publicKey,
    );
    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      mint,
      aliceAta.address,
      provider.wallet.publicKey,
      1_000_000_000,
    );
    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      mint,
      bobAta.address,
      provider.wallet.publicKey,
      1_000_000_000,
    );

    // alice stakes 300, bob stakes 100 → alice should earn 3x bob
    await program.methods
      .stake(new BN(300_000_000))
      .accounts({
        pool,
        stakeAccount: stakeAccountPda(pool, alice.publicKey),
        stakeVault,
        userToken: aliceAta.address,
        user: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    await program.methods
      .stake(new BN(100_000_000))
      .accounts({
        pool,
        stakeAccount: stakeAccountPda(pool, bob.publicKey),
        stakeVault,
        userToken: bobAta.address,
        user: bob.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    // donor pushes 1 SOL in rewards
    const donor = Keypair.generate();
    await fundSol(donor, 5);

    const treasuryBefore = await provider.connection.getBalance(
      treasury.publicKey,
    );

    await program.methods
      .depositRewards(new BN(LAMPORTS_PER_SOL))
      .accounts({
        pool,
        rewardVault,
        protocolTreasury: treasury.publicKey,
        payer: donor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([donor])
      .rpc();

    const treasuryAfter = await provider.connection.getBalance(
      treasury.publicKey,
    );
    expect(treasuryAfter - treasuryBefore).to.eq(0.1 * LAMPORTS_PER_SOL);

    // alice claims ~0.675 SOL (75% of 0.9), bob ~0.225 SOL (25% of 0.9)
    const aliceBefore = await provider.connection.getBalance(alice.publicKey);
    await program.methods
      .claim()
      .accounts({
        pool,
        stakeAccount: stakeAccountPda(pool, alice.publicKey),
        rewardVault,
        user: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();
    const aliceAfter = await provider.connection.getBalance(alice.publicKey);
    const aliceGain = aliceAfter - aliceBefore;
    const expected = 0.675 * LAMPORTS_PER_SOL;
    // allow 1% slack for tx fees
    expect(aliceGain).to.be.greaterThan(expected - 0.01 * LAMPORTS_PER_SOL);
    expect(aliceGain).to.be.lessThan(expected + 0.01 * LAMPORTS_PER_SOL);

    const bobBefore = await provider.connection.getBalance(bob.publicKey);
    await program.methods
      .claim()
      .accounts({
        pool,
        stakeAccount: stakeAccountPda(pool, bob.publicKey),
        rewardVault,
        user: bob.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();
    const bobGain =
      (await provider.connection.getBalance(bob.publicKey)) - bobBefore;
    expect(bobGain).to.be.greaterThan(0.215 * LAMPORTS_PER_SOL);
    expect(bobGain).to.be.lessThan(0.235 * LAMPORTS_PER_SOL);
  });

  it("request_unstake moves balance to cooldown and stops earning on that portion", async () => {
    const pool = poolPda(mint);
    const rewardVault = rewardVaultPda(pool);

    // bob moves all 100 into cooldown; alice remains
    await program.methods
      .requestUnstake(new BN(100_000_000))
      .accounts({
        pool,
        stakeAccount: stakeAccountPda(pool, bob.publicKey),
        user: bob.publicKey,
      })
      .signers([bob])
      .rpc();

    const donor = Keypair.generate();
    await fundSol(donor, 5);
    await program.methods
      .depositRewards(new BN(LAMPORTS_PER_SOL))
      .accounts({
        pool,
        rewardVault,
        protocolTreasury: treasury.publicKey,
        payer: donor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([donor])
      .rpc();

    // alice now gets 100% of staker cut = 0.9 SOL
    const before = await provider.connection.getBalance(alice.publicKey);
    await program.methods
      .claim()
      .accounts({
        pool,
        stakeAccount: stakeAccountPda(pool, alice.publicKey),
        rewardVault,
        user: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();
    const gain = (await provider.connection.getBalance(alice.publicKey)) - before;
    expect(gain).to.be.greaterThan(0.89 * LAMPORTS_PER_SOL);
  });

  it("rejects unstake before cooldown elapses", async () => {
    const pool = poolPda(mint);
    try {
      await program.methods
        .unstake()
        .accounts({
          pool,
          stakeAccount: stakeAccountPda(pool, bob.publicKey),
          stakeVault: stakeVaultPda(pool),
          userToken: (
            await getOrCreateAssociatedTokenAccount(
              provider.connection,
              (provider.wallet as anchor.Wallet).payer,
              mint,
              bob.publicKey,
            )
          ).address,
          user: bob.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.match(/CooldownNotElapsed|cooldown/);
    }
  });
});
