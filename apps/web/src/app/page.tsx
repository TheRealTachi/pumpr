import Link from "next/link";
import { StatsTicker } from "@/components/StatsTicker";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
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
          <h1 className="heavy heavy-split mx-auto max-w-4xl text-balance text-5xl leading-[0.95] sm:text-6xl md:text-7xl">
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

      <div className="border-y border-[color:var(--border)] bg-[color:var(--bg-2)]/50">
        <StatsTicker />
      </div>

      <TokenTable />

      <section className="mx-auto max-w-6xl px-6 py-20">
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
      </section>
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
    <div className="panel panel-hover p-6">
      <div className="mb-4 font-mono text-[11px] font-semibold tracking-widest text-[color:var(--green)]">
        {n}
      </div>
      <div className="text-base font-bold tracking-tight">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
        {body}
      </div>
    </div>
  );
}
