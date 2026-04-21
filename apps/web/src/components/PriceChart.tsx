"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  ColorType,
} from "lightweight-charts";
import { LAUNCHER_API } from "@/lib/config";

interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function PriceChart({ mint }: { mint: string }) {
  const container = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [interval, setInterval] = useState<Interval>("1m");

  useEffect(() => {
    if (!container.current) return;

    const chart: IChartApi = createChart(container.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7a857d",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(61, 218, 78,0.3)" },
        horzLine: { color: "rgba(61, 218, 78,0.3)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      height: 380,
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#3dda4e",
      downColor: "#ff5d5d",
      wickUpColor: "#3dda4e",
      wickDownColor: "#ff5d5d",
      borderVisible: false,
      priceFormat: { type: "price", precision: 12, minMove: 1e-12 },
    });
    seriesRef.current = series;

    let cancelled = false;
    let firstLoad = true;
    const load = () =>
      fetch(
        `${LAUNCHER_API}/api/tokens/${mint}/candles?interval=${interval}&limit=500`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !seriesRef.current) return;
          if (d && Array.isArray(d.items) && d.items.length > 0) {
            seriesRef.current.setData(
              d.items.map((c: Candle) => ({
                time: c.time as never,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
              })),
            );
            // Only adjust the viewport on initial load — don't yank the user's
            // pan/zoom around on every 15s refresh.
            if (firstLoad) {
              const n = d.items.length;
              chart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, n - 60),
                to: n + 6,
              });
              firstLoad = false;
            }
          } else {
            seriesRef.current.setData([]);
          }
        })
        .catch(() => {});
    load();
    const id = globalThis.setInterval(load, 15_000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(id);
      chart.remove();
      seriesRef.current = null;
    };
  }, [mint, interval]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
              interval === i
                ? "bg-[color:var(--green)]/10 text-[color:var(--green)]"
                : "text-[color:var(--muted)] hover:text-white"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div ref={container} className="h-[380px] w-full" />
    </div>
  );
}
