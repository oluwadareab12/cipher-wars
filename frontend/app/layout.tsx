import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvidersWrapper } from "./wallet-providers-wrapper";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Cipher Wars — Hidden-Information Strategy on Solana",
  description:
    "Encrypted, MXE-powered strategy game on Solana. Moves are sealed with X25519 + AES-GCM-256 and resolved inside an Arcium Multi-Party Execution Environment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0a0a0f] text-white antialiased min-h-screen">
        <WalletProvidersWrapper>{children}</WalletProvidersWrapper>
      </body>
    </html>
  );
}
