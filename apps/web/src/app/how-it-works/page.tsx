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
      { id: "streamflow", label: "Locking via Streamflow" },
      { id: "tiers", label: "Lock tiers" },
      { id: "rewards", label: "Earning rewards" },
      { id: "unlock", label: "Unlock + withdraw" },
    ],
  },
  {
    group: "Trust",
    items: [
      { id: "custody", label: "Custody model" },
      { id: "why-streamflow", label: "Why Streamflow" },
      { id: "risks", label: "Known risks" },
    ],
  },
];

const FLAT = SIDEBAR.flatMap((g) => g.items);

export default function HowItWorksPage() {
  const [active, setActive] = useState("overview");

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
      setActive(FLAT[FLAT.length - 1].id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[240px_minmax(0,1fr)_200px]">
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

      <article className="doc-prose min-w-0">
        <header className="border-b border-[color:var(--border)] pb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
            docs · v2
          </div>
          <h1 className="heavy mt-2 text-4xl md:text-5xl">
            How <span className="text-[color:var(--green)]">pumpr</span>{" "}
            works
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[color:var(--muted)]">
            pumpr is a pump.fun launchpad with Proof-of-Belief staking. Every
            token launched streams creator fees back to its stakers — paid
            directly, every 15 minutes.
          </p>
        </header>

        <Section id="overview" title="Overview">
          <p>
            pumpr wraps pump.fun&apos;s bonding-curve launchpad with a
            non-custodial fee-sharing layer. Stakers lock their tokens on{" "}
            <strong>Streamflow</strong> — pumpr doesn&apos;t hold staked
            tokens, doesn&apos;t gate withdrawals, and can&apos;t move them.
            pumpr indexes the Streamflow program and pays each staker&apos;s
            wallet a pro-rata slice of pump.fun creator fees in SOL every
            15 minutes.
          </p>
          <Callout variant="info">
            <strong>tl;dr</strong> — launch a token, stakers lock on Streamflow
            from their own wallet, pumpr auto-pays SOL rewards every 15
            minutes. Tokens return at cliff via Streamflow.
          </Callout>
        </Section>

        <Section id="launching" title="Launching a token">
          <Ol>
            <li>Fill in name, ticker, image, and optional socials.</li>
            <li>
              pumpr generates a fresh Solana wallet per launch — the{" "}
              <Code>dev wallet</Code> — and shows you its address. You never
              see its private key; pumpr custodies it to sign pump.fun calls on
              your behalf.
            </li>
            <li>
              You send <strong>0.05 SOL</strong> to the dev wallet.
            </li>
            <li>
              pumpr detects the deposit, shows a <Code>LAUNCH NOW</Code>{" "}
              button, and on click signs the pump.fun create-token transaction.
              The dev wallet becomes the official creator so creator fees flow
              to it.
            </li>
            <li>
              Mint addresses end in <Code>…prr</Code> — pumpr grinds vanity
              keypairs ahead of time so every launch gets a branded mint
              instantly.
            </li>
          </Ol>
        </Section>

        <Section id="costs" title="Cost breakdown">
          <Table
            head={["Item", "Cost", "Paid by"]}
            rows={[
              ["pump.fun create-token tx", "~0.02 SOL", "dev wallet"],
              ["Priority + tx fees", "~0.001 SOL", "dev wallet"],
              ["Dev wallet gas reserve (for fee claims)", "~0.02 SOL", "dev wallet"],
              ["Total", "~0.04 SOL", "leaves ~0.01 SOL buffer"],
            ]}
          />
          <p>
            Stakers additionally pay Streamflow&apos;s{" "}
            <strong>0.19% protocol fee</strong> on the locked amount at
            creation time, plus normal Solana tx + rent costs. pumpr itself
            takes no fee on the lock — only on rewards (see below).
          </p>
        </Section>

        <Section id="streamflow" title="Locking via Streamflow">
          <p>
            Staking on pumpr is a Streamflow vesting contract where you are
            both the sender and the recipient. From the token page:
          </p>
          <Ol>
            <li>
              Connect your wallet (Phantom or Solflare) via the button in the
              top-right.
            </li>
            <li>
              Choose a tier (1d / 3d / 7d) and enter an amount — or tap the{" "}
              <Code>25% · 50% · 75% · MAX</Code> shortcuts which read your
              token balance.
            </li>
            <li>
              Click <Code>LOCK</Code>. Your wallet signs a Streamflow{" "}
              <em>token lock</em> contract with these params, set by pumpr:
            </li>
          </Ol>
          <Table
            head={["Param", "Value", "Why"]}
            rows={[
              ["recipient", "your own wallet", "self-lock — no one else can withdraw"],
              ["cliff", "start + tier duration", "full unlock at cliff, nothing drips"],
              ["cancelableBy*", "false", "immutable — no early exit"],
              ["transferableBy*", "false", "lock can't be transferred away"],
            ]}
          />
          <p>
            pumpr&apos;s indexer polls Streamflow for locks on your mint every
            30 seconds, classifies each by cliff duration, and adds it to the
            stakers list.
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
            Multipliers weight your slice of each reward distribution. Longer
            lock = bigger slice. Locks longer than 7 days also bucket into the
            7-day tier (we don&apos;t reject them).
          </p>
        </Section>

        <Section id="rewards" title="Earning rewards">
          <p>Every 15 minutes pumpr runs a distribution job for each token:</p>
          <Ol>
            <li>
              Calls <Code>collectCreatorFee</Code> via pumpportal so accumulated
              pump.fun fees land in the dev wallet.
            </li>
            <li>
              Computes each active lock&apos;s weight:{" "}
              <Code>amount × tier_mult × fraction_of_window_active</Code>
            </li>
            <li>
              Splits available SOL: <strong>90% to stakers</strong> pro-rata,{" "}
              <strong>10% to the protocol treasury</strong>.
            </li>
            <li>
              Sends SOL directly to each staker&apos;s wallet. No claiming, no
              signing, no extra fees on your side.
            </li>
          </Ol>
          <Callout variant="good">
            Rewards land in the wallet that created the lock, automatically,
            every 15 minutes. Check your <Code>+X.XXXX ◎</Code> in the stakers
            list on the token page.
          </Callout>
        </Section>

        <Section id="unlock" title="Unlock + withdraw">
          <p>
            When your cliff hits, Streamflow flips the lock to withdrawable.
            pumpr continues paying rewards as long as the lock contract is
            still open on-chain. Go to{" "}
            <a
              href="https://app.streamflow.finance"
              target="_blank"
              rel="noreferrer noopener"
              className="text-[color:var(--green)] underline"
            >
              app.streamflow.finance
            </a>{" "}
            with the same wallet to withdraw — your tokens land back in your
            wallet, and pumpr stops counting that lock toward reward weight.
          </p>
        </Section>

        <Section id="custody" title="Custody model">
          <p>
            pumpr custodies <strong>one</strong> key per launch: the{" "}
            <Code>dev wallet</Code>, needed to sign pump.fun create-token and{" "}
            <Code>collectCreatorFee</Code> on your behalf. It&apos;s encrypted
            at rest (AES-GCM) and decrypted only in the signing service.
          </p>
          <p>
            pumpr does <strong>not</strong> custody any staker funds. Locked
            tokens live inside a Streamflow PDA on-chain; only the staker can
            withdraw them, and only after cliff.
          </p>
        </Section>

        <Section id="why-streamflow" title="Why Streamflow">
          <p>
            Earlier versions of pumpr used custodial escrow wallets —
            stakers sent tokens to a pumpr-controlled address and we returned
            them after the lock. That required trusting pumpr with your tokens.
            Streamflow removes that trust:
          </p>
          <Ul>
            <li>Locks are on-chain PDAs; pumpr has no keys to them.</li>
            <li>
              The contract flags <Code>cancelableBySender</Code>,{" "}
              <Code>transferableBySender</Code> are both <Code>false</Code>, so
              even the staker can&apos;t pull tokens before cliff. This keeps
              tier multipliers honest.
            </li>
            <li>
              Withdrawals run through Streamflow&apos;s own app, not pumpr. If
              pumpr disappears, your tokens don&apos;t.
            </li>
          </Ul>
        </Section>

        <Section id="risks" title="Known risks">
          <Ul>
            <li>
              <strong>pump.fun dependency.</strong> Launches and fees all
              depend on pump.fun being operational and maintaining the current
              creator-fee model.
            </li>
            <li>
              <strong>Reward payout depends on pumpr.</strong> The actual SOL
              distribution tick is run by pumpr. Streamflow locks survive
              independently, but if pumpr is offline, rewards pause.
            </li>
            <li>
              <strong>Dev wallet custody.</strong> pumpr holds the creator
              keypair; if compromised, creator fees could be redirected.
            </li>
            <li>
              <strong>Streamflow protocol fee.</strong> 0.19% of the locked
              amount is deducted by Streamflow at lock creation.
            </li>
          </Ul>
        </Section>

        <footer className="mt-14 flex items-center justify-between border-t border-[color:var(--border)] pt-6 text-xs text-[color:var(--muted)]">
          <span>pumpr v2 docs</span>
          <Link
            href="/launch"
            className="font-semibold uppercase tracking-widest text-[color:var(--green)] hover:underline"
          >
            launch token →
          </Link>
        </footer>
      </article>

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
