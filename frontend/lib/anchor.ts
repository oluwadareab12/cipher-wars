import {
  AnchorProvider,
  Program,
  BN,
  web3,
  Idl,
} from "@coral-xyz/anchor";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

// Ankr public devnet endpoint — more reliable than the official public RPC.
// Swap for a Helius key (https://helius.dev) when one is available.
const DEVNET_RPC = "https://rpc.ankr.com/solana_devnet";
const PROGRAM_ID = new PublicKey(
  "5dCn2JB86JwZo93NQAZ2unBqAxQLc1ZwXUbbgFPooxTi"
);

// Minimal IDL for client-side interaction
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
  accounts: [
    {
      name: "GameState",
      type: {
        kind: "struct",
        fields: [
          { name: "gameId", type: { array: ["u8", 32] } },
          { name: "playerOne", type: "publicKey" },
          { name: "playerTwo", type: "publicKey" },
          { name: "playerOneStake", type: "u64" },
          { name: "playerTwoStake", type: "u64" },
          { name: "turn", type: "u8" },
          {
            name: "status",
            type: {
              defined: "GameStatus",
            },
          },
          { name: "winner", type: { option: { defined: "publicKey" } } },
          {
            name: "playerOneMoves",
            type: { vec: { defined: "EncryptedMove" } },
          },
          {
            name: "playerTwoMoves",
            type: { vec: { defined: "EncryptedMove" } },
          },
          { name: "createdAt", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "EncryptedMove",
      type: {
        kind: "struct",
        fields: [
          { name: "encryptedData", type: { array: ["u8", 256] } },
          { name: "iv", type: { array: ["u8", 12] } },
          { name: "clientPublicKey", type: { array: ["u8", 32] } },
          { name: "turn", type: "u8" },
          { name: "committedAt", type: "i64" },
        ],
      },
    },
    {
      name: "GameStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Waiting" },
          { name: "Active" },
          { name: "Resolved" },
        ],
      },
    },
  ],
  errors: [],
} as unknown as Idl;

export interface GameState {
  gameId: number[];
  playerOne: PublicKey;
  playerTwo: PublicKey;
  playerOneStake: BN;
  playerTwoStake: BN;
  turn: number;
  status: { waiting?: Record<string, never>; active?: Record<string, never>; resolved?: Record<string, never> };
  winner: PublicKey | null;
  playerOneMoves: EncryptedMoveOnChain[];
  playerTwoMoves: EncryptedMoveOnChain[];
  createdAt: BN;
  bump: number;
}

export interface EncryptedMoveOnChain {
  encryptedData: number[];
  iv: number[];
  clientPublicKey: number[];
  turn: number;
  committedAt: BN;
}

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}

// Creates a Connection and verifies it with a lightweight call, retrying on failure.
export async function connectWithRetry(retries = 3): Promise<Connection> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const conn = new Connection(DEVNET_RPC, "confirmed");
      await conn.getLatestBlockhash(); // verify the endpoint is reachable
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
  const stakeAmount = new BN(
    Math.floor(stakeAmountSol * LAMPORTS_PER_SOL)
  );

  const tx = await program.methods
    .createGame(gameIdBytes, stakeAmount)
    .accounts({
      gameState: gamePda,
      player: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  return tx;
}

export async function joinGame(
  program: Program,
  wallet: WalletContextState,
  gameIdHex: string
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);

  const tx = await program.methods
    .joinGame(gameIdBytes)
    .accounts({
      gameState: gamePda,
      player: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  return tx;
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

  // Decode base64 to byte arrays padded/trimmed to exact sizes
  const encDataRaw = Array.from(Buffer.from(encryptedMove.encryptedData, "base64"));
  const ivRaw = Array.from(Buffer.from(encryptedMove.iv, "base64"));
  const pubKeyRaw = Array.from(Buffer.from(encryptedMove.clientPublicKey, "base64"));

  // Pad to exact sizes required by program
  const encData = [...encDataRaw.slice(0, 256), ...new Array(Math.max(0, 256 - encDataRaw.length)).fill(0)];
  const iv = [...ivRaw.slice(0, 12), ...new Array(Math.max(0, 12 - ivRaw.length)).fill(0)];
  const pubKey = [...pubKeyRaw.slice(0, 32), ...new Array(Math.max(0, 32 - pubKeyRaw.length)).fill(0)];

  const tx = await program.methods
    .submitMove(gameIdBytes, encData, iv, pubKey)
    .accounts({
      gameState: gamePda,
      player: wallet.publicKey,
    })
    .rpc();

  return tx;
}

export async function resolveGame(
  program: Program,
  wallet: WalletContextState,
  gameIdHex: string,
  winner: PublicKey
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);
  const gameState = await fetchGameState(program, gameIdHex);

  const tx = await program.methods
    .resolveGame(gameIdBytes, winner)
    .accounts({
      gameState: gamePda,
      resolver: wallet.publicKey,
      playerOne: gameState.playerOne,
      playerTwo: gameState.playerTwo,
    })
    .rpc();

  return tx;
}

export async function fetchGameState(
  program: Program,
  gameIdHex: string
): Promise<GameState> {
  const gameIdBytes = gameIdToBytes(gameIdHex);
  const gamePda = getGamePda(gameIdBytes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.account as any).gameState.fetch(gamePda) as Promise<GameState>;
}
