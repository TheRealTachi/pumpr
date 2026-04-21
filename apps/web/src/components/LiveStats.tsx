"use client";

import { useEffect, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";

interface Token {
  mint?: string;
  lifetimeRewards?: string;
  marketCapSol?: number;
}

export function LiveStats() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [solUsd, setSolUsd] = useState(0);
  const [stakerCount, setStakerCount] = useState<number | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=200`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setTokens(d.items ?? []))
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
    let cancelled = false;
    (async () => {
      const mints = tokens.map((t) => t.mint).filter(Boolean) as string[];
      if (mints.length === 0) return setStakerCount(0);
      try {
        const results = await Promise.all(
          mints.map((m) =>
            fetch(`${LAUNCHER_API}/api/tokens/${m}/stakers?limit=500`)
              .then((r) => (r.ok ? r.json() : { items: [] }))
              .catch(() => ({ items: [] })),
          ),
        );
        if (cancelled) return;
        const wallets = new Set<string>();
        for (const r of results) {
          for (const s of r.items ?? []) {
            if (s.ended_at == null) wallets.add(s.wallet);
          }
        }
        setStakerCount(wallets.size);
      } catch {
        if (!cancelled) setStakerCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const feesLamports = tokens.reduce(
    (acc, t) => acc + Number(t.lifetimeRewards || "0"),
    0,
  );
  const feesSol = feesLamports / 1e9;
  const feesUsd = feesSol * solUsd;
  const totalMcUsd = tokens.reduce(
    (acc, t) => acc + (t.marketCapSol ?? 0) * solUsd,
    0,
  );

  return (
    <section className="mx-auto max-w-6xl px-6 pt-6">
      <div className="panel grid grid-cols-2 gap-px overflow-hidden bg-[color:var(--border)] sm:grid-cols-4">
        <StatCell
          label="Tokens launched"
          value={tokens.length.toString()}
          suffix=""
        />
        <StatCell
          label="Fees distributed"
          value={
            solUsd > 0
              ? `$${fmtK(feesUsd)}`
              : `${feesSol.toFixed(3)} ◎`
          }
          suffix=""
          accent
        />
        <StatCell
          label="Active stakers"
          value={stakerCount === null ? "…" : stakerCount.toString()}
          suffix=""
        />
        <StatCell
          label="Total market cap"
          value={solUsd > 0 ? `$${fmtK(totalMcUsd)}` : "—"}
          suffix=""
        />
      </div>
    </section>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="relative bg-[color:var(--panel-solid)] px-5 py-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
        {label}
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-bold tracking-tight ${
          accent ? "text-[color:var(--green)]" : "text-[color:var(--text)]"
        }`}
      >
        {value}
      </div>
      {accent && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[color:var(--green)] to-transparent opacity-60" />
      )}
    </div>
  );
}

function fmtK(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
