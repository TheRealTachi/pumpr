"use client";

import { useEffect, useState } from "react";
import { LAUNCHER_API } from "@/lib/config";

interface Item {
  symbol: string;
  stakePct: number;
  lifetimeRewards: string;
}

export function StatsTicker() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch(`${LAUNCHER_API}/api/launches?status=launched&limit=20`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-3 font-mono text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)] pulse-glow" />
        <span className="tracking-[0.3em]">
          pumpr v1 · proof of belief · where holders win
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)] pulse-glow" />
      </div>
    );
  }

  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden py-3.5">
      <div className="ticker-track flex gap-10 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
        {loop.map((i, idx) => (
          <div key={idx} className="flex shrink-0 items-center gap-2.5">
            <span className="h-1 w-1 rounded-full bg-[color:var(--green)]" />
            <span className="font-bold text-[color:var(--text)]">
              ${i.symbol}
            </span>
            <span className="text-[color:var(--muted)]">
              stake{" "}
              <span className="text-[color:var(--green)]">
                {i.stakePct.toFixed(1)}%
              </span>
            </span>
            <span className="text-[color:var(--border-strong)]">|</span>
            <span className="text-[color:var(--muted)]">
              fees{" "}
              <span className="font-semibold text-[color:var(--green-soft)]">
                {(Number(i.lifetimeRewards || "0") / 1e9).toFixed(3)} ◎
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
