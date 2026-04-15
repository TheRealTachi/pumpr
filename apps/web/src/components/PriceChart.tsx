"use client";

import { useEffect, useRef } from "react";
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
  volume?: number;
}

export function PriceChart({ mint }: { mint: string }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!container.current) return;

    const chart = createChart(container.current, {
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
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
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
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // placeholder data until trade indexer is wired
    const demo = buildDemoCandles();
    series.setData(
      demo.map((c) => ({
        time: c.time as never,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    // attempt real data from the launcher API
    fetch(`${LAUNCHER_API}/api/tokens/${mint}/candles?interval=1h&limit=200`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.items) && d.items.length > 0) {
          series.setData(
            d.items.map((c: Candle) => ({
              time: c.time as never,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            })),
          );
        }
      })
      .catch(() => {});

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [mint]);

  return <div ref={container} className="h-[380px] w-full" />;
}

function buildDemoCandles(): Candle[] {
  const out: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  let price = 0.00002;
  for (let i = 200; i >= 0; i--) {
    const t = now - i * 60 * 60;
    const change = (Math.random() - 0.48) * 0.03;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    out.push({ time: t, open, high, low, close });
    price = close;
  }
  return out;
}
