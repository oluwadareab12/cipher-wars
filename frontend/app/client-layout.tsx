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

// ─── Anchor program context ───────────────────────────────────────────────────

const ProgramContext = createContext<Program | null>(null);

export function useAnchorProgram(): Program | null {
  return useContext(ProgramContext);
}

function AnchorProgramProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const { connected, publicKey, signTransaction, signAllTransactions } = wallet;
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    if (!connected || !publicKey || !signTransaction || !signAllTransactions) {
      setProgram(null);
      return;
    }
    try {
      const conn = getConnection();
      const provider = getProvider(wallet, conn);
      setProgram(getProgram(provider));
    } catch (e) {
      console.error("[CipherWars] Failed to initialize Anchor program:", e);
      setProgram(null);
    }
  // wallet reference changes on every render; individual fields are stable signals
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, signTransaction, signAllTransactions]);

  return (
    <ProgramContext.Provider value={program}>
      {children}
    </ProgramContext.Provider>
  );
}

// ─── Client-only layout wrapping all wallet adapter providers ─────────────────
// Rendered directly from page.tsx (not layout.tsx) so the provider tree
// never touches the SSR pass — eliminating hydration mismatch #418.

export default function ClientLayout({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AnchorProgramProvider>
            {children}
          </AnchorProgramProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
