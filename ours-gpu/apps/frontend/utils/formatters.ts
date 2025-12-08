import { formatUnits } from 'viem'
import type { JobStatus } from '@/types/jobs'

export function formatTimestamp(ts?: string | number | Date | null): string {
  if (ts === null || ts === undefined) return '—'
  try {
    const date =
      ts instanceof Date
        ? ts
        : typeof ts === 'number'
          ? new Date(ts < 1e12 ? ts * 1000 : ts)
          : new Date(ts)
    return Number.isNaN(date.getTime()) ? String(ts) : date.toLocaleString()
  } catch {
    return String(ts)
  }
}

export function formatDuration(seconds?: number | string | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const value = Number(seconds)
  if (!Number.isFinite(value)) return '—'
  const totalSeconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const parts = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  parts.push(`${secs}s`)
  return parts.join(' ')
}

export function statusColor(status?: JobStatus): string {
  switch (status) {
    case 'DONE': return 'green'
    case 'FAILED': return 'red'
    case 'PROCESSING': return 'blue'
    case 'VERIFYING': return 'purple'
    case 'SCHEDULED': return 'orange'
    default: return 'grey'
  }
}

export function formatTokenAmount(
  raw: string | number | bigint | null | undefined,
  decimals: number = 18,
): string {
  if (raw === null || raw === undefined) return '—'
  try {
    const value = typeof raw === 'bigint' ? raw : BigInt(raw)
    const units = formatUnits(value, decimals)
    const numeric = Number(units)
    return Number.isFinite(numeric) ? numeric.toFixed(4) : units
  } catch {
    return String(raw)
  }
}
