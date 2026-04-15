export function StakeBar({
  pct,
  slim,
  showLabel,
}: {
  pct: number;
  slim?: boolean;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className={`stake-bar ${slim ? "slim" : ""} flex-1`}>
        <div className="fill" style={{ width: `${clamped}%` }} />
      </div>
      {showLabel && (
        <span
          className="font-mono text-[10px] font-semibold text-[color:var(--green)]"
          style={{ minWidth: 36, textAlign: "right" }}
        >
          {clamped.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
