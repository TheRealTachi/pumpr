import crypto from "node:crypto";

// Abstract interface so the production backend can swap in AWS KMS / GCP KMS /
// Turnkey without touching call-sites. The stub below uses local AES-GCM with
// a master key from env — ACCEPTABLE ONLY FOR LOCALNET / DEV. Do not ship to
// mainnet with this implementation.
export interface KeyVault {
  encrypt(plaintext: Uint8Array): Promise<string>; // returns base64 ciphertext
  decrypt(ciphertext: string): Promise<Uint8Array>;
}

export class EnvAesKeyVault implements KeyVault {
  private readonly key: Buffer;

  constructor(masterKeyHex: string) {
    if (masterKeyHex.length !== 64) {
      throw new Error("KEY_VAULT_MASTER_KEY_HEX must be 32 bytes (64 hex chars)");
    }
    this.key = Buffer.from(masterKeyHex, "hex");
  }

  async encrypt(plaintext: Uint8Array): Promise<string> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
  }

  async decrypt(b64: string): Promise<Uint8Array> {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
  }
}
