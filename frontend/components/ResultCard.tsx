"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { TurnResolution } from "../../mxe/src/combat.js";
import type { GameBoard } from "../lib/game";

interface Props {
  gameOver: boolean;
  winnerId: string | null;
  board: GameBoard;
  totalTurns: number;
  resolution: TurnResolution | null;
  onClaimWinnings: () => void;
  claiming: boolean;
}

export default function ResultCard({
  gameOver,
  winnerId,
  board,
  totalTurns,
  resolution,
  onClaimWinnings,
  claiming,
}: Props) {
  const { publicKey } = useWallet();
  const myId = publicKey?.toBase58() ?? "";
  const iWon = winnerId === myId;

  if (!gameOver && !resolution) return null;

  const myTerritories = board.territories.filter((t) => t.owner === myId).length;
  const opponentTerritories = board.territories.filter(
    (t) => t.owner !== null && t.owner !== myId
  ).length;
  const neutral = board.territories.filter((t) => t.owner === null).length;

  return (
    <div
      className={`rounded-xl border backdrop-blur p-6 space-y-4 ${
        gameOver
          ? iWon
            ? "border-green-500/60 bg-green-950/30 shadow-[0_0_32px_#22c55e33]"
            : "border-red-500/60 bg-red-950/30 shadow-[0_0_32px_#ef444433]"
          : "border-gray-700/60 bg-gray-900/60"
      }`}
    >
      {gameOver && (
        <div className="text-center">
          <div className={`text-3xl font-black ${iWon ? "text-green-400" : "text-red-400"}`}>
            {iWon ? "VICTORY" : "DEFEAT"}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {iWon ? "You conquered the cipher network!" : "Your cipher network has fallen."}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center bg-gray-800/50 rounded-lg p-3">
          <div className="text-cyan-400 font-bold text-xl">{myTerritories}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Your Zones</div>
        </div>
        <div className="text-center bg-gray-800/50 rounded-lg p-3">
          <div className="text-gray-300 font-bold text-xl">{totalTurns}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total Turns</div>
        </div>
        <div className="text-center bg-gray-800/50 rounded-lg p-3">
          <div className="text-purple-400 font-bold text-xl">{opponentTerritories}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Enemy Zones</div>
        </div>
      </div>

      {resolution && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-widest">
            Last Resolution
          </div>
          {resolution.combatResults.length === 0 ? (
            <p className="text-xs text-gray-500">No combat this turn.</p>
          ) : (
            resolution.combatResults.map((r, i) => (
              <div
                key={i}
                className="text-xs bg-gray-800/50 rounded-lg p-3 space-y-0.5"
              >
                <div>
                  Territory <span className="text-cyan-300 font-bold">{r.territoryChanged}</span>
                  {r.territoryChanged >= 0 ? (
                    <span className="text-green-400"> → captured</span>
                  ) : (
                    <span className="text-red-400"> → assault repelled</span>
                  )}
                </div>
                <div className="text-gray-500">
                  Attacker lost {r.attackerUnitsLost} · Defender lost {r.defenderUnitsLost}
                </div>
              </div>
            ))
          )}
          <div className="text-[10px] text-gray-600 font-mono break-all">
            algo hash: {resolution.algorithmHash.slice(0, 32)}…
          </div>
        </div>
      )}

      {gameOver && iWon && (
        <button
          onClick={onClaimWinnings}
          disabled={claiming}
          className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-150
            bg-gradient-to-r from-green-600 to-green-500 text-black
            hover:from-green-500 hover:to-green-400
            disabled:opacity-40 disabled:cursor-not-allowed
            shadow-[0_0_24px_#22c55e55]"
        >
          {claiming ? "Claiming…" : "Claim Winnings"}
        </button>
      )}
    </div>
  );
}
