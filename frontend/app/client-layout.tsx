"use client";

import { Buffer } from "buffer";
if (typeof window !== "undefined") (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

const DEVNET_RPC = "https://rpc.ankr.com/solana_devnet";

export default function ClientLayout({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
