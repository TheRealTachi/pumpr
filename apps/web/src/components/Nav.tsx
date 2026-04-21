"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton,
    ),
  { ssr: false },
);

const NAV_ITEMS = [
  { href: "/", label: "HOME" },
  { href: "/pulse", label: "PULSE" },
  { href: "/launch", label: "LAUNCH" },
  { href: "/how-it-works", label: "HOW IT WORKS" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-24 max-w-7xl items-center gap-5 px-6">
        <Link href="/" className="group flex items-center" aria-label="pumpr home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pumpr.png"
            alt="pumpr"
            className="h-[60px] w-auto md:h-[72px]"
          />
        </Link>

        <nav className="ml-3 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold tracking-widest transition ${
                  active
                    ? "bg-[color:var(--green)]/10 text-[color:var(--green)]"
                    : "text-[color:var(--muted)] hover:text-white"
                }`}
              >
                [{item.label}]
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative hidden md:block">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[color:var(--muted)]">
              ⌕
            </span>
            <input
              placeholder="search token or paste address"
              className="w-80 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-solid)] py-1.5 pl-8 pr-3 text-xs placeholder:text-[color:var(--muted)] focus:border-[color:var(--green-dim)] focus:outline-none focus:ring-2 focus:ring-[color:var(--green)]/20"
            />
          </div>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
