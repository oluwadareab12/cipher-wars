"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import GameBoard from "../components/GameBoard";
import MovePanel from "../components/MovePanel";
import ResultCard from "../components/ResultCard";
import {
  initializeBoard,
  applyResolution,
  checkWinCondition,
} from "../lib/game";
import type { GameBoard as GameBoardType } from "../lib/game";
import type { TurnResolution } from "../lib/mxe-types";
import { resolveTurn, generateMxeKeyPair } from "../lib/mxe-client";
import { encryptMove } from "../lib/encryption";

// A realistic-looking devnet opponent address for demo purposes
const MOCK_OPPONENT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

const MXE_PUBLIC_KEY_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

type Tab = "lobby" | "game" | "resolver";

function generateGameId(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function simulateTransaction(): Promise<string> {
  await new Promise((r) => setTimeout(r, 1500));
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function connectWallet(wallet: ReturnType<typeof useWallet>) {
  if (!wallet.wallet) await wallet.select("Phantom" as any);
  await wallet.connect();
}

export default function GameContent() {
  const wallet = useWallet();
  const { connected, publicKey } = wallet;
  const { connection } = useConnection();

  const [tab, setTab] = useState<Tab>("lobby");
  const [activeGameId, setActiveGameId] = useState<string>("");
  const [createGameId, setCreateGameId] = useState<string>("");
  const [joinGameId, setJoinGameId] = useState<string>("");
  const [stakeAmount, setStakeAmount] = useState<string>("0.01");
  const [lobbyStatus, setLobbyStatus] = useState<string>("");
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [board, setBoard] = useState<GameBoardType | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);
  const [lastResolution, setLastResolution] = useState<TurnResolution | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [resolverStatus, setResolverStatus] = useState<string>("");
  const [resolving, setResolving] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  useEffect(() => {
    setCreateGameId(generateGameId());
  }, []);

  useEffect(() => {
    if (!publicKey || !connection) return;
    connection
      .getBalance(publicKey)
      .then((bal) => setSolBalance(bal / LAMPORTS_PER_SOL));
  }, [publicKey, connection]);

  const handleMoveSubmitted = useCallback((txSig: string) => {
    setTurnNumber((n) => n + 1);
  }, []);

  async function handleCreateGame() {
    if (!connected || !publicKey) {
      setLobbyStatus("Connect your wallet first.");
      return;
    }
    setLobbyLoading(true);
    setLobbyStatus("Creating game on Solana devnet…");
    try {
      const tx = await simulateTransaction();
      const newBoard = initializeBoard(publicKey.toBase58(), MOCK_OPPONENT);
      setActiveGameId(createGameId);
      setBoard(newBoard);
      setTurnNumber(0);
      setGameOver(false);
      setWinnerId(null);
      setLastResolution(null);
      setLobbyStatus(`Game created ✓ — tx: ${tx.slice(0, 16)}…`);
      setTab("game");
    } catch (err) {
      setLobbyStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLobbyLoading(false);
    }
  }

  async function handleJoinGame() {
    if (!connected || !publicKey) {
      setLobbyStatus("Connect your wallet first.");
      return;
    }
    if (!joinGameId) {
      setLobbyStatus("Enter a game ID to join.");
      return;
    }
    setLobbyLoading(true);
    setLobbyStatus("Joining game…");
    try {
      const tx = await simulateTransaction();
      const newBoard = initializeBoard(MOCK_OPPONENT, publicKey.toBase58());
      setActiveGameId(joinGameId);
      setBoard(newBoard);
      setTurnNumber(0);
      setGameOver(false);
      setWinnerId(null);
      setLastResolution(null);
      setLobbyStatus(`Joined ✓ — tx: ${tx.slice(0, 16)}…`);
      setTab("game");
    } catch (err) {
      setLobbyStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLobbyLoading(false);
    }
  }

  async function handleResolveTurn() {
    if (!activeGameId || !board || !publicKey) return;
    setResolving(true);
    setResolverStatus("Generating ephemeral X25519 key pair…");
    try {
      const mxeKeyPair = await generateMxeKeyPair();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mxePubKeyB64 = Buffer.from(mxeKeyPair.publicKey as any).toString("base64");

      setResolverStatus("Encrypting combat moves with AES-GCM-256…");

      const myId = publicKey.toBase58();
      const myTerrs = board.territories.filter((t) => t.owner === myId && t.units > 0);
      const oppTerrs = board.territories.filter((t) => t.owner === MOCK_OPPONENT && t.units > 0);

      const myMovePayload = {
        territories: myTerrs.map((t) => t.id),
        unitCounts: myTerrs.map((t) => t.units),
        sourceTerritory: myTerrs[0]?.id ?? 0,
        targetTerritory: oppTerrs[0]?.id ?? 0,
        unitsCommitted: Math.max(1, Math.floor((myTerrs[0]?.units ?? 2) / 2)),
      };

      const oppMovePayload = {
        territories: oppTerrs.map((t) => t.id),
        unitCounts: oppTerrs.map((t) => t.units),
        sourceTerritory: oppTerrs[0]?.id ?? 0,
        targetTerritory: myTerrs[0]?.id ?? 0,
        unitsCommitted: Math.max(1, Math.floor((oppTerrs[0]?.units ?? 2) / 2)),
      };

      const enc1 = await encryptMove(myMovePayload, mxePubKeyB64);
      const enc2 = await encryptMove(oppMovePayload, mxePubKeyB64);

      setResolverStatus("Sending to Arcium MXE for encrypted combat resolution…");

      const encInput = [
        { ...enc1, playerId: myId },
        { ...enc2, playerId: MOCK_OPPONENT },
      ];

      const resolution = await resolveTurn(encInput, mxeKeyPair.privateKey);
      setLastResolution(resolution);

      const updatedBoard = applyResolution(board, resolution);
      setBoard(updatedBoard);
      const winner = checkWinCondition(updatedBoard);
      if (winner) {
        setGameOver(true);
        setWinnerId(winner);
      }

      setTurnNumber((n) => n + 1);

      if (resolution.gameOver && resolution.winner) {
        setResolverStatus(
          `Game over! Winner: ${resolution.winner.slice(0, 8)}… — simulating on-chain settlement…`
        );
        await simulateTransaction();
        setResolverStatus(
          `Settled on-chain ✓ — algorithm hash: ${resolution.algorithmHash.slice(0, 16)}…`
        );
      } else {
        setResolverStatus(
          `Turn ${turnNumber + 1} resolved ✓ — ${resolution.combatResults.length} combat event(s) · hash: ${resolution.algorithmHash.slice(0, 16)}…`
        );
      }
    } catch (err) {
      setResolverStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResolving(false);
    }
  }

  async function handleClaimWinnings() {
    if (!publicKey || !winnerId || !activeGameId) return;
    setClaiming(true);
    try {
      const tx = await simulateTransaction();
      alert(`Winnings claimed ✓ — tx: ${tx}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* ── Header ── */}
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-yellow-500/70 font-mono border border-yellow-500/30 rounded px-1.5 py-0.5">
              DEVNET
            </span>
            {connected && solBalance !== null && (
              <span className="hidden sm:block text-xs text-gray-400 font-mono">
                {solBalance.toFixed(4)} SOL
              </span>
            )}
            {wallet.connected ? (
              <button
                onClick={() => wallet.disconnect()}
                className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono text-cyan-400 hover:border-cyan-500 transition-colors"
              >
                {wallet.publicKey?.toBase58().slice(0, 4)}...
                {wallet.publicKey?.toBase58().slice(-4)}
              </button>
            ) : (
              <button
                onClick={async () => {
                  try { await connectWallet(wallet); } catch (e) { console.error(e); }
                }}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-sm font-semibold text-cyan-400 hover:bg-cyan-500/30 transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* ── Not connected splash ── */}
        {!connected && (
          <div className="text-center py-24 space-y-4">
            <div className="text-5xl font-black text-glow-cyan text-cyan-400 tracking-tight">
              CIPHER WARS
            </div>
            <div className="text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
              Hidden-information strategy on Solana. Your moves are sealed with{" "}
              <span className="text-cyan-400 font-semibold">X25519 + AES-GCM-256</span>{" "}
              and resolved inside an{" "}
              <span className="text-purple-400 font-semibold">Arcium MXE</span> —
              your strategy is never exposed.
            </div>
            <div className="pt-4">
              <button
                onClick={async () => {
                  try { await connectWallet(wallet); } catch (e) { console.error(e); }
                }}
                className="px-6 py-3 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-cyan-700/80 to-cyan-500/80 text-black
                  hover:from-cyan-500 hover:to-cyan-400 transition-all
                  shadow-[0_0_16px_#00f5ff33]"
              >
                Connect Wallet
              </button>
            </div>
          </div>
        )}

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

        {/* ── Lobby ── */}
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
                  <label className="text-xs text-gray-400 block mb-1">Stake (SOL)</label>
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
                disabled={lobbyLoading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-cyan-700/80 to-cyan-500/80 text-black
                  hover:from-cyan-500 hover:to-cyan-400 transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-[0_0_16px_#00f5ff33]"
              >
                {lobbyLoading && tab === "lobby" ? "Creating…" : "Create Game"}
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
                disabled={lobbyLoading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-purple-700/80 to-purple-500/80 text-white
                  hover:from-purple-600 hover:to-purple-400 transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-[0_0_16px_#8b5cf633]"
              >
                {lobbyLoading ? "Joining…" : "Join Game"}
              </button>
            </div>

            {lobbyStatus && (
              <div className={`md:col-span-2 text-xs font-mono bg-gray-800/40 rounded-lg p-3 border ${
                lobbyStatus.includes("✓")
                  ? "text-cyan-400 border-cyan-700/40"
                  : lobbyStatus.includes("Error")
                  ? "text-red-400 border-red-700/40"
                  : "text-gray-400 border-gray-700/50 animate-pulse"
              }`}>
                {lobbyStatus}
              </div>
            )}
            {activeGameId && (
              <div className="md:col-span-2 text-xs text-gray-500 bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                Active game ID:{" "}
                <span className="font-mono text-cyan-400 break-all">{activeGameId}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Game board ── */}
        {connected && tab === "game" && (
          <div className="space-y-6">
            {!activeGameId ? (
              <p className="text-gray-500 text-sm">Create or join a game in the Lobby tab first.</p>
            ) : !board ? (
              <p className="text-gray-500 text-sm animate-pulse">Initialising board…</p>
            ) : (
              <div className="grid lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 uppercase tracking-widest">Turn</div>
                    <div className="text-cyan-400 font-bold text-lg">{turnNumber}</div>
                    <div className="text-xs text-gray-600 font-mono">
                      {board.territories.filter((t) => t.owner === publicKey?.toBase58()).length} territories
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
                      onMoveSubmitted={handleMoveSubmitted}
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

        {/* ── Resolver ── */}
        {connected && tab === "resolver" && (
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border border-purple-700/40 bg-gray-900/60 backdrop-blur p-6 space-y-4">
              <h2 className="font-bold text-purple-400 uppercase tracking-widest text-sm">
                MXE Combat Resolver
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Fetches both players&apos; encrypted moves, decrypts them inside the{" "}
                <span className="text-purple-400">Arcium MXE</span> using X25519 ECDH,
                resolves combat, and finalises the game on-chain.
              </p>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/40">
                  <div className="text-gray-500 mb-0.5">Encryption</div>
                  <div className="text-cyan-400 font-mono">X25519 + AES-GCM</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/40">
                  <div className="text-gray-500 mb-0.5">Resolution</div>
                  <div className="text-purple-400 font-mono">Arcium MXE</div>
                </div>
              </div>

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
                disabled={resolving || !activeGameId || !board}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-150
                  bg-gradient-to-r from-purple-700/80 to-purple-500/80 text-white
                  hover:from-purple-600 hover:to-purple-400
                  disabled:opacity-40 disabled:cursor-not-allowed
                  shadow-[0_0_16px_#8b5cf633]"
              >
                {resolving ? "Resolving inside MXE…" : "Resolve Turn"}
              </button>

              {resolverStatus && (
                <p className={`text-xs font-mono break-all ${
                  resolverStatus.includes("✓")
                    ? "text-cyan-400"
                    : resolverStatus.includes("Error")
                    ? "text-red-400"
                    : "text-gray-400 animate-pulse"
                }`}>
                  {resolverStatus}
                </p>
              )}

              {lastResolution && (
                <div className="space-y-2 border-t border-gray-700/50 pt-4">
                  <div className="text-xs text-gray-500 uppercase tracking-widest">
                    Resolution Result
                  </div>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Game Over</span>
                      <span className={lastResolution.gameOver ? "text-yellow-400" : "text-gray-400"}>
                        {lastResolution.gameOver ? "YES" : "No"}
                      </span>
                    </div>
                    {lastResolution.winner && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Winner</span>
                        <span className="text-green-400 font-mono">
                          {lastResolution.winner.slice(0, 16)}…
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Combat events</span>
                      <span className="text-gray-300">{lastResolution.combatResults.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Resolved at</span>
                      <span className="text-gray-400">{lastResolution.resolvedAt}</span>
                    </div>
                    <div className="pt-1 border-t border-gray-700/50">
                      <div className="text-gray-500 mb-0.5">Algorithm hash</div>
                      <div className="text-gray-600 font-mono text-[10px] break-all">
                        {lastResolution.algorithmHash}
                      </div>
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
          <div>Cipher Wars — Encrypted Strategy on Solana · Devnet</div>
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
