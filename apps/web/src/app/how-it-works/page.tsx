"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SIDEBAR: {
  group: string;
  items: { id: string; label: string }[];
}[] = [
  {
    group: "Getting started",
    items: [
      { id: "overview", label: "Overview" },
      { id: "launching", label: "Launching a token" },
      { id: "costs", label: "Cost breakdown" },
    ],
  },
  {
    group: "Staking",
    items: [
      { id: "send-to-stake", label: "Send to stake" },
      { id: "tiers", label: "Lock tiers" },
      { id: "rewards", label: "Earning rewards" },
      { id: "unstake", label: "Auto-unlock" },
    ],
  },
  {
    group: "Trust",
    items: [
      { id: "custody", label: "Custody model" },
      { id: "why-send", label: "Why send-to-stake" },
      { id: "risks", label: "Known risks" },
    ],
  },
];

const FLAT = SIDEBAR.flatMap((g) => g.items);

export default function HowItWorksPage() {
  const [active, setActive] = useState("overview");

  // Scroll-spy: update active anchor as user scrolls
  useEffect(() => {
    const onScroll = () => {
      const threshold = 140;
      for (const s of FLAT) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top >= threshold) {
          setActive(s.id);
          return;
        }
      }
      // past last
      setActive(FLAT[FLAT.length - 1].id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[240px_minmax(0,1fr)_200px]">
      {/* LEFT SIDEBAR */}
      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] self-start overflow-y-auto pr-2 text-sm lg:block">
        <div className="mb-6 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[color:var(--muted)]">
          pumpr docs
        </div>
        {SIDEBAR.map((g) => (
          <div key={g.group} className="mb-6">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[color:var(--muted)]">
              {g.group}
            </div>
            <ul className="space-y-1">
              {g.items.map((it) => {
                const on = active === it.id;
                return (
                  <li key={it.id}>
                    <a
                      href={`#${it.id}`}
                      className={`block rounded-md border-l-2 px-3 py-1.5 text-[13px] transition ${
                        on
                          ? "border-[color:var(--green)] bg-[color:var(--green)]/5 text-[color:var(--green)]"
                          : "border-transparent text-[color:var(--muted)] hover:border-[color:var(--green-dim)]/40 hover:text-white"
                      }`}
                    >
                      {it.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>

      {/* MAIN CONTENT */}
      <article className="doc-prose min-w-0">
        <header className="border-b border-[color:var(--border)] pb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
            docs · v1
          </div>
          <h1 className="heavy mt-2 text-4xl md:text-5xl">
            How <span className="text-[color:var(--green)]">pumpr</span>{" "}
            works
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[color:var(--muted)]">
            pumpr is a pump.fun launchpad with Proof-of-Belief staking. Every
            token launched streams creator fees back to its holders — forever.
          </p>
        </header>

        <Section id="overview" title="Overview">
          <p>
            pumpr wraps pump.fun&apos;s bonding-curve launchpad with a
            send-to-stake fee-sharing layer. When someone creates a token on
            pumpr, pumpr takes custody of the token&apos;s creator wallet so
            that every SOL of creator fee earned on pump.fun can be routed back
            to the people holding and staking the token, proportional to how
            long they commit.
          </p>
          <Callout variant="info">
            <strong>tl;dr</strong> — launch a token, holders stake by sending,
            pumpr auto-returns tokens after the lock, and splits pump.fun
            creator fees pro-rata every hour.
          </Callout>
        </Section>

        <Section id="launching" title="Launching a token">
          <Ol>
            <li>Fill in name, ticker, image, and optional socials.</li>
            <li>
              pumpr generates a fresh Solana wallet per launch — the{" "}
              <Code>dev wallet</Code> — and shows you its address. You never
              see its private key; pumpr custodies it.
            </li>
            <li>
              You send <strong>0.05 SOL</strong> to the dev wallet.
            </li>
            <li>
              pumpr detects the deposit, shows you a{" "}
              <Code>LAUNCH NOW</Code> button, and on click signs the pump.fun
              create-token transaction from the dev wallet. The dev wallet
              becomes the official creator, so pump.fun creator fees flow to
              it.
            </li>
            <li>
              pumpr then generates three per-token staking wallets (1-day,
              3-day, 7-day) and creates their SPL token accounts so users can
              send directly.
            </li>
          </Ol>
        </Section>

        <Section id="costs" title="Cost breakdown">
          <Table
            head={["Item", "Cost", "Paid by"]}
            rows={[
              ["pump.fun create-token tx", "~0.02 SOL", "dev wallet"],
              ["3 × staking ATA creation (rent)", "~0.006 SOL", "dev wallet"],
              ["Escrow SOL reserve for unlock fees", "~0.003 SOL", "dev wallet"],
              ["Priority + tx fees", "~0.001 SOL", "dev wallet"],
              ["Total", "~0.03 SOL", "leaves ~0.02 SOL buffer"],
            ]}
          />
        </Section>

        <Section id="send-to-stake" title="Send to stake">
          <p>
            There is no <em>connect wallet</em> step for staking. To stake,
            send the token to one of three staking addresses shown on the
            token page — from any wallet (Phantom, Solflare, Ledger, or even
            an exchange withdrawal).
          </p>
          <p>
            pumpr indexes the incoming transfer, credits your{" "}
            <em>sender address</em> as a staker, and starts a timer matching
            the tier you sent to.
          </p>
        </Section>

        <Section id="tiers" title="Lock tiers">
          <Table
            head={["Tier", "Lock", "Multiplier", "Purpose"]}
            rows={[
              ["1-day", "24h", "1.00×", "baseline"],
              ["3-day", "72h", "1.75×", "boosted"],
              ["7-day", "168h", "3.00×", "max belief"],
            ]}
          />
          <p>
            Multipliers weight your share of rewards. Longer stake = bigger
            slice of the fee pool each hour you&apos;re active.
          </p>
        </Section>

        <Section id="rewards" title="Earning rewards">
          <p>Every hour pumpr runs a distribution job for each token:</p>
          <Ol>
            <li>
              Calls <Code>collectCreatorFee</Code> via pumpportal so any
              accumulated pump.fun fees arrive in the dev wallet.
            </li>
            <li>
              Computes each active deposit&apos;s weight:{" "}
              <Code>amount × tier_mult × fraction_of_hour_active</Code>
            </li>
            <li>
              Splits available SOL: <strong>90% to stakers</strong> pro-rata,{" "}
              <strong>10% to the protocol treasury</strong>.
            </li>
            <li>
              Sends SOL directly to each staker&apos;s sender address. No
              claiming, no signing, no extra fees on your side.
            </li>
          </Ol>
          <Callout variant="good">
            Your only action is staking. Rewards arrive automatically to the
            same wallet you sent from.
          </Callout>
        </Section>

        <Section id="unstake" title="Auto-unlock">
          <p>
            When your lock period elapses, a worker sweeps eligible deposits
            and transfers the tokens back to the original sender address.
            There&apos;s no button to press — it happens within a minute of
            the unlock time.
          </p>
          <p>
            During the lock your tokens are held by the staking wallet and
            cannot be moved by you. During the lock you continue to earn
            rewards every hour at your tier multiplier.
          </p>
        </Section>

        <Section id="custody" title="Custody model">
          <p>pumpr custodies two kinds of keys per launch:</p>
          <Ol>
            <li>
              The <strong>dev wallet</strong> — needed to sign pump.fun
              create-token and later{" "}
              <Code>collectCreatorFee</Code> calls on your behalf.
            </li>
            <li>
              The <strong>3 staking wallets</strong> — needed to transfer
              tokens back to senders when their locks expire.
            </li>
          </Ol>
          <p>
            Keys are encrypted at rest (AES-GCM) and only ever decrypted
            in-memory inside the signing service. No user assets other than
            staked tokens (and only during their own lock) are touched.
          </p>
        </Section>

        <Section id="why-send" title="Why send-to-stake">
          <p>
            Most Solana dapps require a wallet extension and an on-chain
            signature for every action. pumpr stakes by <em>transfer</em>{" "}
            instead, so:
          </p>
          <Ul>
            <li>No wallet popups, no &quot;connect&quot; prompt.</li>
            <li>Works from any wallet (including CEX withdrawals).</li>
            <li>
              Rewards arrive back at the same wallet you sent from — same
              operational flow as a Solana transfer.
            </li>
          </Ul>
          <p>
            The cost of this UX is that pumpr holds the staking wallets
            temporarily — a model closer to a custodial staking pool than a
            fully trustless escrow. We&apos;re explicit about this.
          </p>
        </Section>

        <Section id="risks" title="Known risks">
          <Ul>
            <li>
              <strong>Custodial staking wallets.</strong> If pumpr is
              compromised, staked tokens are at risk.
            </li>
            <li>
              <strong>pump.fun dependency.</strong> pumpr launches and fees
              all depend on pump.fun being operational and maintaining the
              current creator-fee model.
            </li>
            <li>
              <strong>RPC dependency.</strong> Holders + bonding curve data
              require a reliable Solana RPC. Public endpoints rate-limit
              aggressively.
            </li>
          </Ul>
        </Section>

        <footer className="mt-14 flex items-center justify-between border-t border-[color:var(--border)] pt-6 text-xs text-[color:var(--muted)]">
          <span>pumpr v1 docs</span>
          <Link
            href="/launch"
            className="font-semibold uppercase tracking-widest text-[color:var(--green)] hover:underline"
          >
            launch token →
          </Link>
        </footer>
      </article>

      {/* RIGHT "ON THIS PAGE" */}
      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] self-start overflow-y-auto pl-2 text-xs xl:block">
        <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[color:var(--muted)]">
          on this page
        </div>
        <ul className="space-y-1.5 border-l border-[color:var(--border)] pl-3">
          {FLAT.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`block truncate transition ${
                    on
                      ? "text-[color:var(--green)]"
                      : "text-[color:var(--muted)] hover:text-white"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-[color:var(--border)]/60 py-10">
      <h2 className="group flex items-baseline gap-2 text-2xl font-bold tracking-tight">
        <a
          href={`#${id}`}
          className="text-[color:var(--muted)] opacity-0 transition group-hover:opacity-100"
          aria-label={`Link to ${title}`}
        >
          #
        </a>
        <span>{title}</span>
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-[color:var(--text)]/90">
        {children}
      </div>
    </section>
  );
}

function Callout({
  variant,
  children,
}: {
  variant: "info" | "good" | "warn";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-[color:var(--border)] bg-[color:var(--panel-solid)]",
    good: "border-[color:var(--green-dim)]/40 bg-[color:var(--green)]/5",
    warn: "border-[color:var(--red)]/30 bg-[color:var(--red)]/5",
  }[variant];
  return (
    <div className={`rounded-lg border ${styles} px-4 py-3 text-sm`}>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[color:var(--panel-solid)] px-1.5 py-0.5 font-mono text-[13px] text-[color:var(--green)]">
      {children}
    </code>
  );
}

function Ol({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 marker:text-[color:var(--muted)]">
      {children}
    </ol>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-[color:var(--muted)]">
      {children}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--panel-solid)]">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-[color:var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-b border-[color:var(--border)]/60 last:border-b-0"
            >
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 text-[13px]">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
