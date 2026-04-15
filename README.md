# pumprr

A pump.fun-style launchpad with **Proof-of-Belief (POB) staking** per token.
Every launched token gets its own fee-share escrow — holders stake the token
and earn a share of creator fees, weighted by `amount × duration_multiplier`.

## Status

**Milestone 1 — on-chain program + backend services.** No frontend yet.
Localnet-testable; the actual pump.fun create-token call is stubbed pending
mainnet IDL work.

## Layout

```
programs/pumprr-staking     Anchor program (Rust)
services/launcher           HTTP API: generates dev wallet, watches for
                            deposit, signs pump.fun launch + init_pool
services/crank              Sweeps creator fees from each dev wallet
                            into its pool's reward_vault
tests/                      Anchor integration tests (ts-mocha)
```

## Staking economics

- **Fee split**: 90% stakers / 10% protocol treasury.
- **Duration multiplier** (lazy — users must tick/claim/stake/unstake to
  upgrade their tier; unclaimed upside is donated pro-rata to the pool):
  | Stake duration | Multiplier |
  |---|---|
  | 0 – 1d   | 1.00x |
  | 1 – 7d   | 1.25x |
  | 7 – 30d  | 1.50x |
  | 30 – 90d | 2.00x |
  | 90d+     | 3.00x |
- **Unstake**: 24h cooldown. Cooldown balance earns no rewards.
- **Adding to an existing stake** applies an amount-weighted average to
  `stake_started_at` — prevents gaming a small long-lived position into a
  large 3x-multiplier one.

## Dev setup

```sh
# install (one-time)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1 && avm use 0.30.1

# build + test
npm install
anchor build
anchor test
```

## Security note

The launcher custodies private keys for every dev wallet. The current
implementation uses local AES-GCM with a master key in env (`EnvAesKeyVault`)
— **this is for localnet/dev only**. Production must swap in AWS KMS / GCP
KMS / Turnkey behind the same `KeyVault` interface, with:

- encryption key in a KMS HSM (never in env/files)
- signing service isolated from the web API (separate process, IAM-scoped)
- signing policies restricted to pump.fun + `deposit_rewards` instructions
- audit log of every signature

A single compromise = every token's creator-fee stream drained.

## Mainnet TODO

- [ ] Wire `executeLaunch` to pump.fun's create-token instruction
- [ ] Optional dev-buy with leftover SOL, auto-staked + locked
- [ ] Revoke mint authority after launch
- [ ] Swap `EnvAesKeyVault` for `KmsKeyVault`
