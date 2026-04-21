# pumprr

A pump.fun launchpad with **Proof-of-Belief (POB) staking** per token.
Every launched token streams pump.fun creator fees as SOL rewards to wallets
that lock the token on [Streamflow](https://streamflow.finance/), weighted by
`amount × tier_multiplier`. Non-custodial — pumpr never holds staker funds.

## Status

Live on mainnet via Railway: frontend + launcher backend. Deployed from
`main`; web and launcher are separate Railway services sharing this repo.

## Layout

```
apps/web                    Next.js 16 frontend (launch page, token detail,
                            stake panel, stakers list, how-it-works docs)
services/launcher           HTTP API + background workers:
                            - watcher: awaits 0.05 SOL dev-wallet deposit,
                              flips launch to ready_to_launch
                            - launcher: signs pump.fun create-token, mints
                              the token with a vanity address ending "…prr"
                            - streamflowIndexer: polls Streamflow every 30s,
                              classifies each self-lock by cliff duration
                            - distributionWorker: every 15 min, claims
                              pump.fun creator fees and pays stakers pro-rata
                            - indexer/holders/pumpportalWs: on-chain stats,
                              price history, trade feed
programs/pumprr-staking     Legacy Anchor program — not used by the current
                            Streamflow-based flow; kept for reference
tests/                      Anchor integration tests
```

## Staking model

Staking is an on-chain Streamflow vesting contract where the user is both
sender and recipient (a self-lock):

- `recipient` = staker's own wallet
- `cliff` = `start + tier_duration` (full unlock at cliff, nothing drips)
- `cancelableBy{Sender,Recipient}` = `false` (immutable — no early exit)
- `transferableBy{Sender,Recipient}` = `false`

pumpr never has signing authority on these locks. The only way tokens come
back is the staker withdrawing on [app.streamflow.finance](https://app.streamflow.finance)
after their cliff.

### Tiers

| Duration | Multiplier | Label |
|---|---|---|
| 1 day (24h) | 1.00× | baseline |
| 3 days (72h) | 1.75× | boosted |
| 7 days (168h) | 3.00× | max belief |

### Fee distribution

Every 15 min, per launched token:
1. `collectCreatorFee` via pumpportal → dev wallet collects accumulated pump.fun fees
2. Spendable SOL = dev wallet balance − gas reserve
3. Pro-rata weight per active lock: `amount × tier_mult × fraction_of_window_active`
4. Split: **90% to stakers**, **10% to protocol treasury**
5. Batched `SystemProgram.transfer` straight to each staker's wallet
6. Update `claimed_sol` on each lock, `lifetime_rewards` on the pool

No user action needed to receive rewards; SOL lands in the wallet that
created the lock.

## Vanity mints

Every launch mints a token address ending in `…prr`. A pool of pre-ground
keypairs lives in the `vanity_mints` table (encrypted with the same
`KeyVault` that protects dev wallets), refilled with:

```sh
cd services/launcher
MINT_VANITY_SUFFIX=prr npm run grind -- 50
```

At launch time the launcher pops one from the pool atomically; if the pool
is empty it falls back to live grinding (~10s).

## Dev setup

```sh
# prereqs — only needed for the legacy Anchor program, not the live flow
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# web
cd apps/web
cp .env.local.example .env.local   # set NEXT_PUBLIC_SOLANA_RPC_URL + NEXT_PUBLIC_LAUNCHER_API
npm install
npm run dev

# launcher (in another shell)
cd services/launcher
cp .env.example .env               # fill SOLANA_RPC_URL, PROTOCOL_TREASURY, KEY_VAULT_MASTER_KEY_HEX, etc.
npm install
npm run dev
```

### Key environment variables (launcher)

| Var | Purpose |
|---|---|
| `SOLANA_RPC_URL` | Mainnet RPC (Helius / Triton / etc.) |
| `PROTOCOL_TREASURY` | Pubkey receiving the 10% cut |
| `DISTRIBUTION_INTERVAL_MS` | Default `900000` (15 min) |
| `LAUNCH_DEPOSIT_LAMPORTS` | Required SOL on dev wallet to launch (default 0.05 SOL) |
| `GAS_RESERVE_LAMPORTS` | Min SOL kept in dev wallet (default ~0.02 SOL) |
| `MINT_VANITY_SUFFIX` | Suffix for new mints (default `prr`) |
| `KEY_VAULT_MASTER_KEY_HEX` | 32-byte hex AES-GCM key for encrypting dev + vanity secret keys |

## Security notes

pumpr custodies **one** key per launch: the dev wallet, needed to sign
pump.fun create-token and `collectCreatorFee` on the user's behalf. Keys
are encrypted at rest (AES-GCM) and decrypted only in the signing service.

- Dev wallet compromise = creator-fee stream for that token can be
  redirected; staker tokens are **not** at risk (they live in Streamflow
  PDAs, not pumpr).
- The current implementation uses `EnvAesKeyVault` (master key in env).
  Production should swap for `KmsKeyVault` backed by AWS KMS / GCP KMS /
  Turnkey and isolate signing to a separate IAM-scoped process.

## Mainnet TODO

- [x] Wire `executeLaunch` to pump.fun create-token via pumpportal
- [x] Vanity mints (`…prr`) via pre-ground pool
- [x] Replace custodial escrow staking with Streamflow locks
- [x] 15-min fee distribution
- [ ] Swap `EnvAesKeyVault` for `KmsKeyVault`
- [ ] Geyser / webhook subscription for Streamflow locks instead of 30s polling
- [ ] Merkle-claim distribution program (remove pumpr from the reward-payout trust path)
