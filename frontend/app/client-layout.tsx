"use client";

import { Buffer } from "buffer";
if (typeof window !== "undefined") (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import type { Program } from "@coral-xyz/anchor";
import { getProvider, getProgram } from "../lib/anchor";

const DEVNET_RPC = "https://rpc.ankr.com/solana_devnet";

// ─── Anchor program context ───────────────────────────────────────────────────

interface ProgramContextValue {
  program: Program | null;
  error: string | null;
  retry: () => void;
}

const ProgramContext = createContext<ProgramContextValue>({
  program: null,
  error: null,
  retry: () => {},
});

export function useAnchorProgram(): ProgramContextValue {
  return useContext(ProgramContext);
}

function AnchorProgramProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [program, setProgram] = useState<Program | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const cancelRef = useRef(false);

  const retry = useCallback(() => {
    setError(null);
    setProgram(null);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return;

    cancelRef.current = false;

    const init = async () => {
      try {
        setError(null);
        const provider = getProvider(wallet, connection);
        if (cancelRef.current) return;
        const prog = getProgram(provider);
        if (cancelRef.current) return;
        setProgram(prog);
      } catch (err) {
        if (cancelRef.current) return;
        setError(err instanceof Error ? err.message : "Network error. Please retry.");
        setProgram(null);
      }
    };

    init();

    return () => {
      cancelRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, retryCount]);

  return (
    <ProgramContext.Provider value={{ program, error, retry }}>
      {children}
    </ProgramContext.Provider>
  );
}

// ─── Root client layout ───────────────────────────────────────────────────────

export default function ClientLayout({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <AnchorProgramProvider>
          {children}
        </AnchorProgramProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
