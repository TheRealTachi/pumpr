import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { WalletContextProvider } from "@/components/WalletContextProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800", "900"],
});
const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "pumpr",
  description:
    "pump.fun launchpad with Proof-of-Belief staking. Every token streams creator fees to its stakers.",
  icons: { icon: "/pumpr.png", apple: "/pumpr.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${space.variable} ${mono.variable}`}
    >
      <body className="min-h-screen">
        <WalletContextProvider>
          <Nav />
          <main>{children}</main>
        </WalletContextProvider>
      </body>
    </html>
  );
}
