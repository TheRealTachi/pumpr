import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";

// Thin pumpportal.fun client using local-signing endpoints so private keys
// never leave our infrastructure. Two operations we care about:
//   1. create (+ optional dev-buy) — via /api/trade-local { action: "create" }
//   2. collectCreatorFee — via /api/trade-local { action: "collectCreatorFee" }
//
// pump.fun's creator-fee model is *per-creator*, not per-mint: one
// collectCreatorFee call claims every outstanding fee across every token the
// signer created. Our crank just calls it once per dev wallet, then sweeps
// the resulting SOL into each mint's reward_vault via deposit_rewards.

const PUMPPORTAL_TRADE_LOCAL = "https://pumpportal.fun/api/trade-local";
const PINATA_FILES = "https://uploads.pinata.cloud/v3/files";
const PINATA_JWT = process.env.PINATA_JWT;
const IPFS_GATEWAY =
  process.env.IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

export interface CreateTokenArgs {
  connection: Connection;
  creator: Keypair;
  mint: Keypair;
  name: string;
  symbol: string;
  description: string;
  imageBytes?: Uint8Array;
  imageFilename?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  buyAmountSol: number; // 0 = no dev buy
  slippageBps: number;
  priorityFeeSol: number;
}

export async function uploadMetadata(args: {
  name: string;
  symbol: string;
  description: string;
  imageBytes?: Uint8Array;
  imageFilename?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}): Promise<string> {
  const fd = new FormData();
  // pump.fun's IPFS endpoint requires SOME file. If user didn't upload one,
  // attach a tiny transparent PNG placeholder so the launch can proceed.
  const bytes = args.imageBytes ?? PLACEHOLDER_PNG;
  fd.append(
    "file",
    new Blob([bytes as unknown as BlobPart]),
    args.imageFilename ?? "image.png",
  );
  fd.append("name", args.name);
  fd.append("symbol", args.symbol);
  fd.append("description", args.description);
  if (args.twitter) fd.append("twitter", args.twitter);
  if (args.telegram) fd.append("telegram", args.telegram);
  if (args.website) fd.append("website", args.website);
  fd.append("showName", "true");

  if (!PINATA_JWT) {
    throw new Error(
      "PINATA_JWT not set in env. Sign up at pinata.cloud and add the JWT to services/launcher/.env",
    );
  }

  // 1. Pin the image
  const imgFd = new FormData();
  imgFd.append("network", "public");
  imgFd.append(
    "file",
    new Blob([bytes as unknown as BlobPart]),
    args.imageFilename ?? "image.png",
  );
  const imgRes = await fetch(PINATA_FILES, {
    method: "POST",
    body: imgFd,
    headers: { authorization: `Bearer ${PINATA_JWT}` },
  });
  if (!imgRes.ok)
    throw new Error(`pinata image ${imgRes.status}: ${await imgRes.text()}`);
  const imgJson = (await imgRes.json()) as { data?: { cid?: string } };
  const imageCid = imgJson?.data?.cid;
  if (!imageCid) throw new Error("pinata image: no cid in response");

  // 2. Build + pin the metadata JSON
  const metadata = {
    name: args.name,
    symbol: args.symbol,
    description: args.description,
    image: `${IPFS_GATEWAY}/${imageCid}`,
    showName: true,
    twitter: args.twitter,
    telegram: args.telegram,
    website: args.website,
    createdOn: "https://pumprr.fun",
  };
  const metaFd = new FormData();
  metaFd.append("network", "public");
  metaFd.append(
    "file",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  const metaRes = await fetch(PINATA_FILES, {
    method: "POST",
    body: metaFd,
    headers: { authorization: `Bearer ${PINATA_JWT}` },
  });
  if (!metaRes.ok)
    throw new Error(
      `pinata metadata ${metaRes.status}: ${await metaRes.text()}`,
    );
  const metaJson = (await metaRes.json()) as { data?: { cid?: string } };
  const cid = metaJson?.data?.cid;
  if (!cid) throw new Error("pinata metadata: no cid in response");
  return `${IPFS_GATEWAY}/${cid}`;
}

export async function createTokenOnPump(
  args: CreateTokenArgs,
): Promise<{ signature: string; mint: PublicKey }> {
  const uri = await uploadMetadata({
    name: args.name,
    symbol: args.symbol,
    description: args.description,
    imageBytes: args.imageBytes,
    imageFilename: args.imageFilename,
    twitter: args.twitter,
    telegram: args.telegram,
    website: args.website,
  });

  const body = {
    publicKey: args.creator.publicKey.toBase58(),
    action: "create",
    tokenMetadata: {
      name: args.name,
      symbol: args.symbol,
      uri,
    },
    mint: args.mint.publicKey.toBase58(),
    denominatedInSol: "true",
    amount: args.buyAmountSol,
    slippage: Math.round(args.slippageBps / 100), // pumpportal uses percent
    priorityFee: args.priorityFeeSol,
    pool: "pump",
  };

  const res = await fetch(PUMPPORTAL_TRADE_LOCAL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`pumpportal ${res.status}: ${await res.text()}`);
  const data = new Uint8Array(await res.arrayBuffer());
  const tx = VersionedTransaction.deserialize(data);
  tx.sign([args.mint, args.creator]);
  const sig = await args.connection.sendTransaction(tx);
  await args.connection.confirmTransaction(sig, "confirmed");
  return { signature: sig, mint: args.mint.publicKey };
}

export async function collectCreatorFees(args: {
  connection: Connection;
  signer: Keypair;
  priorityFeeSol: number;
}): Promise<string | null> {
  const body = {
    publicKey: args.signer.publicKey.toBase58(),
    action: "collectCreatorFee",
    priorityFee: args.priorityFeeSol,
    pool: "pump",
  };
  const res = await fetch(PUMPPORTAL_TRADE_LOCAL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 400) {
    // pumpportal returns 400 when there are no fees to claim — not an error.
    return null;
  }
  if (!res.ok)
    throw new Error(`pumpportal ${res.status}: ${await res.text()}`);
  const data = new Uint8Array(await res.arrayBuffer());
  const tx = VersionedTransaction.deserialize(data);
  tx.sign([args.signer]);
  const sig = await args.connection.sendTransaction(tx);
  await args.connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// 1×1 transparent PNG (67 bytes) used when user doesn't upload an image.
const PLACEHOLDER_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export function isMainnet(rpcUrl: string): boolean {
  return /mainnet|api\.mainnet|rpc\.helius|quiknode|triton/.test(rpcUrl);
}
