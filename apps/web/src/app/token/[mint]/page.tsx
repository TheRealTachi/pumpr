"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LAUNCHER_API } from "@/lib/config";
import { PriceChart } from "@/components/PriceChart";
import { StakePanel } from "@/components/StakePanel";
import { StakersList } from "@/components/StakersList";

interface Meta {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  mint: string;
}
interface PoolDetail extends Meta {
  stakePct: number;
  totalStaked: string;
  lifetimeRewards: string;
  mintSupply: string;
  priceSol?: number;
  marketCapSol?: number;
  bondingProgress?: number;
  graduated?: boolean;
  holders?: number;
  // optional once trade indexer is added
  change24h?: number;
  vol24hUsd?: number;
}

export default function TokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = use(params);
  const [data, setData] = useState<PoolDetail | null>(null);
  const [solUsd, setSolUsd] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/tokens/${mint}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setData(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [mint]);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/sol-usd`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.price && setSolUsd(d.price))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const imageUrl = data?.imageUrl
    ? data.imageUrl.startsWith("http")
      ? data.imageUrl
      : `${LAUNCHER_API}${data.imageUrl}`
    : null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      {/* Top bar — token identity + quick stats */}
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <TokenImage src={imageUrl} symbol={data?.symbol ?? "?"} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold">
              {data?.name ?? "…"}
            </h1>
            {data?.symbol && (
              <span className="rounded bg-[color:var(--panel-solid)] px-1.5 py-0.5 text-xs text-[color:var(--green)]">
                ${data.symbol}
              </span>
            )}
            {data?.twitter && (
              <SocialBtn href={toUrl(data.twitter)} label="𝕏" />
            )}
            {data?.telegram && (
              <SocialBtn href={toUrl(data.telegram)} label="✈" />
            )}
            {data?.website && (
              <SocialBtn href={toUrl(data.website)} label="◐" />
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
            <span className="font-mono">
              {mint.slice(0, 10)}…{mint.slice(-6)}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(mint)}
              className="hover:text-white"
            >
              copy
            </button>
          </div>
        </div>
        <HeaderStats data={data} solUsd={solUsd} />
      </div>

      {/* Two-column: chart/trades + right sidebar */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4 min-w-0">
          <div className="panel p-4">
            <ChartHeader data={data} solUsd={solUsd} />
            <div className="mt-3">
              <PriceChart mint={mint} />
            </div>
          </div>

          <TradesFeed mint={mint} />

          {data?.description && (
            <div className="panel p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
                about
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {data.description}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <StakePanel mint={mint} symbol={data?.symbol ?? ""} />
          <StakersList mint={mint} />
          <TopHolders mint={mint} />
        </div>
      </div>
    </div>
  );
}

function HeaderStats({
  data,
  solUsd,
}: {
  data: PoolDetail | null;
  solUsd: number;
}) {
  const mcUsd =
    data?.marketCapSol && solUsd ? data.marketCapSol * solUsd : 0;
  const priceUsd = data?.priceSol && solUsd ? data.priceSol * solUsd : 0;
  return (
    <div className="flex flex-wrap items-center gap-5 border-l border-[color:var(--border)] pl-4">
      <Stat
        label="PRICE"
        value={priceUsd ? `$${priceUsd.toPrecision(4)}` : "—"}
        sub={
          data?.change24h !== undefined
            ? `${data.change24h >= 0 ? "+" : ""}${data.change24h.toFixed(1)}%`
            : undefined
        }
        good={data?.change24h !== undefined ? data.change24h >= 0 : undefined}
      />
      <Stat label="MC" value={mcUsd ? `$${fmtK(mcUsd)}` : "—"} />
      <Stat
        label="VOL 24H"
        value={data?.vol24hUsd ? `$${fmtK(data.vol24hUsd)}` : "—"}
      />
      <Stat label="HOLDERS" value={data?.holders ? data.holders.toString() : "—"} />
      <Stat
        label="STAKED"
        value={
          data && Number(data.totalStaked) > 0
            ? `${fmtK(Number(data.totalStaked) / 1_000_000)} (${data.stakePct.toFixed(1)}%)`
            : "—"
        }
        good={data ? Number(data.totalStaked) > 0 : undefined}
      />
      <Stat
        label="LIFETIME FEES"
        value={
          data
            ? `${(Number(data.lifetimeRewards || "0") / 1e9).toFixed(3)} ◎`
            : "—"
        }
        good={data ? Number(data.lifetimeRewards) > 0 : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  good,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
        {label}
      </div>
      <div className="mt-0.5 font-bold">
        {value}
        {sub && (
          <span
            className={`ml-1.5 text-[11px] font-semibold ${
              good === false
                ? "text-[color:var(--red)]"
                : "text-[color:var(--green)]"
            }`}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartHeader({
  data,
  solUsd,
}: {
  data: PoolDetail | null;
  solUsd: number;
}) {
  const progress = data?.bondingProgress ?? 0;
  const priceUsd = data?.priceSol && solUsd ? data.priceSol * solUsd : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
        <span className="font-mono text-[color:var(--text)]">
          {priceUsd ? `$${priceUsd.toPrecision(6)}` : "price —"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
          bonding
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded bg-[color:var(--bg)]">
          <div
            className="h-1.5 rounded bg-gradient-to-r from-[color:var(--green-dim)] to-[color:var(--green-soft)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs font-semibold text-[color:var(--green)]">
          {progress.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

interface TradeRow {
  ts: number;
  side: "buy" | "sell";
  sol: number;
  tokens: number;
  maker: string;
  sig: string;
}

function TradesFeed({ mint }: { mint: string }) {
  const [rows, setRows] = useState<TradeRow[]>([]);

  useEffect(() => {
    fetch(`${LAUNCHER_API}/api/tokens/${mint}/trades?limit=25`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setRows(d.items ?? []))
      .catch(() => setRows([]));
  }, [mint]);

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          recent trades
        </div>
        <div className="text-[10px] text-[color:var(--muted)]">
          live · pump.fun
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-[color:var(--muted)]">
            <th className="pb-2 text-left">Time</th>
            <th className="pb-2 text-left">Side</th>
            <th className="pb-2 text-right">SOL</th>
            <th className="pb-2 text-right">Tokens</th>
            <th className="pb-2 text-right">Maker</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="py-6 text-center text-[color:var(--muted)]"
              >
                waiting on pump.fun trade indexer…
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr
                key={i}
                className="border-t border-[color:var(--border)]/40"
              >
                <td className="py-1.5 font-mono text-[10px] text-[color:var(--muted)]">
                  {new Date(r.ts).toLocaleTimeString()}
                </td>
                <td
                  className={
                    r.side === "buy"
                      ? "text-[color:var(--green)]"
                      : "text-[color:var(--red)]"
                  }
                >
                  {r.side}
                </td>
                <td className="text-right">{r.sol.toFixed(4)}</td>
                <td className="text-right">{fmtK(r.tokens)}</td>
                <td className="text-right font-mono text-[10px] text-[color:var(--muted)]">
                  {r.maker.slice(0, 4)}…{r.maker.slice(-4)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TopHolders({ mint }: { mint: string }) {
  const [rows, setRows] = useState<{ address: string; amount: number }[]>(
    [],
  );
  useEffect(() => {
    fetch(`${LAUNCHER_API}/api/tokens/${mint}/holders?limit=10`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setRows(d.items ?? []))
      .catch(() => setRows([]));
  }, [mint]);
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
        top holders
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-[color:var(--muted)]">
          indexer coming online…
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((h, i) => (
            <div
              key={h.address}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-[color:var(--muted)]">#{i + 1}</span>
              <span className="font-mono text-[11px]">
                {h.address.slice(0, 5)}…{h.address.slice(-4)}
              </span>
              <span className="font-semibold">{fmtK(h.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SocialBtn({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="grid h-7 w-7 place-items-center rounded-md border border-[color:var(--border)] bg-[color:var(--panel-solid)] text-xs text-[color:var(--muted)] hover:border-[color:var(--green-dim)] hover:text-[color:var(--green)]"
    >
      {label}
    </a>
  );
}

function TokenImage({
  src,
  symbol,
  size,
}: {
  src: string | null;
  symbol: string;
  size: number;
}) {
  if (src) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={src}
        alt={symbol}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl object-cover ring-1 ring-[color:var(--border)]"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-xl bg-[color:var(--green)]/10 text-lg font-bold text-[color:var(--green)]"
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

function toUrl(raw: string): string {
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}
function fmtK(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
