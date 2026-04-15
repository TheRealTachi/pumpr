import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

// pump.fun migrated to Token-2022 in 2024. Solana token mints can be owned by
// either the classic Token program or Token-2022 — we detect which from the
// mint account's owner field, then pass it to ATA/transfer helpers.
export async function getMintTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`mint ${mint.toBase58()} not found`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(
    `mint ${mint.toBase58()} owned by unknown program ${info.owner.toBase58()}`,
  );
}
