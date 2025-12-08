import { formatUnits } from 'viem'
import type { JobStatus } from '@/types/jobs'

export function formatTimestamp(ts?: string | null): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
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
