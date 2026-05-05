"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import WalletButton from "../components/WalletButton";
import GameBoard from "../components/GameBoard";
import MovePanel from "../components/MovePanel";
import ResultCard from "../components/ResultCard";
import { useAnchorProgram } from "./providers";
import {
  createGame,
  joinGame,
  fetchGameState,
  resolveGame,
} from "../lib/anchor";
import {
  initializeBoard,
  applyResolution,
  checkWinCondition,
} from "../lib/game";
import type { GameBoard as GameBoardType } from "../lib/game";
import type { TurnResolution } from "../lib/mxe-types";
import { resolveTurn, generateMxeKeyPair } from "../lib/mxe-client";
import { PublicKey } from "@solana/web3.js";

// Simulated MXE public key (replace with real Arcium MXE key in production)
const MXE_PUBLIC_KEY_B64 =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // placeholder 32-byte key

type Tab = "lobby" | "game" | "resolver";

export default function Home() {
  const wallet = useWallet();
  const { connected, publicKey } = wallet;
  const program = useAnchorProgram();

  const [tab, setTab] = useState<Tab>("lobby");
  const [activeGameId, setActiveGameId] = useState<string>("");
  const [createGameId, setCreateGameId] = useState<string>("");
  const [joinGameId, setJoinGameId] = useState<string>("");
  const [stakeAmount, setStakeAmount] = useState<string>("0.01");
  const [lobbyStatus, setLobbyStatus] = useState<string>("");
  const [board, setBoard] = useState<GameBoardType | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);
  const [lastResolution, setLastResolution] = useState<TurnResolution | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [resolverStatus, setResolverStatus] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  const myId = publicKey?.toBase58() ?? "";

  // Generate a random hex game ID
  function generateGameId(): string {
    const bytes = window.crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  useEffect(() => {
    setCreateGameId(generateGameId());
  }, []);

  // Poll game state when active
  const pollGameState = useCallback(async () => {
    if (!program || !activeGameId || !publicKey) return;

    try {
      const state = await fetchGameState(program, activeGameId);
      setTurnNumber(state.turn);

      if (!board) {
        const p1 = state.playerOne.toBase58();
        const p2 = state.playerTwo.toBase58();
        if (p2 !== "11111111111111111111111111111111") {
          setBoard(initializeBoard(p1, p2));
        }
      }

      if ("resolved" in state.status && state.winner) {
        setGameOver(true);
        setWinnerId(state.winner.toBase58());
      }
    } catch {
      // Game not found yet — normal while waiting
    }
  }, [program, activeGameId, publicKey, board]);

  useEffect(() => {
    if (!activeGameId) return;
    const id = setInterval(pollGameState, 5000);
    pollGameState();
    return () => clearInterval(id);
  }, [activeGameId, pollGameState]);

  async function handleCreateGame() {
    console.log("[CipherWars] handleCreateGame", {
      connected,
      publicKey: publicKey?.toBase58(),
      programReady: !!program,
    });
    if (!connected || !publicKey) {
      setLobbyStatus("Connect your wallet first.");
      return;
    }
    if (!program) {
      setLobbyStatus("Program not initialized — please wait a moment and try again.");
      return;
    }
    setLobbyStatus("Creating game on devnet…");
    try {
      const tx = await createGame(
        program,
        wallet,
        createGameId,
        parseFloat(stakeAmount)
      );
      setActiveGameId(createGameId);
      setLobbyStatus(`Game created ✓ — tx: ${tx.slice(0, 16)}…`);
      setTab("game");
    } catch (err) {
      setLobbyStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleJoinGame() {
    console.log("[CipherWars] handleJoinGame", {
      connected,
      publicKey: publicKey?.toBase58(),
      programReady: !!program,
    });
    if (!connected || !publicKey) {
      setLobbyStatus("Connect your wallet first.");
      return;
    }
    if (!program) {
      setLobbyStatus("Program not initialized — please wait a moment and try again.");
      return;
    }
    setLobbyStatus("Joining game…");
    try {
      const tx = await joinGame(program, wallet, joinGameId);
      setActiveGameId(joinGameId);
      setLobbyStatus(`Joined ✓ — tx: ${tx.slice(0, 16)}…`);

      // Init board immediately
      const state = await fetchGameState(program, joinGameId);
      setBoard(
        initializeBoard(
          state.playerOne.toBase58(),
          state.playerTwo.toBase58()
        )
      );
      setTab("game");
    } catch (err) {
      setLobbyStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleResolveTurn() {
    if (!program || !activeGameId) return;

    setResolving(true);
    setResolverStatus("Fetching encrypted moves from chain…");

    try {
      const state = await fetchGameState(program, activeGameId);

      if (state.playerOneMoves.length === 0 || state.playerTwoMoves.length === 0) {
        setResolverStatus("Both players must submit moves before resolving");
        setResolving(false);
        return;
      }

      const lastTurn = state.turn - 1;
      const p1Move = state.playerOneMoves.find((m) => m.turn === lastTurn);
      const p2Move = state.playerTwoMoves.find((m) => m.turn === lastTurn);

      if (!p1Move || !p2Move) {
        setResolverStatus("Moves for last turn not found on chain");
        setResolving(false);
        return;
      }

      setResolverStatus("Sending to MXE for encrypted combat resolution…");

      const mxeKeyPair = await generateMxeKeyPair();

      const encInput = [
        {
          encryptedData: Buffer.from(p1Move.encryptedData).toString("base64"),
          iv: Buffer.from(p1Move.iv).toString("base64"),
          clientPublicKey: Buffer.from(p1Move.clientPublicKey).toString("base64"),
          playerId: state.playerOne.toBase58(),
        },
        {
          encryptedData: Buffer.from(p2Move.encryptedData).toString("base64"),
          iv: Buffer.from(p2Move.iv).toString("base64"),
          clientPublicKey: Buffer.from(p2Move.clientPublicKey).toString("base64"),
          playerId: state.playerTwo.toBase58(),
        },
      ];

      const resolution = await resolveTurn(encInput, mxeKeyPair.privateKey);
      setLastResolution(resolution);

      if (board) {
        const updatedBoard = applyResolution(board, resolution);
        setBoard(updatedBoard);
        const winner = checkWinCondition(updatedBoard);
        if (winner) {
          setGameOver(true);
          setWinnerId(winner);
        }
      }

      if (resolution.gameOver && resolution.winner) {
        setResolverStatus(
          `Game over! Winner: ${resolution.winner.slice(0, 8)}… — calling resolve_game…`
        );
        const tx = await resolveGame(
          program,
          wallet,
          activeGameId,
          new PublicKey(resolution.winner)
        );
        setResolverStatus(`Resolved on-chain ✓ — tx: ${tx.slice(0, 16)}…`);
      } else {
        setResolverStatus(
          `Turn resolved. Hash: ${resolution.algorithmHash.slice(0, 16)}…`
        );
      }
    } catch (err) {
      setResolverStatus(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setResolving(false);
    }
  }

  async function handleClaimWinnings() {
    if (!program || !publicKey || !winnerId || !activeGameId) return;
    setClaiming(true);
    try {
      const tx = await resolveGame(
        program,
        wallet,
        activeGameId,
        new PublicKey(winnerId)
      );
      alert(`Winnings claimed ✓ — tx: ${tx}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* ── Top Banner ── */}
      <div className="border-b border-gray-800/80 bg-black/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-cyan-400 text-lg font-black tracking-tight text-glow-cyan">
              ⚡ Cipher Wars
            </span>
            <span className="hidden sm:block text-gray-600 text-xs">—</span>
            <span className="hidden sm:block text-gray-500 text-xs">
              Hidden-Information Strategy on Solana | MXE Encrypted Combat Resolution
            </span>
          </div>
          <WalletButton />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* ── Tabs ── */}
        {connected && (
          <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1 w-fit">
            {(["lobby", "game", "resolver"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all duration-150 ${
                  tab === t
                    ? "bg-gray-700/80 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {!connected && (
          <div className="text-center py-24 space-y-4">
            <div className="text-5xl font-black text-glow-cyan text-cyan-400 tracking-tight">
              CIPHER WARS
            </div>
            <div className="text-gray-400 max-w-md mx-auto text-sm">
              Hidden-information strategy on Solana. Your moves are sealed with{" "}
              <span className="text-cyan-400 font-semibold">X25519 + AES-GCM-256</span>{" "}
              and resolved inside an{" "}
              <span className="text-purple-400 font-semibold">Arcium MXE</span> —
              your strategy is never exposed.
            </div>
            <div className="pt-4">
              <WalletButton />
            </div>
          </div>
        )}

        {connected && tab === "lobby" && (
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
            {/* Create Game */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 backdrop-blur p-6 space-y-4">
              <h2 className="font-bold text-cyan-400 uppercase tracking-widest text-sm">
                Create Game
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Game ID</label>
                  <div className="flex gap-2">
                    <input
                      value={createGameId}
                      onChange={(e) => setCreateGameId(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      onClick={() => setCreateGameId(generateGameId())}
                      className="px-3 py-2 rounded-lg bg-gray-700 text-gray-400 text-xs hover:bg-gray-600 transition-colors"
                    >
                      ↺
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Stake (SOL)
                  </label>
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    step="0.01"
                    min="0"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleCreateGame}
                className="w-full py-2.5 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-cyan-700/80 to-cyan-500/80 text-black
                  hover:from-cyan-500 hover:to-cyan-400 transition-all
                  shadow-[0_0_16px_#00f5ff33]"
              >
                Create Game
              </button>
            </div>

            {/* Join Game */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 backdrop-blur p-6 space-y-4">
              <h2 className="font-bold text-purple-400 uppercase tracking-widest text-sm">
                Join Game
              </h2>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Game ID</label>
                <input
                  value={joinGameId}
                  onChange={(e) => setJoinGameId(e.target.value)}
                  placeholder="Paste game ID here…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <button
                onClick={handleJoinGame}
                className="w-full py-2.5 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-purple-700/80 to-purple-500/80 text-white
                  hover:from-purple-600 hover:to-purple-400 transition-all
                  shadow-[0_0_16px_#8b5cf633]"
              >
                Join Game
              </button>
            </div>

            {lobbyStatus && (
              <div className="md:col-span-2 text-xs text-gray-400 font-mono bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                {lobbyStatus}
              </div>
            )}

            {activeGameId && (
              <div className="md:col-span-2 text-xs text-gray-500 bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                Active game ID:{" "}
                <span className="font-mono text-cyan-400 break-all">
                  {activeGameId}
                </span>
              </div>
            )}
          </div>
        )}

        {connected && tab === "game" && (
          <div className="space-y-6">
            {!activeGameId ? (
              <p className="text-gray-500 text-sm">
                Create or join a game in the Lobby tab first.
              </p>
            ) : !board ? (
              <p className="text-gray-500 text-sm animate-pulse">
                Waiting for opponent to join…
              </p>
            ) : (
              <div className="grid lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-4">
                  {/* Turn indicator */}
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 uppercase tracking-widest">
                      Turn
                    </div>
                    <div className="text-cyan-400 font-bold text-lg">
                      {turnNumber}
                    </div>
                    {gameOver && (
                      <div className="text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                        GAME OVER
                      </div>
                    )}
                  </div>

                  <div className="relative scanlines">
                    <GameBoard
                      board={board}
                      selectedFrom={selectedFrom}
                      onSelectTerritory={(id) =>
                        setSelectedFrom((prev) => (prev === id ? null : id))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {!gameOver && (
                    <MovePanel
                      board={board}
                      gameIdHex={activeGameId}
                      mxePubKeyB64={MXE_PUBLIC_KEY_B64}
                      onMoveSubmitted={() => {
                        // Refresh turn counter
                        pollGameState();
                      }}
                    />
                  )}

                  <ResultCard
                    gameOver={gameOver}
                    winnerId={winnerId}
                    board={board}
                    totalTurns={turnNumber}
                    resolution={lastResolution}
                    onClaimWinnings={handleClaimWinnings}
                    claiming={claiming}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {connected && tab === "resolver" && (
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border border-purple-700/40 bg-gray-900/60 backdrop-blur p-6 space-y-4">
              <h2 className="font-bold text-purple-400 uppercase tracking-widest text-sm">
                MXE Combat Resolver
              </h2>

              <p className="text-xs text-gray-500">
                Fetches both players' encrypted moves from on-chain, decrypts
                them inside the MXE, resolves combat, and optionally finalises
                the game on-chain.
              </p>

              {activeGameId ? (
                <div className="text-xs text-gray-600 font-mono break-all border border-gray-700/50 rounded-lg p-2 bg-gray-800/30">
                  Game: {activeGameId.slice(0, 32)}…
                </div>
              ) : (
                <p className="text-xs text-yellow-500">
                  No active game — create or join one in the Lobby.
                </p>
              )}

              <button
                onClick={handleResolveTurn}
                disabled={resolving || !activeGameId}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-150
                  bg-gradient-to-r from-purple-700/80 to-purple-500/80 text-white
                  hover:from-purple-600 hover:to-purple-400
                  disabled:opacity-40 disabled:cursor-not-allowed
                  shadow-[0_0_16px_#8b5cf633]"
              >
                {resolving ? "Resolving…" : "Resolve Turn"}
              </button>

              {resolverStatus && (
                <p className="text-xs text-gray-400 font-mono break-all">
                  {resolverStatus}
                </p>
              )}

              {lastResolution && (
                <div className="space-y-2 border-t border-gray-700/50 pt-4">
                  <div className="text-xs text-gray-500 uppercase tracking-widest">
                    Resolution Result
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      Game Over:{" "}
                      <span
                        className={
                          lastResolution.gameOver
                            ? "text-yellow-400"
                            : "text-gray-400"
                        }
                      >
                        {lastResolution.gameOver ? "YES" : "No"}
                      </span>
                    </div>
                    {lastResolution.winner && (
                      <div>
                        Winner:{" "}
                        <span className="text-green-400 font-mono">
                          {lastResolution.winner.slice(0, 16)}…
                        </span>
                      </div>
                    )}
                    <div>
                      Combat events: {lastResolution.combatResults.length}
                    </div>
                    <div className="text-gray-600 font-mono text-[10px] break-all">
                      {lastResolution.algorithmHash}
                    </div>
                    <div className="text-gray-600 text-[10px]">
                      {lastResolution.resolvedAt}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800/50 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-700 space-y-1">
          <div>
            Cipher Wars — Encrypted Strategy on Solana · Devnet
          </div>
          <div>
            X25519 ECDH + HKDF-SHA256 + AES-GCM-256 ·{" "}
            <span className="text-gray-600">MXE swap point:</span>{" "}
            <code className="font-mono">mxe/src/combat.ts</code>
          </div>
        </div>
      </footer>
    </div>
  );
}
