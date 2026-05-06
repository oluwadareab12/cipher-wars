"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getConnection } from "../lib/anchor";

export default function WalletButton() {
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  console.log("WalletButton state:", { connected: wallet.connected, publicKey: wallet.publicKey?.toBase58() });
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey || !connected) {
      setBalance(null);
      return;
    }

    const conn: Connection = getConnection();
    conn.getBalance(publicKey).then((lamports) => {
      setBalance(lamports / LAMPORTS_PER_SOL);
    });
  }, [publicKey, connected]);

  const truncate = (addr: string) =>
    `${addr.slice(0, 4)}…${addr.slice(-4)}`;

  return (
    <div className="flex items-center gap-3">
      {connected && publicKey && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono bg-gray-800/60 px-2 py-1 rounded border border-gray-700">
            {truncate(publicKey.toBase58())}
          </span>
          {balance !== null && (
            <span className="text-cyan-400 font-semibold">
              {balance.toFixed(3)} SOL
            </span>
          )}
          <span className="text-gray-600 text-[10px] uppercase tracking-widest">
            devnet
          </span>
        </div>
      )}
      <WalletMultiButton
        style={{
          background: "linear-gradient(135deg, #00f5ff22, #8b5cf622)",
          border: "1px solid #00f5ff44",
          borderRadius: "8px",
          color: "#00f5ff",
          fontSize: "13px",
          fontWeight: 600,
          padding: "8px 16px",
          height: "auto",
          lineHeight: "1.4",
        }}
      />
    </div>
  );
}
