"use client";

import { useWallet } from "@solana/wallet-adapter-react";

export default function WalletButton() {
  const { connected, publicKey, connect, disconnect } = useWallet();

  return connected ? (
    <button
      onClick={() => disconnect()}
      className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono text-cyan-400 hover:border-cyan-500 transition-colors"
    >
      {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
    </button>
  ) : (
    <button
      onClick={() => connect().catch(console.error)}
      className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-sm font-semibold text-cyan-400 hover:bg-cyan-500/30 transition-colors"
    >
      Connect Wallet
    </button>
  );
}
