//! pumprr-staking: per-token Proof-of-Belief escrow.
//!
//! Each launched token gets its own `Pool`. Holders stake SPL tokens into
//! `stake_vault`; creator fees (SOL) are pushed into `reward_vault` via the
//! permissionless `deposit_rewards` instruction. Rewards accrue pro-rata to
//! weighted shares, where weight = amount * duration_multiplier.
//!
//! Duration tiers (seconds since user's stake_start):
//!   [0,    1d)   = 1.00x
//!   [1d,   7d)   = 1.25x
//!   [7d,  30d)   = 1.50x
//!   [30d, 90d)   = 2.00x
//!   [90d,  inf)  = 3.00x
//!
//! Tiers upgrade LAZILY: a user's effective multiplier only moves when they
//! call `tick`/`claim`/`stake`/`request_unstake`. This keeps pool accounting
//! O(1) per instruction. Unclaimed tier upside is donated to the pool.
//!
//! Unstake uses a 24h cooldown. Cooldown balance earns no rewards.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("3nTYQDnvvhX1FNGqAmCcBdzMV5btjecpUcxYDvP1XSnJ");

pub const MULT_DENOM: u64 = 10_000;
pub const ACC_PRECISION: u128 = 1_000_000_000_000; // 1e12
pub const COOLDOWN_SECS: i64 = 86_400; // 24h
pub const PROTOCOL_FEE_BPS: u16 = 1_000; // 10%
pub const BPS_DENOM: u64 = 10_000;

#[program]
pub mod pumprr_staking {
    use super::*;

    /// Called once by the launcher service when a new token is created.
    pub fn init_pool(ctx: Context<InitPool>, protocol_treasury: Pubkey) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.mint = ctx.accounts.mint.key();
        pool.stake_vault = ctx.accounts.stake_vault.key();
        pool.reward_vault = ctx.accounts.reward_vault.key();
        pool.protocol_treasury = protocol_treasury;
        pool.total_staked = 0;
        pool.total_weighted_shares = 0;
        pool.acc_reward_per_share = 0;
        pool.lifetime_rewards = 0;
        pool.bump = ctx.bumps.pool;
        pool.reward_vault_bump = ctx.bumps.reward_vault;
        Ok(())
    }

    /// Stake `amount` tokens. Fresh stakes start at 1.0x. Adding to an existing
    /// stake updates `stake_started_at` to the amount-weighted average of old
    /// and new start times.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;
        let stake_acc = &mut ctx.accounts.stake_account;

        settle_and_rebalance(pool, stake_acc, now)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        if stake_acc.amount == 0 {
            stake_acc.owner = ctx.accounts.user.key();
            stake_acc.pool = pool.key();
            stake_acc.stake_started_at = now;
        } else {
            // amount-weighted average of start times
            let old_w = stake_acc.amount as u128 * stake_acc.stake_started_at as u128;
            let new_w = amount as u128 * now as u128;
            let total = stake_acc.amount as u128 + amount as u128;
            stake_acc.stake_started_at = ((old_w + new_w) / total) as i64;
        }

        stake_acc.amount = stake_acc.amount.checked_add(amount).unwrap();
        pool.total_staked = pool.total_staked.checked_add(amount).unwrap();

        recompute_weighted(pool, stake_acc, now);
        Ok(())
    }

    /// Recompute tier-adjusted weights and settle pending rewards. No-op in
    /// state terms if called right after another tick.
    pub fn tick(ctx: Context<Touch>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        settle_and_rebalance(&mut ctx.accounts.pool, &mut ctx.accounts.stake_account, now)?;
        recompute_weighted(&mut ctx.accounts.pool, &mut ctx.accounts.stake_account, now);
        Ok(())
    }

    /// Move `amount` from staked → cooldown bucket. Cooldown earns no rewards.
    /// A second call before cooldown ends extends the timer on the combined
    /// balance (safer than allowing partial early exit games).
    pub fn request_unstake(ctx: Context<Touch>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;
        let stake_acc = &mut ctx.accounts.stake_account;

        require!(amount > 0, StakingError::ZeroAmount);
        require!(amount <= stake_acc.amount, StakingError::InsufficientStake);

        settle_and_rebalance(pool, stake_acc, now)?;

        stake_acc.amount = stake_acc.amount.checked_sub(amount).unwrap();
        pool.total_staked = pool.total_staked.checked_sub(amount).unwrap();
        stake_acc.cooldown_amount = stake_acc.cooldown_amount.checked_add(amount).unwrap();
        stake_acc.cooldown_ends_at = now + COOLDOWN_SECS;

        recompute_weighted(pool, stake_acc, now);
        Ok(())
    }

    /// Withdraw cooldown balance (only after cooldown_ends_at).
    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let stake_acc = &mut ctx.accounts.stake_account;
        require!(stake_acc.cooldown_amount > 0, StakingError::NothingInCooldown);
        require!(now >= stake_acc.cooldown_ends_at, StakingError::CooldownNotElapsed);

        let amount = stake_acc.cooldown_amount;
        stake_acc.cooldown_amount = 0;

        let pool_key = ctx.accounts.pool.key();
        let mint_key = ctx.accounts.pool.mint;
        let bump = ctx.accounts.pool.bump;
        let seeds: &[&[u8]] = &[b"pool", mint_key.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        let _ = pool_key;
        Ok(())
    }

    /// Claim accrued SOL rewards. Updates the user's multiplier tier.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;
        let stake_acc = &mut ctx.accounts.stake_account;

        settle_and_rebalance(pool, stake_acc, now)?;
        let payout = stake_acc.pending_rewards;
        stake_acc.pending_rewards = 0;
        recompute_weighted(pool, stake_acc, now);

        if payout > 0 {
            let pool_key = pool.key();
            let seeds: &[&[u8]] = &[
                b"reward",
                pool_key.as_ref(),
                &[pool.reward_vault_bump],
            ];
            let signer: &[&[&[u8]]] = &[seeds];
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        to: ctx.accounts.user.to_account_info(),
                    },
                    signer,
                ),
                payout,
            )?;
        }
        Ok(())
    }

    /// Permissionless: push SOL rewards into the pool. Caller can be anyone
    /// (the crank service, the dev wallet sweep, or a goodwill donor). 10%
    /// is routed to the protocol treasury, 90% to stakers.
    pub fn deposit_rewards(ctx: Context<DepositRewards>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        let pool = &mut ctx.accounts.pool;
        require_keys_eq!(
            ctx.accounts.protocol_treasury.key(),
            pool.protocol_treasury,
            StakingError::WrongTreasury
        );
        require!(pool.total_weighted_shares > 0, StakingError::NoStakers);

        let protocol_cut = amount as u128 * PROTOCOL_FEE_BPS as u128 / BPS_DENOM as u128;
        let staker_cut = amount as u128 - protocol_cut;

        // 10% → treasury
        if protocol_cut > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.protocol_treasury.to_account_info(),
                    },
                ),
                protocol_cut as u64,
            )?;
        }

        // 90% → reward_vault
        if staker_cut > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.reward_vault.to_account_info(),
                    },
                ),
                staker_cut as u64,
            )?;
        }

        let delta = staker_cut * ACC_PRECISION / pool.total_weighted_shares as u128;
        pool.acc_reward_per_share = pool.acc_reward_per_share.checked_add(delta).unwrap();
        pool.lifetime_rewards = pool.lifetime_rewards.checked_add(amount).unwrap();
        Ok(())
    }
}

// ---------- helpers ----------

fn multiplier_bps(duration_secs: i64) -> u64 {
    const DAY: i64 = 86_400;
    match duration_secs {
        d if d < DAY => 10_000,
        d if d < 7 * DAY => 12_500,
        d if d < 30 * DAY => 15_000,
        d if d < 90 * DAY => 20_000,
        _ => 30_000,
    }
}

/// Credit pending rewards using the user's CURRENT (stale) weighted_shares,
/// then zero the snapshot. Caller must follow with `recompute_weighted`.
fn settle_and_rebalance(pool: &mut Pool, sa: &mut StakeAccount, _now: i64) -> Result<()> {
    if sa.weighted_shares > 0 {
        let earned_q = sa.weighted_shares as u128
            * (pool.acc_reward_per_share - sa.reward_debt_per_share);
        let earned = (earned_q / ACC_PRECISION) as u64;
        sa.pending_rewards = sa.pending_rewards.checked_add(earned).unwrap();
    }
    pool.total_weighted_shares = pool
        .total_weighted_shares
        .checked_sub(sa.weighted_shares)
        .unwrap();
    sa.weighted_shares = 0;
    Ok(())
}

fn recompute_weighted(pool: &mut Pool, sa: &mut StakeAccount, now: i64) {
    let duration = now.saturating_sub(sa.stake_started_at).max(0);
    let mult = multiplier_bps(duration);
    let ws = (sa.amount as u128 * mult as u128 / MULT_DENOM as u128) as u64;
    sa.weighted_shares = ws;
    sa.reward_debt_per_share = pool.acc_reward_per_share;
    pool.total_weighted_shares = pool.total_weighted_shares.checked_add(ws).unwrap();
}

// ---------- accounts ----------

#[account]
#[derive(Default)]
pub struct Pool {
    pub mint: Pubkey,
    pub stake_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub protocol_treasury: Pubkey,
    pub total_staked: u64,
    pub total_weighted_shares: u64,
    pub acc_reward_per_share: u128,
    pub lifetime_rewards: u64,
    pub bump: u8,
    pub reward_vault_bump: u8,
}
impl Pool {
    pub const SIZE: usize = 8 + 32 * 4 + 8 * 3 + 16 + 1 * 2;
}

#[account]
#[derive(Default)]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub weighted_shares: u64,
    pub stake_started_at: i64,
    pub reward_debt_per_share: u128,
    pub pending_rewards: u64,
    pub cooldown_amount: u64,
    pub cooldown_ends_at: i64,
    pub bump: u8,
}
impl StakeAccount {
    pub const SIZE: usize = 8 + 32 * 2 + 8 * 5 + 16 + 8 + 1;
}

// ---------- contexts ----------

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(
        init,
        payer = payer,
        space = Pool::SIZE,
        seeds = [b"pool", mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = pool,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    /// SystemAccount PDA; holds SOL rewards.
    #[account(
        mut,
        seeds = [b"reward", pool.key().as_ref()],
        bump,
    )]
    pub reward_vault: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut, seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = user,
        space = StakeAccount::SIZE,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut, address = pool.stake_vault)]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Touch<'info> {
    #[account(mut, seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut, address = pool.stake_vault)]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut, seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(
        mut,
        seeds = [b"reward", pool.key().as_ref()],
        bump = pool.reward_vault_bump,
    )]
    pub reward_vault: SystemAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositRewards<'info> {
    #[account(mut, seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"reward", pool.key().as_ref()],
        bump = pool.reward_vault_bump,
    )]
    pub reward_vault: SystemAccount<'info>,

    #[account(mut)]
    pub protocol_treasury: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum StakingError {
    #[msg("amount must be > 0")]
    ZeroAmount,
    #[msg("insufficient staked balance")]
    InsufficientStake,
    #[msg("nothing in cooldown")]
    NothingInCooldown,
    #[msg("cooldown has not elapsed")]
    CooldownNotElapsed,
    #[msg("no stakers in pool")]
    NoStakers,
    #[msg("protocol treasury mismatch")]
    WrongTreasury,
}
