"use client";

import { useEffect, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";

type Tier = "1d" | "3d" | "7d";

interface Escrow {
  tier: Tier;
  pubkey: string;
}

interface Deposit {
  tier: Tier;
  amount: string;
  received_at: number;
  unlocks_at: number;
  returned_at: number | null;
  pending_sol: string;
  claimed_sol: string;
}

const TIERS: {
  tier: Tier;
  label: string;
  mult: string;
  sub: string;
}[] = [
  { tier: "1d", label: "1 DAY", mult: "1.00×", sub: "baseline" },
  { tier: "3d", label: "3 DAYS", mult: "1.75×", sub: "boosted" },
  { tier: "7d", label: "7 DAYS", mult: "3.00×", sub: "max belief" },
];

export function StakePanel({
  mint,
  symbol,
  escrows,
}: {
  mint: string;
  symbol: string;
  escrows: Escrow[];
}) {
  const [selected, setSelected] = useState<Tier>("3d");
  const [copied, setCopied] = useState(false);
  const [addr, setAddr] = useState("");
  const [mine, setMine] = useState<Deposit[]>([]);

  const escrow = escrows.find((e) => e.tier === selected);

  const lookup = async () => {
    if (!addr) return setMine([]);
    try {
      const r = await fetch(
        `${LAUNCHER_API}/api/tokens/${mint}/deposits?address=${addr}`,
      );
      if (r.ok) {
        const j = await r.json();
        setMine(j.items ?? []);
      }
    } catch {
      setMine([]);
    }
  };

  useEffect(() => {
    const id = setInterval(lookup, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, mint]);

  const copy = () => {
    if (!escrow) return;
    navigator.clipboard.writeText(escrow.pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="panel p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          stake
        </span>
        <span className="rounded bg-[color:var(--green)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--green)]">
          POB
        </span>
      </div>
      <h3 className="text-sm font-bold">Send to lock, earn fees</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--muted)]">
        send ${symbol || "TOKEN"} to one of the staking addresses below. pumpr
        auto-returns them when the lock expires. every hour, 90% of pump.fun
        creator fees are distributed pro-rata to active stakers, weighted by
        amount × tier.
      </p>

      {/* Tier selector */}
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {TIERS.map((t) => {
          const active = selected === t.tier;
          return (
            <button
              key={t.tier}
              onClick={() => setSelected(t.tier)}
              className={`rounded-lg border px-2 py-2.5 text-center transition ${
                active
                  ? "border-[color:var(--green-dim)] bg-[color:var(--green)]/10"
                  : "border-[color:var(--border)] bg-[color:var(--bg)]/40 hover:border-[color:var(--green-dim)]/40"
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                {t.label}
              </div>
              <div
                className={`mt-0.5 text-base font-bold ${active ? "text-[color:var(--green)]" : ""}`}
              >
                {t.mult}
              </div>
              <div className="text-[9px] text-[color:var(--muted)]">
                {t.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Staking address */}
      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          send ${symbol || "TOKEN"} to
        </div>
        {escrow ? (
          <button
            onClick={copy}
            className="mt-1.5 block w-full break-all rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-left font-mono text-xs text-[color:var(--green)] transition hover:border-[color:var(--green-dim)]"
          >
            {escrow.pubkey}
            <div className="mt-1.5 text-[9px] uppercase tracking-wider text-[color:var(--muted)]">
              {copied ? "copied ✓" : "tap to copy"}
            </div>
          </button>
        ) : (
          <div className="mt-1.5 rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--bg)]/40 p-3 text-[11px] text-[color:var(--muted)]">
            staking address not provisioned yet
          </div>
        )}
      </div>

      <div className="mt-3 rounded-md border border-[color:var(--green-dim)]/30 bg-[color:var(--green)]/5 p-2.5 text-[10px] leading-relaxed text-[color:var(--muted)]">
        <span className="font-bold text-[color:var(--green)]">how:</span> from
        any wallet (phantom, solflare, cex withdrawal), send any amount of $
        {symbol || "TOKEN"} to the address above. pumpr credits your sender
        address as a staker and returns the tokens to that same address after{" "}
        {selected}. rewards paid in SOL every hour.
      </div>

      {/* Your stakes lookup */}
      <div className="mt-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          your stakes
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="paste your wallet address…"
            className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 font-mono text-[10px] placeholder:text-[color:var(--muted)] focus:border-[color:var(--green-dim)] focus:outline-none"
          />
          <button
            onClick={lookup}
            className="rounded-md border border-[color:var(--green-dim)] bg-[color:var(--green)]/10 px-3 text-[10px] font-bold uppercase text-[color:var(--green)]"
          >
            check
          </button>
        </div>

        {mine.length === 0 ? (
          addr ? (
            <div className="mt-2 rounded border border-dashed border-[color:var(--border)] p-3 text-center text-[10px] text-[color:var(--muted)]">
              no stakes found for this address
            </div>
          ) : null
        ) : (
          <div className="mt-2 space-y-1.5">
            {mine.map((d, i) => (
              <DepositRow key={i} dep={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DepositRow({ dep }: { dep: Deposit }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const unlockSec = Math.floor(dep.unlocks_at / 1000);
  const done = dep.returned_at !== null || nowSec >= unlockSec;
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg)]/50 p-2.5 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="font-bold">{fmtTok(dep.amount)}</span>
        <span className="rounded bg-[color:var(--panel-solid)] px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--green)]">
          {dep.tier}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[color:var(--muted)]">
        <span>
          {done ? "returned" : `unlocks in ${fmtCountdown(unlockSec - nowSec)}`}
        </span>
        <span className="text-[color:var(--green)]">
          +{(Number(BigInt(dep.pending_sol || "0")) / 1e9).toFixed(4)} ◎
        </span>
      </div>
    </div>
  );
}

function fmtTok(raw: string): string {
  if (!raw) return "0";
  const n = Number(BigInt(raw)) / 1_000_000;
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
