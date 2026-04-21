"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { SolanaStreamClient, getBN } from "@streamflow/stream";
import { BN } from "bn.js";
import { LAUNCHER_API, RPC_URL } from "@/lib/config";

type Tier = "1d" | "3d" | "7d";

interface Deposit {
  stream_id: string;
  tier: Tier;
  amount: string;
  locked_at: number;
  unlocks_at: number;
  ended_at: number | null;
  claimed_sol: string;
}

const TIERS: {
  tier: Tier;
  seconds: number;
  label: string;
  mult: string;
  sub: string;
}[] = [
  { tier: "1d", seconds: 86_400, label: "1 DAY", mult: "1.00×", sub: "baseline" },
  { tier: "3d", seconds: 3 * 86_400, label: "3 DAYS", mult: "1.75×", sub: "boosted" },
  { tier: "7d", seconds: 7 * 86_400, label: "7 DAYS", mult: "3.00×", sub: "max belief" },
];

const TOKEN_DECIMALS = 6;

export function StakePanel({ mint, symbol }: { mint: string; symbol: string }) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { setVisible: openWalletModal } = useWalletModal();
  const [selected, setSelected] = useState<Tier>("3d");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [mine, setMine] = useState<Deposit[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  const tierDef = TIERS.find((t) => t.tier === selected)!;
  const client = useMemo(() => new SolanaStreamClient(RPC_URL), []);

  const loadMine = useCallback(async () => {
    const addr = wallet.publicKey?.toBase58();
    if (!addr) {
      setMine([]);
      return;
    }
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
  }, [wallet.publicKey, mint]);

  const loadBalance = useCallback(async () => {
    const owner = wallet.publicKey;
    if (!owner) {
      setBalance(null);
      return;
    }
    try {
      const mintPk = new PublicKey(mint);
      // Query both SPL-Token and Token-2022 programs — we don't know which
      // the mint lives under. Filter by mint client-side.
      const [classic, t22] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);
      const matches = [...classic.value, ...t22.value].filter(
        (a) => a.account.data.parsed?.info?.mint === mintPk.toBase58(),
      );
      console.log(
        `[stake] balance lookup owner=${owner.toBase58().slice(0, 6)}… mint=${mint.slice(0, 6)}… classic=${classic.value.length} t22=${t22.value.length} matched=${matches.length} endpoint=${connection.rpcEndpoint}`,
      );
      const total = matches.reduce((acc, a) => {
        return (
          acc +
          Number(a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0)
        );
      }, 0);
      setBalance(total);
    } catch (e) {
      console.error("[stake] balance lookup failed", e);
      setBalance(0);
    }
  }, [wallet.publicKey, mint, connection]);

  useEffect(() => {
    loadMine();
    loadBalance();
    const id = setInterval(() => {
      loadMine();
      loadBalance();
    }, 15_000);
    return () => clearInterval(id);
  }, [loadMine, loadBalance]);

  const stake = async () => {
    setMsg(null);
    if (!wallet.publicKey || !wallet.signTransaction) {
      openWalletModal(true);
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMsg({ text: "enter an amount", ok: false });
      return;
    }

    setBusy(true);
    try {
      const totalAmount = getBN(parsed, TOKEN_DECIMALS);
      // Streamflow classifies as a "token lock" when the cliff releases
      // everything minus 1 base unit. Follow the SDK convention.
      const cliffAmount = totalAmount.sub(new BN(1));
      // Streamflow rejects start timestamps in the past (on-chain clock is
      // slightly ahead of wallclock by tx-confirmation time). Buffer 60s.
      const start = Math.floor(Date.now() / 1000) + 60;
      const cliffTs = start + tierDef.seconds;

      const { txId } = await client.create(
        {
          recipient: wallet.publicKey.toBase58(),
          tokenId: mint,
          start,
          cliff: cliffTs,
          amount: totalAmount,
          cliffAmount,
          amountPerPeriod: new BN(1),
          period: 1,
          name: `pumpr ${symbol || ""} ${selected} lock`,
          canTopup: false,
          cancelableBySender: false,
          cancelableByRecipient: false,
          transferableBySender: false,
          transferableByRecipient: false,
          automaticWithdrawal: false,
        },
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sender: wallet as any,
          isNative: false,
        },
      );
      setMsg({ text: `locked! tx ${txId.slice(0, 8)}…`, ok: true });
      setAmount("");
      setTimeout(loadMine, 4_000);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({ text, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const connected = !!wallet.publicKey;

  return (
    <div className="panel p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
          stake
        </span>
        <span className="rounded bg-[color:var(--green)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--green)]">
          POB
        </span>
        <span className="ml-auto rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
          streamflow
        </span>
      </div>
      <h3 className="text-sm font-bold">Lock to earn fees</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--muted)]">
        locks ${symbol || "TOKEN"} non-custodially via streamflow. your tokens
        return to your wallet when the cliff hits — no one can move them early.
        every 30 minutes, 90% of pump.fun creator fees go pro-rata to active
        locks, weighted by amount × tier.
      </p>

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

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
            amount
          </div>
          {connected && (
            <div className="text-[10px] text-[color:var(--muted)]">
              balance:{" "}
              <span className="font-mono text-[color:var(--text)]">
                {balance === null ? "…" : fmtBal(balance)}
              </span>{" "}
              ${symbol || "TOKEN"}
            </div>
          )}
        </div>
        {connected && (
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {[0.25, 0.5, 0.75, 1].map((p) => {
              const disabled = !balance || balance <= 0;
              return (
                <button
                  key={p}
                  disabled={disabled}
                  onClick={() => {
                    if (!balance) return;
                    const v = balance * p;
                    setAmount(v < 1 ? v.toFixed(6) : v.toFixed(2));
                  }}
                  className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg)]/40 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)] transition hover:border-[color:var(--green-dim)] hover:text-[color:var(--green)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--border)] disabled:hover:text-[color:var(--muted)]"
                >
                  {p === 1 ? "MAX" : `${Math.round(p * 100)}%`}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`${symbol || "TOKEN"} to lock…`}
            inputMode="decimal"
            className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 font-mono text-xs placeholder:text-[color:var(--muted)] focus:border-[color:var(--green-dim)] focus:outline-none"
          />
          <button
            onClick={stake}
            disabled={busy}
            className="rounded-md border border-[color:var(--green-dim)] bg-[color:var(--green)]/10 px-4 text-xs font-bold uppercase text-[color:var(--green)] disabled:opacity-40"
          >
            {busy ? "signing…" : connected ? "lock" : "connect"}
          </button>
        </div>
        {msg && (
          <div
            className={`mt-2 rounded-md border p-2 text-[10px] ${
              msg.ok
                ? "border-[color:var(--green-dim)] bg-[color:var(--green)]/10 text-[color:var(--green)]"
                : "border-[color:var(--red)]/40 bg-[color:var(--red)]/10 text-[color:var(--red)]"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-md border border-[color:var(--green-dim)]/30 bg-[color:var(--green)]/5 p-2.5 text-[10px] leading-relaxed text-[color:var(--muted)]">
        <span className="font-bold text-[color:var(--green)]">how:</span> your
        wallet signs a streamflow contract locking ${symbol || "TOKEN"} to
        yourself until the cliff. pumpr indexes your lock and pays SOL rewards
        every 30 minutes. streamflow takes 0.19% protocol fee. withdraw on
        streamflow after the cliff to end earning.
      </div>

      {connected && mine.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
            your locks
          </div>
          <div className="mt-2 space-y-1.5">
            {mine.map((d) => (
              <DepositRow key={d.stream_id} dep={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DepositRow({ dep }: { dep: Deposit }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const unlockSec = Math.floor(dep.unlocks_at / 1000);
  const ended = dep.ended_at !== null;
  const unlocked = ended || nowSec >= unlockSec;
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
          {ended
            ? "withdrawn"
            : unlocked
              ? "ready to withdraw"
              : `unlocks in ${fmtCountdown(unlockSec - nowSec)}`}
        </span>
        <span className="text-[color:var(--green)]">
          +{(Number(dep.claimed_sol || "0") / 1e9).toFixed(4)} ◎
        </span>
      </div>
    </div>
  );
}

function fmtBal(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
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
