"use client";

import { useEffect, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";

type Tier = "1d" | "3d" | "7d";

interface Staker {
  stream_id: string;
  wallet: string;
  tier: Tier;
  amount: string;
  locked_at: number;
  unlocks_at: number;
  ended_at: number | null;
  claimed_sol: string;
}

export function StakersList({ mint }: { mint: string }) {
  const [rows, setRows] = useState<Staker[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(
        `${LAUNCHER_API}/api/tokens/${mint}/stakers?limit=100${showAll ? "&all=1" : ""}`,
      )
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setRows(d.items ?? []))
        .catch(() => setRows([]));
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [mint, showAll]);

  const activeCount = rows.filter((r) => r.ended_at === null).length;

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          stakers {activeCount > 0 && `· ${activeCount} active`}
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-[9px] uppercase tracking-wider text-[color:var(--muted)] hover:text-[color:var(--green)]"
        >
          {showAll ? "hide ended" : "show ended"}
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-[color:var(--muted)]">
          no locks yet — be the first to stake
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <StakerRow key={r.stream_id} s={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function StakerRow({ s }: { s: Staker }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const unlockSec = Math.floor(s.unlocks_at / 1000);
  const ended = s.ended_at !== null;
  const unlocked = ended || nowSec >= unlockSec;
  const ageMs = Math.max(0, Date.now() - s.locked_at);
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg)]/50 p-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-[color:var(--muted)]">
          {s.wallet.slice(0, 5)}…{s.wallet.slice(-4)}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
            ended
              ? "bg-[color:var(--panel-solid)] text-[color:var(--muted)]"
              : "bg-[color:var(--green)]/10 text-[color:var(--green)]"
          }`}
        >
          {s.tier}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[color:var(--muted)]">
        <span className="font-semibold text-[color:var(--text)]">
          {fmtTok(s.amount)}
        </span>
        <span>{fmtAge(ageMs)} ago</span>
        <span className="text-right">
          {ended
            ? "ended"
            : unlocked
              ? "unlocked"
              : `in ${fmtCountdown(unlockSec - nowSec)}`}
        </span>
      </div>
      <div className="mt-0.5 text-right text-[10px] text-[color:var(--green)]">
        +{(Number(s.claimed_sol || "0") / 1e9).toFixed(4)} ◎
      </div>
    </div>
  );
}

function fmtTok(raw: string): string {
  if (!raw) return "0";
  const n = Number(raw) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
function fmtCountdown(s: number): string {
  if (s <= 0) return "ready";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}
function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
