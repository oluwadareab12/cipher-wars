/**
 * Client-side encryption for Cipher Wars moves.
 * Uses X25519 ECDH + HKDF-SHA256 + AES-GCM-256.
 * Must match the decryption logic in mxe/src/combat.ts exactly.
 */

export interface DecryptedMove {
  territories: number[];
  unitCounts: number[];
  targetTerritory: number;
  sourceTerritory: number;
  unitsCommitted: number;
}

export interface EncryptedMovePayload {
  encryptedData: string; // base64
  iv: string; // base64
  clientPublicKey: string; // base64 X25519 public key
}

// Must match the info string in mxe/src/combat.ts
const HKDF_INFO = "cipher-wars-move-encryption-v1";

export async function encryptMove(
  move: DecryptedMove,
  mxePubKeyB64: string
): Promise<EncryptedMovePayload> {
  const subtle = window.crypto.subtle;

  // Import MXE public key
  const mxePubKeyBytes = Uint8Array.from(atob(mxePubKeyB64), (c) =>
    c.charCodeAt(0)
  );
  const mxePublicKey = await subtle.importKey(
    "raw",
    mxePubKeyBytes,
    { name: "X25519" },
    false,
    []
  );

  // Generate ephemeral client keypair
  const clientKeyPair = await subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveKey", "deriveBits"]
  ) as CryptoKeyPair;

  // Export client public key
  const clientPublicKeyBytes = new Uint8Array(
    await subtle.exportKey("raw", clientKeyPair.publicKey)
  );

  // ECDH shared secret
  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: mxePublicKey },
    clientKeyPair.privateKey,
    256
  );

  // HKDF-SHA256 key derivation
  const hkdfKey = await subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveKey",
  ]);

  const aesKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Encrypt the move payload
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(move));

  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);

  const toB64 = (buf: ArrayBuffer | Uint8Array): string =>
    btoa(Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => String.fromCharCode(b)).join(""));

  return {
    encryptedData: toB64(ciphertext),
    iv: toB64(iv),
    clientPublicKey: toB64(clientPublicKeyBytes),
  };
}

export function generateMoveId(): string {
  // UUID v4
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
