"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { getConnection, getProvider, getProgram } from "../lib/anchor";

// Anchor program context
const ProgramContext = createContext<Program | null>(null);

export function useAnchorProgram(): Program | null {
  return useContext(ProgramContext);
}

function ProgramProviderInner({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) {
      setProgram(null);
      return;
    }
    try {
      const conn = getConnection();
      const provider = getProvider(wallet, conn);
      const prog = getProgram(provider);
      setProgram(prog);
    } catch {
      setProgram(null);
    }
  }, [wallet.connected, wallet.publicKey]);

  return (
    <ProgramContext.Provider value={program}>
      {children}
    </ProgramContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = clusterApiUrl("devnet");
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ProgramProviderInner>{children}</ProgramProviderInner>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
