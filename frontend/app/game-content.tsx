"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function GameContent() {
  const wallet = useWallet();
  console.log("WALLET OBJECT", wallet);
  const { connected, publicKey, connect } = wallet;

  useEffect(() => {
    console.log("WALLET STATE:", {
      connected: wallet.connected,
      publicKey: wallet.publicKey?.toBase58(),
    });
  }, [wallet.connected, wallet.publicKey]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
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
          {wallet.connected ? (
            <button
              onClick={() => wallet.disconnect()}
              className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono text-cyan-400 hover:border-cyan-500 transition-colors"
            >
              {wallet.publicKey?.toBase58().slice(0, 4)}...{wallet.publicKey?.toBase58().slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => wallet.connect().catch(console.error)}
              className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-sm font-semibold text-cyan-400 hover:bg-cyan-500/30 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {!connected ? (
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
              <button
                onClick={() => connect().catch(console.error)}
                className="px-6 py-3 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-cyan-700/80 to-cyan-500/80 text-black
                  hover:from-cyan-500 hover:to-cyan-400 transition-all
                  shadow-[0_0_16px_#00f5ff33]"
              >
                Connect Wallet
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-24 space-y-4">
            <div className="text-2xl font-bold text-cyan-400">Wallet Connected</div>
            <div className="text-gray-400 font-mono text-sm break-all max-w-md mx-auto">
              {publicKey?.toBase58()}
            </div>
            <div className="text-gray-600 text-xs">
              Game UI coming next once publicKey is confirmed.
            </div>
          </div>
        )}
      </main>

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
