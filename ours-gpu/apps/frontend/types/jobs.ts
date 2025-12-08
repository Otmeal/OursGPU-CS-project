export type JobStatus = 'REQUESTED' | 'SCHEDULED' | 'PROCESSING' | 'VERIFYING' | 'DONE' | 'FAILED'

export type JobRow = {
  id: string
  jobType: string
  status: JobStatus
  workerId?: string | null
  walletId?: string | null
  createdAt: string
}

export type JobChainInfo = {
  jobId?: string | number
  tokenDecimals?: number | null
  reward?: string
  stakedTokens?: string
  spentTokens?: string
  payoutToWorker?: string
  refundToRequester?: string
  feePerHour?: string
  actualExecutionSeconds?: string
  actualEndTime?: string
  paidFullStake?: boolean
}

export type VerificationType = 'BUILTIN_HASH' | 'USER_PROGRAM'

export type JobDetail = {
  id: string
  orgId: string
  jobType: string
  status: JobStatus
  objectKey: string
  outputObjectKey?: string | null
  metadata?: any
  priority: number
  workerId?: string | null
  walletId?: string | null
  entryCommand?: string | null
  verification: VerificationType
  verifierObjectKey?: string | null
  verifierCommand?: string | null
  createdAt: string
  updatedAt: string
  solution?: string
  metricsJson?: string
  outputGetUrl?: string
  chain?: JobChainInfo
}

export type WorkerRow = {
  id: string
  orgId: string
  concurrency: number
  running: number
  wallet?: string | null
  orgName?: string | null
}
