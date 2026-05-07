import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export const DEVNET_RPC = "https://rpc.ankr.com/solana_devnet";
export const PROGRAM_ID = new PublicKey("5dCn2JB86JwZo93NQAZ2unBqAxQLc1ZwXUbbgFPooxTi");

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}

export function getGamePda(gameIdBytes: number[]): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game"), Buffer.from(gameIdBytes)],
    PROGRAM_ID
  );
  return pda;
}

export function gameIdToBytes(gameIdHex: string): number[] {
  const hex = gameIdHex.replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  return Array.from(Buffer.from(hex, "hex"));
}

// Sanity check — send 1 lamport to self to prove wallet + RPC works
export async function sendSanityCheck(
  wallet: WalletContextState,
  connection: Connection
): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) throw new Error("Wallet not connected");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wallet.publicKey,
      lamports: 1,
    })
  );
  return wallet.sendTransaction(tx, connection);
}

export { LAMPORTS_PER_SOL };
