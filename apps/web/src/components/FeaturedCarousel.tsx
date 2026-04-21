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
  vol24hSol?: number;
  holders?: number;
  txCount24h?: number;
  launchedAt?: number | null;
  createdAt?: number;
}

const PLACEHOLDERS: Token[] = [
  { mint: "d1", name: "Launch", symbol: "LAUNCH", imageUrl: null, stakePct: 23, lifetimeRewards: "1200000000", totalStaked: "230000000000000", marketCapSol: 45, vol24hSol: 2, holders: 42 },
  { mint: "d2", name: "Believe", symbol: "BELIEF", imageUrl: null, stakePct: 62, lifetimeRewards: "24300000000", totalStaked: "620000000000000", marketCapSol: 180, vol24hSol: 12, holders: 210 },
  { mint: "d3", name: "Deployr", symbol: "DEP", imageUrl: null, stakePct: 38, lifetimeRewards: "3700000000", totalStaked: "380000000000000", marketCapSol: 80, vol24hSol: 4, holders: 88 },
  { mint: "d4", name: "Fat Choi", symbol: "FAT", imageUrl: null, stakePct: 14, lifetimeRewards: "900000000", totalStaked: "140000000000000", marketCapSol: 28, vol24hSol: 1, holders: 31 },
  { mint: "d5", name: "Printa", symbol: "PRINTA", imageUrl: null, stakePct: 9, lifetimeRewards: "420000000", totalStaked: "90000000000000", marketCapSol: 12, vol24hSol: 0.4, holders: 18 },
];

export function FeaturedCarousel() {
  const [rows, setRows] = useState<Token[]>(PLACEHOLDERS);
  const [realData, setRealData] = useState(false);
  const [solUsd, setSolUsd] = useState(0);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=50`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => {
          const items: Token[] = d.items ?? [];
          if (items.length === 0) return;
          const sorted = [...items].sort(
            (a, b) => (b.marketCapSol ?? 0) - (a.marketCapSol ?? 0),
          );
          const filled: Token[] =
            sorted.length >= 5
              ? sorted.slice(0, 10)
              : [...sorted, ...sorted, ...sorted].slice(0, 5);
          setRows(filled);
          setRealData(true);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/sol-usd`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.price && setSolUsd(d.price))
        .catch(() => {});
    load();
    const id = setInterval(load, 120_000);
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

  const at = (offset: number) =>
    rows[(idx + offset + rows.length * 10) % rows.length];

  // Positions: -2 outer-left, -1 near-left, 0 center, +1 near-right, +2 outer-right
  const slots: { offset: number; token: Token }[] = [
    { offset: -2, token: at(-2) },
    { offset: -1, token: at(-1) },
    { offset: 0, token: at(0) },
    { offset: 1, token: at(1) },
    { offset: 2, token: at(2) },
  ];

  return (
    <div className="mx-auto w-full">
      <div className="mb-6 flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-white">
        <span aria-hidden className="text-base">🔥</span>
        NOW TRENDING
      </div>

      <div
        className="relative flex items-center justify-center"
        style={{ minHeight: 420 }}
      >
        {/* fade edges so outer cards look like they bleed into the page */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[color:var(--bg)] to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[color:var(--bg)] to-transparent"
        />

        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {slots.map(({ offset, token }) => (
            <SlotCard
              key={`${offset}-${token.mint}`}
              offset={offset}
              token={token}
              disabled={!realData}
              solUsd={solUsd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlotCard({
  offset,
  token,
  disabled,
  solUsd,
}: {
  offset: number;
  token: Token;
  disabled: boolean;
  solUsd: number;
}) {
  // Tuning per slot: outer -> dim & small, center -> big & lit
  const abs = Math.abs(offset);
  const isCenter = abs === 0;

  const styleByAbs: Record<number, React.CSSProperties> = {
    0: {
      width: 320,
      opacity: 1,
      transform: "scale(1) translateY(0)",
      filter: "none",
      zIndex: 3,
    },
    1: {
      width: 230,
      opacity: 0.55,
      transform: `scale(0.9) translateY(8px) ${offset < 0 ? "rotateY(6deg)" : "rotateY(-6deg)"}`,
      filter: "saturate(0.7)",
      zIndex: 2,
    },
    2: {
      width: 180,
      opacity: 0.22,
      transform: `scale(0.82) translateY(14px) ${offset < 0 ? "rotateY(10deg)" : "rotateY(-10deg)"}`,
      filter: "saturate(0.45) blur(1px)",
      zIndex: 1,
    },
  };

  return (
    <div
      className="shrink-0 transition-all duration-500 ease-out"
      style={{ ...styleByAbs[abs], perspective: 1200 }}
    >
      <MiniCard token={token} featured={isCenter} disabled={disabled} solUsd={solUsd} />
    </div>
  );
}

function MiniCard({
  token,
  featured,
  disabled,
  solUsd,
}: {
  token: Token;
  featured?: boolean;
  disabled?: boolean;
  solUsd: number;
}) {
  const fees = Number(token.lifetimeRewards || "0") / 1e9;
  const feesUsd = fees * solUsd;
  const mcUsd = token.marketCapSol && solUsd ? token.marketCapSol * solUsd : 0;
  const volUsd = token.vol24hSol && solUsd ? token.vol24hSol * solUsd : 0;
  const holders = token.holders ?? 0;
  const tx = token.txCount24h ?? 0;
  const age = token.launchedAt ?? token.createdAt;
  const href = disabled ? "/launch" : `/token/${token.mint}`;

  return (
    <Link href={href}>
      <div
        className={`relative overflow-hidden rounded-2xl border bg-[color:var(--panel-solid)] backdrop-blur-sm ${
          featured
            ? "border-[color:var(--green-dim)] shadow-[0_24px_80px_-20px_rgba(61,218,78,0.45)]"
            : "border-[color:var(--border)]"
        }`}
      >
        {/* top row: small avatar badge + % change chip */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
          <div className="grid h-7 w-7 place-items-center rounded-md border border-[color:var(--border)] bg-black/60 text-[11px] font-bold text-[color:var(--green)]">
            {token.symbol?.[0] ?? "?"}
          </div>
          <div
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold ${
              token.stakePct >= 0
                ? "border-[color:var(--green-dim)] bg-black/50 text-[color:var(--green)]"
                : "border-[color:var(--red)]/40 bg-black/50 text-[color:var(--red)]"
            }`}
          >
            {token.stakePct >= 0 ? "+" : ""}
            {token.stakePct.toFixed(0)}%
          </div>
        </div>

        {/* centerpiece — token image as square, gradient fallback */}
        <div className="relative aspect-square w-full overflow-hidden">
          <TokenCenter
            src={token.imageUrl}
            symbol={token.symbol}
            featured={featured}
          />
        </div>

        {/* bottom meta block */}
        <div className="px-3 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-[11px] text-[color:var(--muted)]">
                ${token.symbol}
              </div>
              <div className="truncate text-sm font-bold">{token.name}</div>
            </div>
            <div className="shrink-0 text-right text-[10px] text-[color:var(--muted)]">
              <span className="inline-flex items-center gap-1 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)]" />
                {mintShort(token.mint)}
              </span>
            </div>
          </div>

          {/* gradient accent bar */}
          <div className="mt-2 h-1 w-full rounded-full bg-gradient-to-r from-[#ff7a7a] via-[#ffc36a] via-[#3dda4e] to-[#73a9ff] opacity-80" />

          {/* stats row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] text-[color:var(--muted)]">
            <Stat label="MC" value={mcUsd ? `$${fmtK(mcUsd)}` : "—"} />
            <Stat
              label="Vol"
              value={volUsd ? `$${fmtK(volUsd)}` : "—"}
            />
            <Stat label="👥" value={holders.toString()} />
            <Stat label="TX" value={tx ? fmtK(tx) : "—"} />
            {age && <Stat label="" value={timeAgo(age)} mono />}
            <span className="ml-auto text-[color:var(--green)]">
              {solUsd > 0
                ? `$${fmtK(feesUsd)}`
                : `${fees.toFixed(2)}◎`}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${mono ? "" : ""}`}>
      {label && <span className="text-[color:var(--muted)]/70">{label}</span>}
      <span className="font-semibold text-[color:var(--text)]">{value}</span>
    </span>
  );
}

function TokenCenter({
  src,
  symbol,
  featured,
}: {
  src: string | null;
  symbol: string;
  featured?: boolean;
}) {
  if (src) {
    const url = src.startsWith("http") ? src : `${LAUNCHER_API}${src}`;
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={symbol}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#ff9b6a]/25 via-[#8d6aff]/20 to-[#3dda4e]/25">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full pulse-glow"
        style={{
          background: featured
            ? "radial-gradient(circle, rgba(255,180,80,0.55), rgba(61,218,78,0.35) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(61,218,78,0.3), transparent 70%)",
          filter: "blur(22px)",
        }}
      />
      <div className="absolute inset-0 grid place-items-center text-5xl font-bold text-white/85 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {symbol.slice(0, 1)}
      </div>
    </div>
  );
}

function mintShort(mint: string): string {
  if (!mint || mint.length < 12) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function fmtK(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
