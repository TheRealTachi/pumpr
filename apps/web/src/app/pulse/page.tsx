"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";
import { StakeBar } from "@/components/StakeBar";

interface Row {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  stakePct: number;
  totalStaked: string;
  lifetimeRewards: string;
  mintSupply: string;
  status: string;
  createdAt: number;
  launchedAt: number | null;
  // optional bonding-curve fields — populated once a mainnet trade indexer
  // is wired up; for now we bucket by age + stake %.
  mcUsd?: number;
  marketCapSol?: number;
  priceSol?: number;
  vol24hUsd?: number;
  holders?: number;
  txCount?: number;
  buys?: number;
  sells?: number;
  bondingProgress?: number;
  graduated?: boolean;
}

const MIN_ALMOST_GRAD_MC = 15_000;
const ONE_HOUR = 60 * 60 * 1000;

type Bucket = "new" | "almost" | "grad";

export default function PulsePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [solUsd, setSolUsd] = useState(0);
  const [paused, setPaused] = useState<Record<Bucket, boolean>>({
    new: false,
    almost: false,
    grad: false,
  });
  const [queries, setQueries] = useState<Record<Bucket, string>>({
    new: "",
    almost: "",
    grad: "",
  });

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=200`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => {
          const items: Row[] = d.items ?? [];
          setRows(
            items.map((r) => ({
              ...r,
              mcUsd:
                r.marketCapSol && solUsd ? r.marketCapSol * solUsd : r.mcUsd,
            })),
          );
        })
        .catch(() => setRows([]));
    load();
    const id = setInterval(() => {
      if (!Object.values(paused).every(Boolean)) load();
    }, 10_000);
    return () => clearInterval(id);
  }, [paused, solUsd]);

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

  const { newCreated, almostGrad, graduated } = useMemo(() => {
    const n: Row[] = [];
    const a: Row[] = [];
    const g: Row[] = [];
    for (const r of rows) {
      if (r.graduated) {
        g.push(r);
        continue;
      }
      // Bucket by bonding curve progress now that we have real data.
      // "almost graduated" = bonding curve > 50%.
      if ((r.bondingProgress ?? 0) >= 50) a.push(r);
      else n.push(r);
    }
    // sort each bucket: newest first for "new", highest progress for "almost"
    n.sort(
      (x, y) => (y.launchedAt ?? y.createdAt) - (x.launchedAt ?? x.createdAt),
    );
    a.sort((x, y) => (y.bondingProgress ?? y.stakePct) - (x.bondingProgress ?? x.stakePct));
    g.sort(
      (x, y) => (y.launchedAt ?? y.createdAt) - (x.launchedAt ?? x.createdAt),
    );
    return { newCreated: n, almostGrad: a, graduated: g };
  }, [rows]);

  const Col = ({
    bucket,
    icon,
    title,
    items,
    hint,
  }: {
    bucket: Bucket;
    icon: string;
    title: string;
    items: Row[];
    hint?: string;
  }) => (
    <section className="flex min-w-0 flex-col">
      <header className="border-b border-[color:var(--border)] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h2 className="text-xs font-bold uppercase tracking-[0.25em]">
            {title}
          </h2>
          {hint && (
            <span
              title={hint}
              className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-[color:var(--border)] text-[9px] text-[color:var(--muted)]"
            >
              i
            </span>
          )}
          <button
            onClick={() =>
              setPaused((p) => ({ ...p, [bucket]: !p[bucket] }))
            }
            className="ml-auto rounded-md border border-[color:var(--border)] bg-[color:var(--panel-solid)] px-2 py-1 text-[10px] text-[color:var(--muted)] hover:text-white"
            title={paused[bucket] ? "resume" : "pause"}
          >
            {paused[bucket] ? "▶" : "❚❚"}
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={queries[bucket]}
            onChange={(e) =>
              setQueries((q) => ({ ...q, [bucket]: e.target.value }))
            }
            placeholder="filter…"
            className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--panel-solid)] px-3 py-1.5 text-xs placeholder:text-[color:var(--muted)] focus:border-[color:var(--green-dim)] focus:outline-none"
          />
          <button className="rounded-md border border-[color:var(--border)] bg-[color:var(--panel-solid)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[color:var(--muted)] hover:text-white">
            all ▾
          </button>
        </div>
      </header>
      <div className="mt-3 space-y-2.5 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--panel-solid)] p-8 text-center text-xs text-[color:var(--muted)]">
            empty
          </div>
        ) : (
          items
            .filter((r) => {
              const q = queries[bucket].toLowerCase();
              if (!q) return true;
              return (
                r.name.toLowerCase().includes(q) ||
                r.symbol.toLowerCase().includes(q) ||
                r.mint.toLowerCase().includes(q)
              );
            })
            .map((r) => <TokenCard key={r.mint} row={r} bucket={bucket} />)
        )}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[color:var(--muted)]">
            <span>⚡</span>
            live feed
          </div>
          <h1 className="mt-1 text-2xl font-bold">Pulse</h1>
        </div>
        <div className="text-[10px] text-[color:var(--muted)]">
          live · updates every 10s
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Col
          bucket="new"
          icon="🚀"
          title="newly created"
          items={newCreated}
        />
        <Col
          bucket="almost"
          icon="⏱"
          title="almost graduated"
          items={almostGrad}
          hint="market cap ≥ $15K · approaching bonding curve completion"
        />
        <Col
          bucket="grad"
          icon="◎"
          title="graduated"
          items={graduated}
          hint="bonding curve complete · migrated to AMM"
        />
      </div>
    </div>
  );
}

function TokenCard({ row, bucket }: { row: Row; bucket: Bucket }) {
  const [expanded, setExpanded] = useState(false);
  const progress =
    row.bondingProgress ?? (bucket === "grad" ? 100 : row.stakePct);
  const ageMs = Date.now() - (row.launchedAt ?? row.createdAt);
  const pctChange =
    row.stakePct > 0
      ? (bucket === "almost" ? row.stakePct * 10 : row.stakePct).toFixed(0)
      : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Link
      href={`/token/${row.mint}`}
      className={`group block rounded-xl border bg-[color:var(--panel-solid)] p-2.5 transition ${
        bucket === "grad"
          ? "border-[color:var(--green-dim)]/40"
          : "border-[color:var(--border)] hover:border-[color:var(--green-dim)]/50"
      }`}
    >
      <div className="flex gap-2.5">
        {/* Token image + bottom progress pill */}
        <div className="relative">
          <TokenImage src={row.imageUrl} symbol={row.symbol} size={76} />
          <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/90 to-transparent pb-1 pt-3 text-center text-[9px] font-bold text-white">
            {progress.toFixed(0)}%
          </div>
          {pctChange && (
            <div className="absolute -left-1 -top-1 rounded-md border border-[color:var(--green)]/40 bg-black px-1 py-0.5 text-[9px] font-bold text-[color:var(--green)]">
              +{pctChange}%
            </div>
          )}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-tight group-hover:text-[color:var(--green)]">
              {row.name}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="text-[color:var(--muted)] hover:text-white"
            >
              {expanded ? "▴" : "▾"}
            </button>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-[11px] text-[color:var(--muted)]">
              ${row.symbol}
            </span>
            <span className="rounded-sm bg-[color:var(--gold)]/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[color:var(--gold)]">
              memecoin
            </span>
            {row.twitter && (
              <SocialDot
                href={toUrl(row.twitter)}
                label="𝕏"
                onClick={stop}
              />
            )}
            {row.telegram && (
              <SocialDot
                href={toUrl(row.telegram)}
                label="✈"
                onClick={stop}
              />
            )}
            {row.website && (
              <SocialDot
                href={toUrl(row.website)}
                label="◐"
                onClick={stop}
              />
            )}
            <span className="ml-auto flex items-center gap-1 text-[10px] text-[color:var(--muted)]">
              <Clock />
              {fmtAge(ageMs)}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-3 text-[11px]">
            <div>
              <span className="text-[color:var(--muted)]">MC </span>
              <span className="font-semibold">
                {row.mcUsd ? `$${fmtK(row.mcUsd)}` : "—"}
              </span>
            </div>
            <div>
              <span className="text-[color:var(--muted)]">V </span>
              <span className="font-semibold">
                {row.vol24hUsd ? `$${fmtK(row.vol24hUsd)}` : "—"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-0.5 text-[color:var(--green)]">
              <span className="text-[10px] text-[color:var(--muted)]">
                fees
              </span>
              <span className="font-semibold">
                {(Number(row.lifetimeRewards || "0") / 1e9).toFixed(2)}
                <span className="text-[color:var(--muted)]">◎</span>
              </span>
            </div>
          </div>

          <div className="mt-2">
            <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
              <span>staked</span>
              <span className="text-[color:var(--green)]">
                {row.stakePct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1">
              <StakeBar pct={row.stakePct} slim />
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-2.5 text-[10px] text-[color:var(--muted)]">
            <span className="flex items-center gap-1">
              <PeopleIcon /> {row.holders ?? "—"}
            </span>
            <span>TX {row.txCount ?? "—"}</span>
            {row.buys !== undefined && row.sells !== undefined && (
              <span className="flex items-center gap-0.5">
                <span className="text-[color:var(--green)]">{row.buys}</span>
                <span className="h-1 w-8 overflow-hidden rounded bg-[color:var(--red)]/60">
                  <span
                    className="block h-1 bg-[color:var(--green)]"
                    style={{
                      width: `${(row.buys / Math.max(row.buys + row.sells, 1)) * 100}%`,
                    }}
                  />
                </span>
                <span className="text-[color:var(--red)]">{row.sells}</span>
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 rounded bg-[color:var(--panel-solid)] px-1.5 py-0.5 text-[10px] font-semibold">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    bucket === "grad"
                      ? "var(--green)"
                      : bucket === "almost"
                        ? "var(--gold)"
                        : "var(--green-dim)",
                }}
              />
              0.02◎
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div
          className="mt-3 border-t border-[color:var(--border)] pt-2.5 text-[10px] leading-relaxed text-[color:var(--muted)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="truncate font-mono">{row.mint}</div>
        </div>
      )}
    </Link>
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
    const url = src.startsWith("http") ? src : `${LAUNCHER_API}${src}`;
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={url}
        alt={symbol}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-lg object-cover ring-1 ring-[color:var(--border)]"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[color:var(--green)]/15 to-[color:var(--green-dim)]/5 text-sm font-bold text-[color:var(--green)]"
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

function SocialDot({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onClick}
      className="text-[10px] text-[color:var(--muted)] hover:text-white"
    >
      {label}
    </a>
  );
}

function Clock() {
  return <span className="text-[9px]">⏱</span>;
}
function PeopleIcon() {
  return <span className="text-[9px]">☻</span>;
}

function toUrl(raw: string): string {
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}
function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
