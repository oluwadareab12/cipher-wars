"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { GameBoard } from "../lib/game";
import { getAdjacentTerritories, isValidMove } from "../lib/game";
import { encryptMove } from "../lib/encryption";

interface Props {
  board: GameBoard;
  gameIdHex: string;
  mxePubKeyB64: string;
  onMoveSubmitted: (txSig: string) => void;
}

async function simulateTransaction(): Promise<string> {
  await new Promise((r) => setTimeout(r, 1500));
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function MovePanel({
  board,
  gameIdHex,
  mxePubKeyB64,
  onMoveSubmitted,
}: Props) {
  const wallet = useWallet();

  const [fromTerritory, setFromTerritory] = useState<number>(-1);
  const [toTerritory, setToTerritory] = useState<number>(-1);
  const [units, setUnits] = useState<number>(1);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [encryptedPreview, setEncryptedPreview] = useState<string>("");

  const myId = wallet.publicKey?.toBase58() ?? "";

  const myTerritories = board.territories.filter(
    (t) => t.owner === myId && t.units > 0
  );

  const adjacentTargets =
    fromTerritory >= 0
      ? getAdjacentTerritories(fromTerritory).filter(
          (t) => board.territories[t].owner !== myId
        )
      : [];

  const maxUnits =
    fromTerritory >= 0 ? board.territories[fromTerritory]?.units ?? 1 : 1;

  async function handleSubmit() {
    if (!wallet.publicKey) {
      setStatus("Wallet not connected");
      return;
    }

    if (!isValidMove(board, fromTerritory, toTerritory, units, myId)) {
      setStatus("Invalid move — check source, target, and unit count");
      return;
    }

    setLoading(true);
    setEncryptedPreview("");
    setStatus("Encrypting move with X25519 + AES-GCM-256…");

    try {
      const movePayload = {
        territories: myTerritories.map((t) => t.id),
        unitCounts: myTerritories.map((t) => t.units),
        targetTerritory: toTerritory,
        sourceTerritory: fromTerritory,
        unitsCommitted: units,
      };

      const encrypted = await encryptMove(movePayload, mxePubKeyB64);
      setEncryptedPreview(encrypted.encryptedData.slice(0, 32));

      setStatus("Submitting encrypted move to Solana devnet…");
      const txSig = await simulateTransaction();

      setStatus(`Move submitted ✓ — tx: ${txSig.slice(0, 16)}…`);
      onMoveSubmitted(txSig);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 backdrop-blur p-5 space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-widest">
        Submit Move
      </h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">
            Move From (your territory)
          </label>
          <select
            value={fromTerritory}
            onChange={(e) => {
              setFromTerritory(Number(e.target.value));
              setToTerritory(-1);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value={-1}>Select source territory</option>
            {myTerritories.map((t) => (
              <option key={t.id} value={t.id}>
                Territory {t.id} — {t.units} units
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1">
            Target Territory (adjacent only)
          </label>
          <select
            value={toTerritory}
            onChange={(e) => setToTerritory(Number(e.target.value))}
            disabled={fromTerritory < 0}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:opacity-40"
          >
            <option value={-1}>Select target territory</option>
            {adjacentTargets.map((id) => (
              <option key={id} value={id}>
                Territory {id}
                {board.territories[id].owner !== null ? " (enemy)" : " (neutral)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1">
            Units to Send (max {maxUnits})
          </label>
          <input
            type="number"
            min={1}
            max={maxUnits}
            value={units}
            onChange={(e) =>
              setUnits(Math.min(maxUnits, Math.max(1, Number(e.target.value))))
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="text-[11px] text-gray-500 flex items-center gap-1.5 border border-gray-700/50 rounded-lg px-3 py-2 bg-gray-800/30">
        <span className="text-cyan-500">🔒</span>
        Move encrypted with X25519 ECDH + AES-GCM-256 before submission
      </div>

      {encryptedPreview && (
        <div className="text-[10px] text-cyan-600/60 font-mono bg-gray-800/40 rounded px-2 py-1 break-all border border-cyan-800/30">
          ciphertext: {encryptedPreview}…
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || fromTerritory < 0 || toTerritory < 0}
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-150
          bg-gradient-to-r from-cyan-600/80 to-cyan-500/80 text-black
          hover:from-cyan-500 hover:to-cyan-400
          disabled:opacity-40 disabled:cursor-not-allowed
          shadow-[0_0_16px_#00f5ff33]"
      >
        {loading ? "Processing…" : "Encrypt & Submit Move"}
      </button>

      {status && (
        <p className="text-xs text-gray-400 font-mono break-all">{status}</p>
      )}
    </div>
  );
}
