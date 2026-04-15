"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LAUNCHER_API } from "@/lib/config";

interface Token {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  stakePct: number;
  lifetimeRewards: string;
  totalStaked: string;
  marketCapSol?: number;
}

const PLACEHOLDERS: Token[] = [
  {
    mint: "demo-1",
    name: "Mysterious Source",
    symbol: "LAUNCH",
    imageUrl: null,
    stakePct: 23,
    lifetimeRewards: "1200000000",
    totalStaked: "230000000000000",
  },
  {
    mint: "demo-2",
    name: "Believe",
    symbol: "BELIEF",
    imageUrl: null,
    stakePct: 62,
    lifetimeRewards: "24300000000",
    totalStaked: "620000000000000",
  },
  {
    mint: "demo-3",
    name: "Deployr",
    symbol: "DEP",
    imageUrl: null,
    stakePct: 38,
    lifetimeRewards: "3700000000",
    totalStaked: "380000000000000",
  },
];

export function FeaturedCarousel() {
  const [rows, setRows] = useState<Token[]>(PLACEHOLDERS);
  const [realData, setRealData] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=50`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => {
          const items: Token[] = d.items ?? [];
          if (items.length === 0) return; // keep placeholders
          const sorted = [...items].sort(
            (a, b) => (b.marketCapSol ?? 0) - (a.marketCapSol ?? 0),
          );
          // If fewer than 3, loop to fill out the carousel visually
          const filled: Token[] =
            sorted.length >= 3
              ? sorted.slice(0, 10)
              : [...sorted, ...sorted, ...sorted].slice(0, 3);
          setRows(filled);
          setRealData(true);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (rows.length < 2) return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % rows.length),
      4500,
    );
    return () => clearInterval(id);
  }, [rows.length]);

  if (rows.length === 0) return null;
  const left = rows[(idx - 1 + rows.length) % rows.length];
  const center = rows[idx];
  const right = rows[(idx + 1) % rows.length];

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[1fr_1.15fr_1fr] items-center gap-0 px-4">
      <div className="tilt-l">
        <MiniCard token={left} disabled={!realData} />
      </div>
      <div className="tilt-c">
        <MiniCard token={center} featured disabled={!realData} />
      </div>
      <div className="tilt-r">
        <MiniCard token={right} disabled={!realData} />
      </div>
    </div>
  );
}

function MiniCard({
  token,
  featured,
  disabled,
}: {
  token: Token;
  featured?: boolean;
  disabled?: boolean;
}) {
  const fees = Number(BigInt(token.lifetimeRewards || "0")) / 1e9;
  const staked = Number(BigInt(token.totalStaked || "0")) / 1_000_000;
  const href = disabled ? "/launch" : `/token/${token.mint}`;

  const body = (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3 backdrop-blur-sm transition ${
        featured
          ? "border-[color:var(--green-dim)] bg-[color:var(--panel-solid)] shadow-[0_20px_60px_-20px_rgba(61, 218, 78,0.5)]"
          : "border-[color:var(--border)] bg-[color:var(--panel-solid)]"
      }`}
    >
      {/* top: avatar + change chip */}
      <div className="flex items-start justify-between">
        <Avatar src={token.imageUrl} symbol={token.symbol} />
        <div className="rounded-md bg-[color:var(--green)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--green)]">
          +{token.stakePct.toFixed(0)}%
        </div>
      </div>

      {/* centerpiece — if featured, show large glyph; otherwise compact */}
      <div className={`mt-3 ${featured ? "h-28" : "h-16"}`}>
        <GlowVisual featured={featured} symbol={token.symbol} />
      </div>

      {/* ticker */}
      <div className="mt-2 flex items-baseline justify-between">
        <div>
          <div className="truncate text-xs text-[color:var(--muted)]">
            {token.name}
          </div>
          <div className="text-sm font-bold">${token.symbol}</div>
        </div>
        <div className="text-right text-[10px]">
          <div className="text-[color:var(--muted)]">FEES</div>
          <div className="font-semibold text-[color:var(--green)]">
            {fees.toFixed(2)} SOL
          </div>
        </div>
      </div>

      {/* bottom: stake % + bar */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          <span>staked · {fmtN(staked)}</span>
          <span className="text-[color:var(--green)]">
            {token.stakePct.toFixed(1)}%
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-black/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[color:var(--green-dim)] to-[color:var(--green-soft)]"
            style={{ width: `${Math.min(token.stakePct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );

  return <Link href={href}>{body}</Link>;
}

function Avatar({ src, symbol }: { src: string | null; symbol: string }) {
  if (src) {
    const url = src.startsWith("http") ? src : `${LAUNCHER_API}${src}`;
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={url}
        alt={symbol}
        className="h-8 w-8 rounded-md object-cover ring-1 ring-[color:var(--border)]"
      />
    );
  }
  return (
    <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[color:var(--green)]/20 to-[color:var(--green-dim)]/10 text-[11px] font-bold text-[color:var(--green)]">
      {symbol.slice(0, 1)}
    </div>
  );
}

/* A gold/green gradient glyph for the featured card centerpiece — abstract
   replacement for printr's prayer-hands illustration. */
function GlowVisual({
  featured,
  symbol,
}: {
  featured?: boolean;
  symbol: string;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-b from-black/50 to-transparent">
      {/* soft gold/green radial */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full pulse-glow"
        style={{
          background: featured
            ? "radial-gradient(circle, rgba(255,208,105,0.7), rgba(61, 218, 78,0.4) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(61, 218, 78,0.35), transparent 70%)",
          filter: "blur(12px)",
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div
          className={`font-bold tracking-tight ${featured ? "text-4xl" : "text-xl"} text-white/90`}
          style={{
            textShadow: featured
              ? "0 0 30px rgba(61, 218, 78,0.8)"
              : "0 0 12px rgba(61, 218, 78,0.4)",
          }}
        >
          {symbol.slice(0, 4).toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function fmtN(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
