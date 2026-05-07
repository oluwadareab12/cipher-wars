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

import type { Program } from "@coral-xyz/anchor";
import { getProvider, getProgram } from "../lib/anchor";

if (typeof window !== "undefined") {
  // @ts-ignore
  window.__SOLANA_WALLET_STANDARD__ = false;
}

// Ankr endpoint shared with anchor.ts — both providers must agree.
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

  // Log every publicKey change so we can confirm when the wallet adapter delivers it.
  useEffect(() => {
    console.log("[CipherWars] publicKey changed →", publicKey?.toBase58() ?? "null");
  }, [publicKey]);

  useEffect(() => {
    console.log("WALLET STATE:", {
      connected: wallet.connected,
      publicKey: wallet.publicKey?.toBase58(),
    });
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return;

    cancelRef.current = false;

    const init = async () => {
      try {
        setError(null);
        console.log("[CipherWars] INIT: wallet ready, publicKey =", wallet.publicKey?.toBase58());

        const provider = getProvider(wallet, connection);
        if (cancelRef.current) return;
        console.log("[CipherWars] INIT: AnchorProvider created", provider);

        const prog = getProgram(provider);
        if (cancelRef.current) return;
        console.log("[CipherWars] INIT: Program created", prog.programId.toBase58());

        setProgram(prog);
        console.log("[CipherWars] INIT: program set in context ✓");
      } catch (err) {
        if (cancelRef.current) return;
        console.error("PROGRAM INIT FAILED:", err);
        setError(
          err instanceof Error ? err.message : "Network error. Please retry."
        );
        setProgram(null);
      }
    };

    init();

    return () => {
      cancelRef.current = true;
    };
  // retryCount lets the retry button force a fresh attempt
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, retryCount]);

  return (
    <ProgramContext.Provider value={{ program, error, retry }}>
      {children}
    </ProgramContext.Provider>
  );
}

// ─── Client-only layout wrapping all wallet adapter providers ─────────────────

export default function ClientLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    console.log("[CipherWars] ClientLayout rendering");
    console.log("🔥 WalletProvider mounted");
  }, []);
  const wallets = useMemo(() => [], []);

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
