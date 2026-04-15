export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "http://127.0.0.1:8899";

export const LAUNCHER_API =
  process.env.NEXT_PUBLIC_LAUNCHER_API ?? "http://127.0.0.1:8787";

export const STAKING_PROGRAM_ID =
  process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID ??
  "3nTYQDnvvhX1FNGqAmCcBdzMV5btjecpUcxYDvP1XSnJ";

export const LAUNCH_DEPOSIT_SOL = 0.05;
