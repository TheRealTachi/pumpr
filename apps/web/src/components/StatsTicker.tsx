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
      <div className="py-3 text-center font-mono text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
        · no pools yet · launch the first token to seed the staking · pumpr v1
        · proof of belief · where holders win ·
      </div>
    );
  }

  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden py-3">
      <div className="ticker-track flex gap-8 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
        {loop.map((i, idx) => (
          <div key={idx} className="flex shrink-0 items-center gap-2">
            <span className="text-[color:var(--green)]">${i.symbol}</span>
            <span>
              stake {i.stakePct.toFixed(1)}%
            </span>
            <span>·</span>
            <span>
              fees{" "}
              <span className="text-[color:var(--green-soft)]">
                {(Number(i.lifetimeRewards || "0") / 1e9).toFixed(3)}{" "}
                SOL
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
