"use client";

import { useEffect, useRef, useState } from "react";
import { LAUNCHER_API, LAUNCH_DEPOSIT_SOL } from "@/lib/config";

interface LaunchResp {
  id: string;
  depositAddress: string;
  depositLamports: string;
  status: string;
}

export default function LaunchPage() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [showSocials, setShowSocials] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resp, setResp] = useState<LaunchResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) setFile(f);
  };

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("symbol", symbol);
      fd.append("description", description);
      if (twitter) fd.append("twitter", twitter);
      if (telegram) fd.append("telegram", telegram);
      if (website) fd.append("website", website);
      if (file) fd.append("image", file);

      const r = await fetch(`${LAUNCHER_API}/api/launches`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`launcher ${r.status}: ${t}`);
      }
      setResp(await r.json());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Breadcrumbs step={resp ? 2 : 1} />

      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        Launch a token
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        We mint a fresh dev wallet for you. Send{" "}
        <span className="text-[color:var(--green)]">
          {LAUNCH_DEPOSIT_SOL} SOL
        </span>{" "}
        to it and pumpr will launch on pump.fun and route creator fees into
        the token&apos;s Proof-of-Belief staking pool.
      </p>

      {!resp ? (
        <div className="mt-8 space-y-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-6">
          {/* Image dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg)] p-6 transition hover:border-[color:var(--green-dim)]"
            style={{ minHeight: 160 }}
          >
            {preview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={preview}
                alt="preview"
                className="h-32 w-32 rounded-lg object-cover"
              />
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full border border-[color:var(--green-dim)] bg-[color:var(--green)]/10 text-[color:var(--green)]">
                  ↑
                </div>
                <div className="text-sm">
                  Drop an image, or{" "}
                  <span className="text-[color:var(--green)]">browse</span>
                </div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  PNG · JPG · GIF · WEBP · up to 5MB
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="NAME"
              value={name}
              onChange={setName}
              placeholder="Believe In Something"
            />
            <Field
              label="TICKER"
              value={symbol}
              onChange={(v) => setSymbol(v.toUpperCase())}
              placeholder="BELIEF"
              maxLength={10}
            />
          </div>
          <Field
            label="DESCRIPTION"
            value={description}
            onChange={setDescription}
            placeholder="What is this token about? (optional)"
            multiline
          />

          {/* Social links (collapsible) */}
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)]/50">
            <button
              type="button"
              onClick={() => setShowSocials((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)] hover:text-white"
            >
              <span className="flex items-center gap-2">
                <span>socials</span>
                <span className="rounded bg-[color:var(--green)]/10 px-1.5 py-0.5 text-[9px] text-[color:var(--green)]">
                  optional
                </span>
              </span>
              <span className="font-mono">{showSocials ? "−" : "+"}</span>
            </button>
            {showSocials && (
              <div className="space-y-3 border-t border-[color:var(--border)] p-3">
                <SocialField
                  prefix="𝕏"
                  value={twitter}
                  onChange={setTwitter}
                  placeholder="x.com/your_handle"
                />
                <SocialField
                  prefix="✈"
                  value={telegram}
                  onChange={setTelegram}
                  placeholder="t.me/your_group"
                />
                <SocialField
                  prefix="◐"
                  value={website}
                  onChange={setWebsite}
                  placeholder="yoursite.com"
                />
              </div>
            )}
          </div>

          {err && (
            <div className="rounded-md border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-3 py-2 text-sm text-[color:var(--red)]">
              {err}
            </div>
          )}
          <button
            onClick={submit}
            disabled={busy || !name || !symbol}
            className="glow w-full rounded-lg border border-[color:var(--green)] bg-[color:var(--green)]/10 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--green)] transition hover:bg-[color:var(--green)]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "creating…" : "create deposit"}
          </button>
          <p className="text-center text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
            your dev wallet is custodied by pumpr · you never hold the key
          </p>
        </div>
      ) : (
        <DepositInstructions resp={resp} />
      )}
    </div>
  );
}

function SocialField(props: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] focus-within:border-[color:var(--green-dim)]">
      <span className="grid h-9 w-9 place-items-center border-r border-[color:var(--border)] text-sm text-[color:var(--muted)]">
        {props.prefix}
      </span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="flex-1 bg-transparent px-3 py-2 text-sm placeholder:text-[color:var(--muted)]/70 focus:outline-none"
      />
    </div>
  );
}

function Breadcrumbs({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[color:var(--muted)]">
      <span className={step >= 1 ? "text-[color:var(--green)]" : ""}>
        01 · details
      </span>
      <span>→</span>
      <span className={step >= 2 ? "text-[color:var(--green)]" : ""}>
        02 · fund
      </span>
      <span>→</span>
      <span>03 · live</span>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  const base =
    "w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2.5 text-sm placeholder:text-[color:var(--muted)]/70 focus:border-[color:var(--green-dim)] focus:outline-none focus:ring-2 focus:ring-[color:var(--green)]/20";
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
        {props.label}
      </div>
      {props.multiline ? (
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          rows={3}
          className={base}
        />
      ) : (
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          className={base}
        />
      )}
    </label>
  );
}

function DepositInstructions({ resp }: { resp: LaunchResp }) {
  const sol = Number(resp.depositLamports) / 1e9;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(resp.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="mt-8 space-y-5 rounded-2xl border border-[color:var(--green-dim)] bg-[color:var(--panel)] p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            send
          </div>
          <div className="mt-1 text-3xl font-bold text-[color:var(--green)]">
            {sol} SOL
          </div>
          <div className="text-xs text-[color:var(--muted)]">
            to this dedicated dev wallet
          </div>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-[color:var(--green-dim)] bg-[color:var(--green)]/10 text-[color:var(--green)]">
          ◎
        </div>
      </div>
      <button
        onClick={copy}
        className="group block w-full break-all rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] p-4 text-left font-mono text-sm text-[color:var(--green)] transition hover:border-[color:var(--green-dim)]"
      >
        {resp.depositAddress}
        <div className="mt-2 text-[10px] uppercase tracking-wider text-[color:var(--muted)] group-hover:text-[color:var(--green)]">
          {copied ? "copied ✓" : "tap to copy"}
        </div>
      </button>
      <LaunchStatus id={resp.id} />
    </div>
  );
}

function LaunchStatus({ id }: { id: string }) {
  const [status, setStatus] = useState<string>("awaiting_deposit");
  const [mint, setMint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`${LAUNCHER_API}/api/launches/${id}`);
        if (r.ok) {
          const j = await r.json();
          setStatus(j.status);
          setMint(j.mint);
          setError(j.error ?? null);
          if (j.status === "launched") return;
        }
      } catch {}
      setTimeout(tick, 4000);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const launchNow = async () => {
    setLaunching(true);
    try {
      const r = await fetch(`${LAUNCHER_API}/api/launches/${id}/launch`, {
        method: "POST",
      });
      if (!r.ok) {
        const t = await r.text();
        setError(`launch request failed: ${t}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  };

  const label: Record<string, string> = {
    awaiting_deposit: "waiting for deposit…",
    ready_to_launch: "deposit received",
    launching: "launching on pump.fun…",
    launched: "LIVE",
    failed: "failed",
  };

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            status === "launched" || status === "ready_to_launch"
              ? "bg-[color:var(--green)]"
              : status === "failed"
                ? "bg-[color:var(--red)]"
                : "animate-pulse bg-yellow-400"
          }`}
        />
        <span className="uppercase tracking-wider text-[color:var(--muted)]">
          status
        </span>
        <span className="ml-auto font-mono text-[color:var(--text)]">
          {label[status] ?? status}
        </span>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-[color:var(--red)]/30 bg-[color:var(--red)]/5 p-2 text-xs text-[color:var(--red)]">
          {error}
        </div>
      )}

      {status === "ready_to_launch" && (
        <button
          onClick={launchNow}
          disabled={launching}
          className="glow mt-3 block w-full rounded-lg bg-[color:var(--green)] px-4 py-3 text-center text-sm font-bold uppercase tracking-[0.25em] text-black transition hover:bg-[color:var(--green-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {launching ? "starting…" : "launch now →"}
        </button>
      )}

      {status === "launched" && mint && (
        <a
          href={`/token/${mint}`}
          className="mt-3 block rounded-lg bg-[color:var(--green)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wider text-black transition hover:bg-[color:var(--green-soft)]"
        >
          view token →
        </a>
      )}
    </div>
  );
}
