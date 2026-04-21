"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";
import { StakeBar } from "./StakeBar";

interface Row {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  depositAddress: string;
  stakePct: number;
  totalStaked: string;
  lifetimeRewards: string;
  mintSupply: string;
  createdAt: number;
  launchedAt: number | null;
  marketCapSol?: number;
  priceSol?: number;
  vol24hSol?: number;
  txCount24h?: number;
  holders?: number;
  bondingProgress?: number;
  // optional once price history is aggregated across larger windows
  priceChange5m?: number;
  priceChange1h?: number;
  priceChange24h?: number;
}

type Sort = "new" | "mcap" | "vol" | "stake" | "fees";
type Filter = "all" | "new_launches" | "almost" | "graduated";

const ONE_HOUR = 60 * 60 * 1000;

export function TokenTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>("new");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [solUsd, setSolUsd] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=200`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setRows(d.items ?? []))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`${LAUNCHER_API}/api/sol-usd`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.price && setSolUsd(d.price))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const xs = rows.filter((r) => {
      if (
        q &&
        !(
          r.name.toLowerCase().includes(q.toLowerCase()) ||
          r.symbol.toLowerCase().includes(q.toLowerCase()) ||
          r.mint.toLowerCase().includes(q.toLowerCase())
        )
      )
        return false;
      if (filter === "new_launches") {
        return Date.now() - (r.launchedAt ?? r.createdAt) < ONE_HOUR;
      }
      if (filter === "almost") {
        return (r.bondingProgress ?? 0) >= 50 && (r.bondingProgress ?? 0) < 100;
      }
      if (filter === "graduated") return (r.bondingProgress ?? 0) >= 100;
      return true;
    });
    xs.sort((a, b) => {
      switch (sort) {
        case "mcap":
          return (b.marketCapSol ?? 0) - (a.marketCapSol ?? 0);
        case "vol":
          return (b.vol24hSol ?? 0) - (a.vol24hSol ?? 0);
        case "stake":
          return b.stakePct - a.stakePct;
        case "fees":
          return (
            Number(b.lifetimeRewards || "0") -
            Number(a.lifetimeRewards || "0")
          );
        default:
          return (
            (b.launchedAt ?? b.createdAt) - (a.launchedAt ?? a.createdAt)
          );
      }
    });
    return xs;
  }, [rows, sort, filter, q]);

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
            <span className="inline-block h-1 w-6 bg-[color:var(--green)]" />
            all tokens
          </div>
          <h2 className="heavy mt-2 text-3xl">
            Live on <span className="text-[color:var(--green)]">pumpr</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SortDropdown sort={sort} onChange={setSort} />
          <FilterDropdown filter={filter} onChange={setFilter} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter…"
            className="w-40 rounded-md border border-[color:var(--border)] bg-[color:var(--panel-solid)] px-3 py-1.5 text-xs placeholder:text-[color:var(--muted)] focus:border-[color:var(--green-dim)] focus:outline-none"
          />
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[1000px] text-xs">
          <thead>
            <tr className="border-b border-[color:var(--border)] text-[9px] uppercase tracking-widest text-[color:var(--muted)]">
              <th className="px-4 py-3 text-left">Token</th>
              <th className="px-2 py-3 text-right">MCap</th>
              <th className="px-2 py-3 text-right">5m %</th>
              <th className="px-2 py-3 text-right">1h %</th>
              <th className="px-2 py-3 text-right">24h %</th>
              <th className="px-2 py-3 text-right">Vol</th>
              <th className="px-2 py-3 text-right">TX</th>
              <th className="px-2 py-3 text-right">Holders</th>
              <th className="px-2 py-3 text-right">Stake</th>
              <th className="px-2 py-3 text-right">Progress</th>
              <th className="px-2 py-3 text-right">Created</th>
              <th className="px-4 py-3 text-right">Creator</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-16 text-center text-[color:var(--muted)]"
                >
                  loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-16 text-center text-[color:var(--muted)]"
                >
                  {q || filter !== "all" ? "no matches" : "no launches yet"}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <TokenRow key={r.mint} row={r} solUsd={solUsd} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TokenRow({ row, solUsd }: { row: Row; solUsd: number }) {
  const mcUsd = row.marketCapSol && solUsd ? row.marketCapSol * solUsd : 0;
  const volUsd = row.vol24hSol && solUsd ? row.vol24hSol * solUsd : 0;
  return (
    <tr className="border-b border-[color:var(--border)]/40 transition hover:bg-[color:var(--green)]/[0.025]">
      <td className="px-4 py-2">
        <Link
          href={`/token/${row.mint}`}
          className="flex items-center gap-2.5"
        >
          <Avatar src={row.imageUrl} symbol={row.symbol} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{row.name}</div>
            <div className="text-[10px] text-[color:var(--muted)]">
              ${row.symbol}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-2 py-2 text-right font-semibold">
        {mcUsd ? `$${fmtK(mcUsd)}` : "—"}
      </td>
      <Pct value={row.priceChange5m} />
      <Pct value={row.priceChange1h} />
      <Pct value={row.priceChange24h} />
      <td className="px-2 py-2 text-right text-[color:var(--muted)]">
        {volUsd
          ? `$${fmtK(volUsd)}`
          : row.vol24hSol
            ? `${row.vol24hSol.toFixed(2)}◎`
            : "—"}
      </td>
      <td className="px-2 py-2 text-right text-[color:var(--muted)]">
        {row.txCount24h ?? "—"}
      </td>
      <td className="px-2 py-2 text-right text-[color:var(--muted)]">
        {row.holders ?? "—"}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <StakeBar pct={row.stakePct} slim />
          <span className="w-10 text-right font-mono text-[10px] font-semibold text-[color:var(--green)]">
            {row.stakePct.toFixed(1)}%
          </span>
        </div>
      </td>
      <td className="px-2 py-2 text-right">
        <div className="inline-flex items-center gap-1.5">
          <div className="h-1 w-14 overflow-hidden rounded bg-[color:var(--bg)]">
            <div
              className="h-1 rounded bg-gradient-to-r from-[color:var(--green-dim)] to-[color:var(--green-soft)]"
              style={{
                width: `${Math.min(row.bondingProgress ?? 0, 100)}%`,
              }}
            />
          </div>
          <span className="w-8 text-[10px] text-[color:var(--muted)]">
            {(row.bondingProgress ?? 0).toFixed(0)}%
          </span>
        </div>
      </td>
      <td className="px-2 py-2 text-right text-[10px] text-[color:var(--muted)]">
        {timeAgo(row.launchedAt ?? row.createdAt)}
      </td>
      <td className="px-4 py-2 text-right">
        <span className="font-mono text-[10px] text-[color:var(--muted)]">
          {row.depositAddress.slice(0, 4)}…{row.depositAddress.slice(-4)}
        </span>
      </td>
    </tr>
  );
}

function Pct({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return (
      <td className="px-2 py-2 text-right text-[color:var(--muted)]">—</td>
    );
  }
  const cls =
    value > 0
      ? "text-[color:var(--green)]"
      : value < 0
        ? "text-[color:var(--red)]"
        : "text-[color:var(--muted)]";
  return (
    <td className={`px-2 py-2 text-right font-semibold ${cls}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </td>
  );
}

function Avatar({
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
        className="h-8 w-8 shrink-0 rounded-md object-cover"
      />
    );
  }
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[color:var(--green)]/10 text-[10px] font-bold text-[color:var(--green)]">
      {symbol.slice(0, 2)}
    </div>
  );
}

function SortDropdown({
  sort,
  onChange,
}: {
  sort: Sort;
  onChange: (s: Sort) => void;
}) {
  const opts: { v: Sort; label: string }[] = [
    { v: "new", label: "NEW" },
    { v: "mcap", label: "MCAP" },
    { v: "vol", label: "VOL" },
    { v: "stake", label: "STAKE %" },
    { v: "fees", label: "FEES" },
  ];
  return (
    <Dropdown
      icon="↻"
      active={opts.find((o) => o.v === sort)?.label ?? "NEW"}
      items={opts.map((o) => ({
        label: o.label,
        onClick: () => onChange(o.v),
        active: sort === o.v,
      }))}
    />
  );
}

function FilterDropdown({
  filter,
  onChange,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
}) {
  const opts: { v: Filter; label: string }[] = [
    { v: "all", label: "ALL" },
    { v: "new_launches", label: "NEW LAUNCHES" },
    { v: "almost", label: "ALMOST GRADUATED" },
    { v: "graduated", label: "GRADUATED" },
  ];
  return (
    <Dropdown
      icon="▤"
      active={opts.find((o) => o.v === filter)?.label ?? "ALL"}
      items={opts.map((o) => ({
        label: o.label,
        onClick: () => onChange(o.v),
        active: filter === o.v,
      }))}
    />
  );
}

function Dropdown({
  icon,
  active,
  items,
}: {
  icon: string;
  active: string;
  items: { label: string; onClick: () => void; active: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--panel-solid)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)] hover:text-white"
      >
        <span>{icon}</span>
        <span>{active}</span>
        <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-solid)] py-1 shadow-xl backdrop-blur-xl">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest hover:bg-[color:var(--green)]/10 ${
                  it.active ? "text-[color:var(--green)]" : ""
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function fmtK(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
