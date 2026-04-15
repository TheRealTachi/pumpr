import { StatsTicker } from "@/components/StatsTicker";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { TokenTable } from "@/components/TokenTable";

export default function LandingPage() {
  return (
    <div>
      {/* HERO — featured carousel with sweeping green backdrop */}
      <section className="hero-bg grid-bg">
        <video
          className="hero-video"
          src="/background.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="hero-video-overlay" />
        <div className="hero-streak thick" />
        <div className="hero-streak" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--green-dim)]/40 bg-[color:var(--green)]/5 px-3 py-1 font-mono text-[11px] text-[color:var(--green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)] pulse-glow" />
            <span className="tracking-[0.25em]">
              PUMPR V1 · PROOF OF BELIEF
            </span>
          </div>
          <h1 className="heavy heavy-split whitespace-nowrap text-4xl sm:text-5xl md:text-6xl">
            <span className="tone-a">WHERE HOLDERS</span>{" "}
            <span className="tone-b">WIN</span>
          </h1>
          <p className="heavy mx-auto mt-6 whitespace-nowrap text-[11px] text-[color:var(--muted)] sm:text-sm md:text-base">
            EVERY TOKEN LAUNCHED ON PUMPR STREAMS CREATOR FEES BACK TO STAKERS FOREVER
          </p>
          <div className="mt-16">
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
