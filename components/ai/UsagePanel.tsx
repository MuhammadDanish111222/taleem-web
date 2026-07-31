import type { AskUsage } from "@/lib/api/ask";

export function formatPakistanReset(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Pakistan midnight";
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function UsagePanel({
  usage,
  loading = false,
}: {
  usage: AskUsage | null;
  loading?: boolean;
}) {
  if (loading && !usage) {
    return (
      <aside
        aria-label="Daily Ask usage"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-52 animate-pulse rounded bg-slate-100" />
      </aside>
    );
  }

  if (!usage) {
    return (
      <aside
        aria-label="Daily Ask usage"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"
      >
        Usage is temporarily unavailable. Quota protection still applies when
        you ask.
      </aside>
    );
  }

  const resetLabel = formatPakistanReset(usage.resetsAt);
  return (
    <aside
      aria-label="Daily Ask usage"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today&apos;s Single Ask usage
          </p>
          {usage.limit === null ? (
            <p className="mt-1 text-lg font-bold text-emerald-700">
              Premium access — no five-question limit
            </p>
          ) : (
            <p className="mt-1 text-2xl font-bold text-slate-950">
              {usage.remaining} of {usage.limit} remaining
            </p>
          )}
        </div>
        {usage.limit !== null && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {usage.used} used
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Resets at {resetLabel} (Pakistan time).
      </p>
    </aside>
  );
}
