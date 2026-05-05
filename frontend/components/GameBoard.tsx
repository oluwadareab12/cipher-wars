"use client";

import type { GameBoard as GameBoardType, Territory } from "../lib/game";
import { useWallet } from "@solana/wallet-adapter-react";

interface Props {
  board: GameBoardType;
  selectedFrom: number | null;
  onSelectTerritory: (id: number) => void;
}

const GRID_SIZE = 5;

export default function GameBoard({ board, selectedFrom, onSelectTerritory }: Props) {
  const { publicKey } = useWallet();
  const myId = publicKey?.toBase58() ?? "";

  function getTerritoryStyle(t: Territory) {
    const isSelected = t.id === selectedFrom;
    const isMine = t.owner === myId;
    const isOpponent = t.owner !== null && t.owner !== myId;

    let bg = "bg-gray-800/40"; // neutral
    let border = "border-gray-700/60";
    let glow = "";

    if (isMine) {
      bg = "bg-cyan-950/60";
      border = "border-cyan-500/60";
      glow = "shadow-[0_0_8px_#00f5ff33]";
    } else if (isOpponent) {
      bg = "bg-purple-950/60";
      border = "border-purple-500/60";
      glow = "shadow-[0_0_8px_#8b5cf633]";
    }

    if (isSelected) {
      bg = "bg-cyan-500/30";
      border = "border-cyan-400";
      glow = "shadow-[0_0_16px_#00f5ff66]";
    }

    return `${bg} ${border} ${glow}`;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {board.territories.map((t) => {
          const isMine = t.owner === myId;
          const isOpponent = t.owner !== null && !isMine;
          const isNeutral = t.owner === null;

          return (
            <button
              key={t.id}
              onClick={() => onSelectTerritory(t.id)}
              className={`
                relative w-14 h-14 rounded-lg border transition-all duration-150
                flex flex-col items-center justify-center cursor-pointer
                ${getTerritoryStyle(t)}
                ${isMine ? "hover:border-cyan-400 hover:bg-cyan-500/20" : ""}
                ${isNeutral ? "hover:border-gray-500 hover:bg-gray-700/40" : ""}
              `}
            >
              <span className="text-[10px] text-gray-500 font-mono absolute top-1 left-1.5">
                {t.id}
              </span>

              {isMine && (
                <span className="text-cyan-300 font-bold text-base leading-none">
                  {t.units}
                </span>
              )}

              {isOpponent && (
                <span className="text-purple-400 font-bold text-base leading-none">
                  ???
                </span>
              )}

              {isNeutral && t.units > 0 && (
                <span className="text-gray-500 font-bold text-base leading-none">
                  {t.units}
                </span>
              )}

              {isNeutral && t.units === 0 && (
                <span className="text-gray-700 text-xs">—</span>
              )}

              {isOpponent && (
                <span className="text-[8px] text-purple-600 absolute bottom-0.5">
                  FOG
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4 mt-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-cyan-500/60 border border-cyan-500/60 inline-block" />
          <span className="text-gray-400">Your territories</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-purple-500/60 border border-purple-500/60 inline-block" />
          <span className="text-gray-400">Opponent (fog of war)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-700/60 border border-gray-700/60 inline-block" />
          <span className="text-gray-400">Neutral</span>
        </span>
      </div>
    </div>
  );
}
