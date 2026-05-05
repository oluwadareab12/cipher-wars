"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// ssr: false must live in a Client Component — cannot be used in Server Components.
// This wrapper owns the dynamic import so layout.tsx (a Server Component) stays clean.
const DynamicProviders = dynamic(() => import("./providers"), { ssr: false });

export function WalletProvidersWrapper({ children }: { children: ReactNode }) {
  return <DynamicProviders>{children}</DynamicProviders>;
}
