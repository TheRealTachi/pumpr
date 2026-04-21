import Link from "next/link";
import { StatsTicker } from "@/components/StatsTicker";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { LiveStats } from "@/components/LiveStats";
import { TokenTable } from "@/components/TokenTable";

export default function LandingPage() {
  return (
    <div>
      {/* HERO */}
      <section className="hero-bg grid-bg">
        <div className="hero-streak" />
        <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-20 text-center sm:pb-20 sm:pt-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--green-dim)]/40 bg-[color:var(--green)]/5 px-3 py-1 font-mono text-[10px] text-[color:var(--green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)] pulse-glow" />
            <span className="tracking-[0.28em]">
              PROOF OF BELIEF · LIVE ON MAINNET
            </span>
          </div>
          <h1 className="heavy heavy-split mx-auto max-w-3xl text-balance text-3xl leading-[0.95] sm:text-4xl md:text-5xl">
            <span className="tone-a">WHERE HOLDERS</span>{" "}
            <span className="tone-b">WIN</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-[color:var(--muted)] sm:mt-6 sm:text-lg">
            Every token launched on pumpr streams pump.fun creator fees back
            to stakers in SOL — every 15 minutes, forever.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/launch"
              className="glow rounded-lg border border-[color:var(--green)] bg-[color:var(--green)] px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-black transition hover:bg-[color:var(--green-soft)]"
            >
              Launch a token →
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-solid)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:border-[color:var(--green-dim)] hover:text-white"
            >
              How it works
            </Link>
          </div>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--muted)]">
            <HeroChip>pump.fun launches</HeroChip>
            <HeroChip>streamflow locks</HeroChip>
            <HeroChip>15-min payouts</HeroChip>
            <HeroChip>non-custodial</HeroChip>
          </div>
          <div className="mt-16 sm:mt-20">
            <FeaturedCarousel />
          </div>
        </div>
      </section>

      <LiveStats />

      <div className="divider-gradient bg-gradient-to-r from-transparent via-[color:var(--green)]/[0.03] to-transparent">
        <StatsTicker />
      </div>

      <TokenTable />

      {/* HOW IT WORKS IN 3 STEPS */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[color:var(--green)]/[0.03] to-transparent"
        />
        <div className="mb-10 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[color:var(--green)]">
            the loop
          </div>
          <h2 className="heavy mt-2 text-3xl sm:text-4xl">
            Launch. Lock.{" "}
            <span className="text-[color:var(--green)]">Earn.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[color:var(--muted)]">
            Three steps, one loop. Creators launch on pump.fun through pumpr,
            holders lock via Streamflow, and SOL rewards drop every 15 minutes.
          </p>
        </div>

        <div className="relative grid gap-4 sm:grid-cols-3">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-12 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[color:var(--green-dim)] to-transparent sm:block"
          />
          <StepCard
            n="01"
            title="Launch on pump.fun"
            body="Deposit 0.05 SOL into a fresh dev wallet. pumpr mints a vanity token (…prr) and posts it to pump.fun."
            icon={
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
                <path
                  d="M12 3v18M5 10l7-7 7 7"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <StepCard
            n="02"
            title="Lock via Streamflow"
            body="Holders connect their wallet and lock tokens for 1, 3, or 7 days. Non-custodial — pumpr never holds your tokens."
            icon={
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
                <rect
                  x="5"
                  y="11"
                  width="14"
                  height="9"
                  rx="2"
                  stroke="currentColor"
                />
                <path
                  d="M8 11V8a4 4 0 018 0v3"
                  stroke="currentColor"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
          <StepCard
            n="03"
            title="Earn SOL rewards"
            body="Every 15 minutes pumpr claims pump.fun creator fees and pays 90% pro-rata to active stakers, weighted by tier."
            icon={
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
                <circle cx="12" cy="12" r="8" stroke="currentColor" />
                <path
                  d="M8 12l3 3 5-5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
        </div>
      </section>

      {/* WHY PUMPR */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-8 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
            why pumpr
          </div>
          <h2 className="heavy mt-2 text-3xl sm:text-4xl">
            Built for <span className="text-[color:var(--green)]">holders</span>
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            n="01"
            title="Custody-free launch"
            body="A fresh dev wallet per launch. You never hold the key. 0.05 SOL and the token is live on pump.fun."
          />
          <FeatureCard
            n="02"
            title="Tier-weighted staking"
            body="Stake from 1 day up to 7 days. Longer stake = bigger reward multiplier (1× → 3×)."
          />
          <FeatureCard
            n="03"
            title="Community resilient"
            body="If the creator exits, staking keeps streaming fees to holders — the curve doesn't care."
          />
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/launch"
            className="glow inline-flex items-center gap-2 rounded-lg border border-[color:var(--green)] bg-[color:var(--green)] px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-black transition hover:bg-[color:var(--green-soft)]"
          >
            Launch your token
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function StepCard({
  n,
  title,
  body,
  icon,
}: {
  n: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-[color:var(--green-dim)]/40 bg-[color:var(--green)]/10 text-[color:var(--green)]">
          <span className="block h-6 w-6">{icon}</span>
        </div>
        <div className="font-mono text-[11px] font-bold tracking-[0.25em] text-[color:var(--muted)]">
          {n}
        </div>
      </div>
      <div className="text-lg font-bold tracking-tight">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
        {body}
      </div>
    </div>
  );
}

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-1 rounded-full bg-[color:var(--green)]/70" />
      {children}
    </span>
  );
}

function FeatureCard({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="panel panel-hover group relative overflow-hidden p-6">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "var(--green)" }}
      />
      <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-[color:var(--green-dim)]/30 bg-[color:var(--green)]/5 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em] text-[color:var(--green)]">
        {n}
      </div>
      <div className="text-base font-bold tracking-tight">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
        {body}
      </div>
    </div>
  );
}
