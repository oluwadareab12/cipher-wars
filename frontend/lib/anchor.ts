import {
  AnchorProvider,
  Program,
  BN,
  web3,
  Idl,
} from "@coral-xyz/anchor";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

const DEVNET_RPC = "https://rpc.ankr.com/solana_devnet";
const PROGRAM_ID = new PublicKey(
  "5dCn2JB86JwZo93NQAZ2unBqAxQLc1ZwXUbbgFPooxTi"
);

export const IDL = {
  address: "5dCn2JB86JwZo93NQAZ2unBqAxQLc1ZwXUbbgFPooxTi",
  version: "0.1.0",
  name: "cipher_wars",
  instructions: [
    {
      name: "createGame",
      accounts: [
        { name: "gameState", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "gameId", type: { array: ["u8", 32] } },
        { name: "stakeAmount", type: "u64" },
      ],
    },
    {
      name: "joinGame",
      accounts: [
        { name: "gameState", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "gameId", type: { array: ["u8", 32] } }],
    },
    {
      name: "submitMove",
      accounts: [
        { name: "gameState", isMut: true, isSigner: false },
        { name: "player", isMut: false, isSigner: true },
      ],
      args: [
        { name: "gameId", type: { array: ["u8", 32] } },
        { name: "encryptedData", type: { array: ["u8", 256] } },
        { name: "iv", type: { array: ["u8", 12] } },
        { name: "clientPublicKey", type: { array: ["u8", 32] } },
      ],
    },
    {
      name: "resolveGame",
      accounts: [
        { name: "gameState", isMut: true, isSigner: false },
        { name: "resolver", isMut: true, isSigner: true },
        { name: "playerOne", isMut: true, isSigner: false },
        { name: "playerTwo", isMut: true, isSigner: false },
      ],
      args: [
        { name: "gameId", type: { array: ["u8", 32] } },
        { name: "winner", type: "publicKey" },
      ],
    },
  ],
  accounts: [],
  types: [],
  errors: [],
} as unknown as Idl;

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}

export async function connectWithRetry(retries = 3): Promise<Connection> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const conn = new Connection(DEVNET_RPC, "confirmed");
      await conn.getLatestBlockhash();
      return conn;
    } catch (e) {
      lastError = e;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastError;
}

export function getProvider(
  wallet: WalletContextState,
  connection: Connection
): AnchorProvider {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
    throw new Error("Wallet not connected");
  }
  return new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    },
    { commitment: "confirmed" }
  );
}

export function getProgram(provider: AnchorProvider): Program {
  return new Program(IDL, provider);
}

export function gameIdToBytes(gameIdHex: string): number[] {
  const hex = gameIdHex.replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  return Array.from(Buffer.from(hex, "hex"));
}

export function getGamePda(gameIdBytes: number[]): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game"), Buffer.from(gameIdBytes)],
    PROGRAM_ID
  );
  return pda;
}

export async function createGame(
  program: Program,
  wallet: WalletContextState,
  gameIdHex: string,
  stakeAmountSol: number
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);
  const stakeAmount = new BN(Math.floor(stakeAmountSol * LAMPORTS_PER_SOL));

  return program.methods
    .createGame(gameIdBytes, stakeAmount)
    .accounts({
      gameState: gamePda,
      player: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
}

export async function joinGame(
  program: Program,
  wallet: WalletContextState,
  gameIdHex: string
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);

  return program.methods
    .joinGame(gameIdBytes)
    .accounts({
      gameState: gamePda,
      player: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
}

export async function submitMove(
  program: Program,
  wallet: WalletContextState,
  gameIdHex: string,
  encryptedMove: {
    encryptedData: string; // base64
    iv: string; // base64
    clientPublicKey: string; // base64
  }
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);

  const encDataRaw = Array.from(Buffer.from(encryptedMove.encryptedData, "base64"));
  const ivRaw = Array.from(Buffer.from(encryptedMove.iv, "base64"));
  const pubKeyRaw = Array.from(Buffer.from(encryptedMove.clientPublicKey, "base64"));

  const encData = [...encDataRaw.slice(0, 256), ...new Array(Math.max(0, 256 - encDataRaw.length)).fill(0)];
  const iv = [...ivRaw.slice(0, 12), ...new Array(Math.max(0, 12 - ivRaw.length)).fill(0)];
  const pubKey = [...pubKeyRaw.slice(0, 32), ...new Array(Math.max(0, 32 - pubKeyRaw.length)).fill(0)];

  return program.methods
    .submitMove(gameIdBytes, encData, iv, pubKey)
    .accounts({
      gameState: gamePda,
      player: wallet.publicKey,
    })
    .rpc();
}

export async function resolveGame(
  program: Program,
  wallet: WalletContextState,
  gameIdHex: string,
  winner: PublicKey,
  playerOne: PublicKey,
  playerTwo: PublicKey
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);

  return program.methods
    .resolveGame(gameIdBytes, winner)
    .accounts({
      gameState: gamePda,
      resolver: wallet.publicKey,
      playerOne,
      playerTwo,
    })
    .rpc();
}
