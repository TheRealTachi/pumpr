"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";

interface TokenRow {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  stakePct: number;
  lifetimeRewards: string;
  launchedAt: number | null;
}

export function TrendingCards() {
  const [rows, setRows] = useState<TokenRow[] | null>(null);

  useEffect(() => {
    fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=3`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setRows(data.items ?? []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-solid)]"
          />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--panel-solid)] p-12 text-center">
        <div className="text-sm text-[color:var(--muted)]">
          No launches yet.
        </div>
        <Link
          href="/launch"
          className="mt-3 inline-block text-xs font-semibold uppercase tracking-widest text-[color:var(--green)] hover:underline"
        >
          be the first →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <Link
          key={r.mint}
          href={`/token/${r.mint}`}
          className="panel panel-hover group relative overflow-hidden p-5"
        >
          <div className="flex items-start gap-3">
            <TokenImage src={r.imageUrl} symbol={r.symbol} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{r.name}</div>
              <div className="text-xs text-[color:var(--muted)]">
                ${r.symbol}
              </div>
            </div>
            <div className="rounded-md bg-[color:var(--green)]/10 px-2 py-0.5 text-[10px] font-bold text-[color:var(--green)]">
              +{r.stakePct.toFixed(1)}%
            </div>
          </div>

          {/* Stake % visual bar */}
          <div className="mt-5 h-1 rounded bg-[color:var(--bg)]">
            <div
              className="h-1 rounded bg-gradient-to-r from-[color:var(--green-dim)] to-[color:var(--green-soft)]"
              style={{ width: `${Math.min(r.stakePct, 100)}%` }}
            />
          </div>

          <div className="mt-5 flex items-end justify-between text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                lifetime fees
              </div>
              <div className="mt-0.5 font-bold text-[color:var(--green)]">
                {(Number(r.lifetimeRewards || "0") / 1e9).toFixed(3)}{" "}
                <span className="text-[color:var(--muted)]">SOL</span>
              </div>
            </div>
            <div className="text-[10px] text-[color:var(--muted)]">
              {r.launchedAt ? timeAgo(r.launchedAt) : "—"}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function TokenImage({
  src,
  symbol,
}: {
  src: string | null;
  symbol: string;
}) {
  if (src) {
    const url = src.startsWith("http") ? src : `${LAUNCHER_API}${src}`;
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={url}
        alt={symbol}
        className="h-10 w-10 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[color:var(--green)]/10 text-sm font-bold text-[color:var(--green)]">
      {symbol.slice(0, 2)}
    </div>
  );
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
