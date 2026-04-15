import WebSocket from "ws";
import type Database from "better-sqlite3";

// Subscribes to live pump.fun trade events via pumpportal's free websocket and
// writes them into the `trades` table. We (re)subscribe whenever a new token
// is launched by re-building the subscription list every 15s.
//
// pumpportal message format for subscribeTokenTrade events:
//   {
//     signature, mint, traderPublicKey, txType: "buy"|"sell",
//     tokenAmount, solAmount, marketCapSol, timestamp (ms), ...
//   }

const WS_URL = "wss://pumpportal.fun/api/data";

export interface PumpPortalWsConfig {
  db: Database.Database;
  resubscribeMs: number;
}

interface TradeMsg {
  signature?: string;
  mint?: string;
  traderPublicKey?: string;
  txType?: "buy" | "sell";
  tokenAmount?: number;
  solAmount?: number;
  marketCapSol?: number;
  timestamp?: number;
}

export function startPumpPortalWs(cfg: PumpPortalWsConfig): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let subscribed = new Set<string>();
  let resubTimer: ReturnType<typeof setInterval> | null = null;

  const insert = cfg.db.prepare(
    `INSERT OR IGNORE INTO trades (signature, mint, trader, side, sol_amount, token_amount, market_cap_sol, ts)
     VALUES (@signature, @mint, @trader, @side, @sol_amount, @token_amount, @market_cap_sol, @ts)`,
  );

  const currentMints = (): string[] =>
    (
      cfg.db
        .prepare(
          `SELECT mint_pubkey AS mint FROM launches
           WHERE status = 'launched' AND mint_pubkey IS NOT NULL`,
        )
        .all() as { mint: string }[]
    ).map((r) => r.mint);

  const syncSubscriptions = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const want = new Set(currentMints());
    const toSub = [...want].filter((m) => !subscribed.has(m));
    const toUnsub = [...subscribed].filter((m) => !want.has(m));
    if (toSub.length > 0) {
      ws.send(
        JSON.stringify({
          method: "subscribeTokenTrade",
          keys: toSub,
        }),
      );
    }
    if (toUnsub.length > 0) {
      ws.send(
        JSON.stringify({
          method: "unsubscribeTokenTrade",
          keys: toUnsub,
        }),
      );
    }
    subscribed = want;
  };

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(WS_URL);
    subscribed = new Set();
    ws.on("open", () => {
      console.log("[pp-ws] connected");
      syncSubscriptions();
    });
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as TradeMsg;
        if (!msg.signature || !msg.mint || !msg.txType) return;
        insert.run({
          signature: msg.signature,
          mint: msg.mint,
          trader: msg.traderPublicKey ?? "",
          side: msg.txType,
          sol_amount: msg.solAmount ?? 0,
          token_amount: msg.tokenAmount ?? 0,
          market_cap_sol: msg.marketCapSol ?? null,
          ts: msg.timestamp ?? Date.now(),
        });
      } catch {
        /* heartbeats / non-trade messages */
      }
    });
    ws.on("close", () => {
      console.warn("[pp-ws] closed — reconnecting in 5s");
      if (!stopped) setTimeout(connect, 5_000);
    });
    ws.on("error", (e) => {
      console.error("[pp-ws] error", e);
    });
  };

  connect();
  resubTimer = setInterval(syncSubscriptions, cfg.resubscribeMs);

  return () => {
    stopped = true;
    if (resubTimer) clearInterval(resubTimer);
    if (ws) ws.close();
  };
}
