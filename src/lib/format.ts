// Shared duration formatting ("45s", "3m 26s", "1h 2m").
// Centralized: ChatArea and ProcessView previously each defined an identical
// copy. Import from here instead of duplicating.
export function fmtDur(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(1, s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
