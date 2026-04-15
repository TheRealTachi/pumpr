import { Connection, PublicKey } from "@solana/web3.js";

// pump.fun's mainnet program + bonding-curve PDA seeds.
export const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);

// Initial real-token reserves when a pump.fun curve starts: 793.1M tokens ×
// 10^6 decimals. The curve graduates to Raydium when real reserves deplete.
const INITIAL_REAL_TOKEN_RESERVES = 793_100_000n * 1_000_000n;

export interface BondingCurveView {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  priceSolPerToken: number;       // SOL per whole (1e6-unit) token
  marketCapSol: number;
  bondingProgressPct: number;     // 0-100
}

export function bondingCurvePda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID,
  )[0];
}

// Creator vault PDA — where unclaimed pump.fun creator fees accumulate.
// Seeds: ["creator-vault", creator_pubkey].
export function creatorVaultPda(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()],
    PUMP_FUN_PROGRAM_ID,
  )[0];
}

export async function fetchCreatorVaultLamports(
  connection: Connection,
  creator: PublicKey,
): Promise<bigint> {
  const pda = creatorVaultPda(creator);
  const bal = await connection.getBalance(pda).catch(() => 0);
  return BigInt(bal);
}

export async function fetchBondingCurve(
  connection: Connection,
  mint: PublicKey,
): Promise<BondingCurveView | null> {
  const pda = bondingCurvePda(mint);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  // Layout (Anchor): 8-byte discriminator, then:
  //   virtualTokenReserves u64  [ 8:16)
  //   virtualSolReserves   u64  [16:24)
  //   realTokenReserves    u64  [24:32)
  //   realSolReserves      u64  [32:40)
  //   tokenTotalSupply     u64  [40:48)
  //   complete             bool [48]
  const virtualTokenReserves = d.readBigUInt64LE(8);
  const virtualSolReserves = d.readBigUInt64LE(16);
  const realTokenReserves = d.readBigUInt64LE(24);
  const realSolReserves = d.readBigUInt64LE(32);
  const tokenTotalSupply = d.readBigUInt64LE(40);
  const complete = d.readUInt8(48) !== 0;

  // price per whole 1e6-unit token in SOL:
  //   (virtualSol / 1e9) / (virtualToken / 1e6) = virtualSol / virtualToken / 1000
  const priceSolPerToken =
    virtualTokenReserves === 0n
      ? 0
      : Number(virtualSolReserves) / Number(virtualTokenReserves) / 1000;
  const marketCapSol =
    priceSolPerToken * (Number(tokenTotalSupply) / 1_000_000);

  const progress = complete
    ? 100
    : Math.max(
        0,
        Math.min(
          100,
          100 *
            (1 -
              Number(realTokenReserves) /
                Number(INITIAL_REAL_TOKEN_RESERVES)),
        ),
      );

  return {
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
    priceSolPerToken,
    marketCapSol,
    bondingProgressPct: progress,
  };
}

// Cached SOL/USD rate via CoinGecko — refreshed every 60s.
let solUsdCache = { price: 0, ts: 0 };
export async function getSolUsd(): Promise<number> {
  const fresh = Date.now() - solUsdCache.ts < 60_000;
  if (fresh && solUsdCache.price > 0) return solUsdCache.price;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    );
    const j = (await res.json()) as { solana?: { usd?: number } };
    const price = j?.solana?.usd ?? 0;
    if (price > 0) solUsdCache = { price, ts: Date.now() };
    return price;
  } catch {
    return solUsdCache.price;
  }
}
