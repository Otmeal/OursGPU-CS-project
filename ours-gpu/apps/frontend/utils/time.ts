export function toInputDate(date: Date): string {
  const pad = (v: number) => v.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function parseDateInputSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function secondsBetweenInputs(
  startInput: string | null | undefined,
  killInput: string | null | undefined,
): number {
  const startSeconds = parseDateInputSeconds(startInput)
  const killSeconds = parseDateInputSeconds(killInput)
  if (!startSeconds || !killSeconds || killSeconds <= startSeconds) return 0
  return killSeconds - startSeconds
}

export function formatDurationDisplay(durationSeconds: number): string {
  if (!durationSeconds) return '—'
  const hours = durationSeconds / 3600
  const minutes = Math.round((durationSeconds % 3600) / 60)
  if (hours >= 1) return `${hours.toFixed(2)} hours`
  return `${minutes} minutes`
}
