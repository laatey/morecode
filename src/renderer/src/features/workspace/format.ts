/** "2h ago" style label. */
export function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return d < 7 ? `${d}d` : `${Math.round(d / 7)}w`
}
