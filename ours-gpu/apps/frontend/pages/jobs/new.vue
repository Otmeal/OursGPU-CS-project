<template>
  <div class="pa-4">
    <h1 class="text-h5 mb-4">Create Job</h1>

    <JobsCreatePayloadCard
      :payload-file="payloadFile"
      :object-key="objectKey"
      :uploading="uploading"
      :creating="creating"
      :uploaded-payload="uploadedPayload"
      @update:payloadFile="payloadFile = $event"
      @update:objectKey="objectKey = $event"
      @upload="uploadPayload"
    />

    <JobsCreateDetailsCard
      :user-org-name-display="userOrgNameDisplay"
      :job-type="jobType"
      :verification="verification"
      :verification-items="verificationItems"
      :priority="priority"
      :entry-command="entryCommand"
      :quoted-reward-display="quotedRewardDisplay"
      :metadata-json="metadataJson"
      :metadata-error="metadataError"
      :verifier-file="verifierFile"
      :verifier-object-key="verifierObjectKey"
      :verifier-command="verifierCommand"
      :uploaded-verifier="uploadedVerifier"
      :uploading-verifier="uploadingVerifier"
      :creating="creating"
      @update:jobType="jobType = $event"
      @update:verification="verification = $event"
      @update:priority="priority = $event"
      @update:entryCommand="entryCommand = $event"
      @update:metadataJson="metadataJson = $event"
      @update:verifierFile="verifierFile = $event"
      @update:verifierObjectKey="verifierObjectKey = $event"
      @update:verifierCommand="verifierCommand = $event"
      @upload-verifier="uploadVerifier"
    />

    <JobsCreateScheduleCard
      :start-at-input="startAtInput"
      :kill-at-input="killAtInput"
      :creating="creating"
      :duration-display="durationDisplay"
      @update:startAtInput="startAtInput = $event"
      @update:killAtInput="killAtInput = $event"
    />

    <JobsCreatePricingCard
      :fee-per-hour-display="feePerHourDisplay"
      :quoted-reward-display="quotedRewardDisplay"
      :distance-display="distanceDisplay"
      :base-rate-display="baseRateDisplay"
      :per-level-markup-display="perLevelMarkupDisplay"
    />

    <JobsCreateDispatchCard
      :worker-items="workerItems"
      :selected-worker-id="selectedWorkerId"
      :workers-loading="workersLoading"
      :creating="creating"
      :object-key="objectKey"
      :uploaded-payload="uploadedPayload"
      :wallet-ready-for-jobs="walletReadyForJobs"
      :wallet-address="walletAddress"
      :registration-checked="registrationChecked"
      :wallet-registered="walletRegistered"
      :created-job-id="createdJobId"
      :created-job-link="createdJobLink"
      :jobs-list-link="jobsListLink"
      @update:selectedWorkerId="selectedWorkerId = $event"
      @create="createJob"
    />
  </div>
  
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { createPublicClient, createWalletClient, custom, decodeEventLog } from 'viem'
import { foundry } from 'viem/chains'
import { JobManagerAbi } from '@ours-gpu/shared/contracts/jobManager'
import { OrgRegistryAbi } from '@ours-gpu/shared/contracts/orgRegistry'
import JobsCreatePayloadCard from '@/components/jobs/CreatePayloadCard.vue'
import JobsCreateDetailsCard from '@/components/jobs/CreateDetailsCard.vue'
import JobsCreateScheduleCard from '@/components/jobs/CreateScheduleCard.vue'
import JobsCreatePricingCard from '@/components/jobs/CreatePricingCard.vue'
import JobsCreateDispatchCard from '@/components/jobs/CreateDispatchCard.vue'
import type { WorkerRow, VerificationType } from '@/types/jobs'
import { useWalletStore } from '@/stores/wallet'
import { orgTupleToObject } from '@/utils/orgRegistry'
import { formatTokenAmount } from '@/utils/formatters'
import {
  addMinutes,
  toInputDate,
  parseDateInputSeconds,
  secondsBetweenInputs,
  formatDurationDisplay,
} from '@/utils/time'

type OffchainJobBase = {
  orgId: string
  jobType: string
  objectKey: string
  entryCommand?: string
  verification: VerificationType
  priority: number
  metadata?: any
  verifierObjectKey?: string
  verifierCommand?: string
  startAt: number
  killAt: number
}

type OffchainJobCreate = OffchainJobBase & {
  workerId: string
  wallet: string
}

const runtimeConfig = useRuntimeConfig()
const apiBase = (runtimeConfig.public.apiBase || '/api').replace(/\/$/, '')
const s3ProxyBase = (runtimeConfig.public.s3ProxyBase || '/s3').replace(/\/$/, '')
const router = useRouter()

// Form state
const orgId = ref('org-1')
const jobType = ref('hash_mining')
const verification = ref<VerificationType>('BUILTIN_HASH')
const priority = ref<number>(0)
const metadataJson = ref('')
const metadataError = ref('')
const startAtInput = ref(toInputDate(addMinutes(new Date(), 3)))
const killAtInput = ref(toInputDate(addMinutes(new Date(), 8)))
const feePerHour = ref<bigint | null>(null)
const distance = ref<bigint | null>(null)
const baseRate = ref<bigint | null>(null)
const perLevelMarkup = ref<bigint | null>(null)
const quotedReward = ref<bigint | null>(null)
const quotedRewardDecimals = ref<number>(18)
const quotedRewardDisplay = computed(() => {
  if (quotedReward.value == null) return '—'
  return formatTokenAmount(quotedReward.value, quotedRewardDecimals.value)
})
const feePerHourDisplay = computed(() => {
  if (feePerHour.value == null) return '—'
  return `${formatTokenAmount(feePerHour.value, quotedRewardDecimals.value)} / hr`
})
const baseRateDisplay = computed(() => {
  if (baseRate.value == null) return '—'
  try { return (Number(baseRate.value) / 10000).toFixed(4) } catch { return baseRate.value.toString() }
})
const perLevelMarkupDisplay = computed(() => {
  if (perLevelMarkup.value == null) return '—'
  try { return (Number(perLevelMarkup.value) / 10000).toFixed(4) } catch { return perLevelMarkup.value.toString() }
})
const distanceDisplay = computed(() => distance.value != null ? distance.value.toString() : '—')
const durationSeconds = computed(() => secondsBetweenInputs(startAtInput.value, killAtInput.value))
const durationDisplay = computed(() => formatDurationDisplay(durationSeconds.value))

const entryCommand = ref('node "$PAYLOAD_PATH"')

// Payload upload
const payloadFile = ref<File | null>(null)
const objectKey = ref(`programs/hash-miner-${Date.now()}.js`)
const uploading = ref(false)
const uploadedPayload = ref<string | null>(null)

// Verifier upload (optional)
const verifierFile = ref<File | null>(null)
const verifierObjectKey = ref(`verifiers/hash-verifier-${Date.now()}.js`)
const verifierCommand = ref('')
const uploadingVerifier = ref(false)
const uploadedVerifier = ref<string | null>(null)

// Workers
const workers = ref<WorkerRow[]>([])
const workersLoading = ref(false)
const selectedWorkerId = ref<string | null>(null)

// Result
const creating = ref(false)
const createdJobId = ref<string | null>(null)
const jobsListLink = '/jobs'
const createdJobLink = computed(() => createdJobId.value ? `/jobs/${encodeURIComponent(createdJobId.value)}` : null)

// Wallet (required to create jobs)
const wallet = useWalletStore()
const {
  address: walletAddress,
  userOrgId: storeUserOrgId,
  userOrgName,
  walletRegistered,
  registrationChecked,
} = storeToRefs(wallet)
const walletReadyForJobs = computed(() => !!walletAddress.value && walletRegistered.value)

const verificationItems: { title: string, value: VerificationType }[] = [
  { title: 'Built-in Hash', value: 'BUILTIN_HASH' },
  { title: 'User Program', value: 'USER_PROGRAM' },
]

const workerItems = computed(() => workers.value.map(w => ({
  title: `${w.id} (org=${w.orgName ?? (isNumeric(w.orgId) ? `#${w.orgId}` : w.orgId)}, running=${w.running}/${w.concurrency}) ${w.wallet ? '— ' + w.wallet : ''}`,
  value: w.id,
})))

function isNumeric(v: string | number) {
  return /^\d+$/.test(String(v))
}

const userOrgNameDisplay = computed(() => userOrgName.value || '—')

async function fetchQuote(workerWallet: string) {
  try {
    if (!walletAddress.value) { quotedReward.value = null; return }
    const startSeconds = parseDateInputSeconds(startAtInput.value)
    const killSeconds = parseDateInputSeconds(killAtInput.value)
    if (!startSeconds || !killSeconds || killSeconds <= startSeconds) {
      quotedReward.value = null
      feePerHour.value = null
      return
    }
    const provider = (window as any).ethereum
    if (!provider) { quotedReward.value = null; return }
    const jmAddress = runtimeConfig.public.jobManagerAddress as `0x${string}`
    if (!jmAddress) { throw new Error('Missing JobManager address in config') }

    const publicClient = createPublicClient({ chain: foundry, transport: custom(provider) })
    const orgRegistry = await publicClient.readContract({
      address: jmAddress,
      abi: JobManagerAbi,
      functionName: 'orgRegistry',
    }) as `0x${string}`
    const tokenAddress = await publicClient.readContract({
      address: jmAddress,
      abi: JobManagerAbi,
      functionName: 'token',
    }) as `0x${string}`

    const [userOrg, workerOrg] = await Promise.all([
      publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'userOrganizations', args: [walletAddress.value as `0x${string}`] }) as Promise<bigint>,
      publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'nodeOrganizations', args: [workerWallet as `0x${string}`] }) as Promise<bigint>,
    ])

    orgId.value = userOrg.toString()

    try {
      const [userOrgInfo, workerOrgInfo] = await Promise.all([
        publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'organizations', args: [userOrg] }) as Promise<any>,
        publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'organizations', args: [workerOrg] }) as Promise<any>,
      ])

      const normalizedUserOrg = orgTupleToObject(userOrgInfo)
      const normalizedWorkerOrg = orgTupleToObject(workerOrgInfo)
      userOrgName.value = normalizedUserOrg?.name ?? null
      baseRate.value = normalizedWorkerOrg?.baseRate ?? null
      perLevelMarkup.value = normalizedWorkerOrg?.perLevelMarkup ?? null
      const w = workers.value.find(w => w.id === selectedWorkerId.value)
      if (w) w.orgName = normalizedWorkerOrg?.name ?? w.orgName ?? null
    } catch {}
    const fee = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'calculateFee',
      args: [userOrg, workerOrg],
    }) as bigint
    feePerHour.value = fee
    const dist = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'getDistanceToLCA',
      args: [workerOrg, userOrg],
    }) as bigint
    distance.value = dist
    const duration = BigInt(killSeconds - startSeconds)
    quotedReward.value = duration === 0n ? 0n : ((fee * duration + 3599n) / 3600n)
    const erc20Abi = [
      { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8', name: '' }] },
    ] as const
    const d = await publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }) as number
    quotedRewardDecimals.value = Number(d) || 18
  } catch (e) {
    quotedReward.value = null
    feePerHour.value = null
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${apiBase}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  const trimmed = text.trim()
  if (!res.ok) {
    const snippet = trimmed.slice(0, 200)
    throw new Error(snippet ? `POST ${path} failed (${res.status}): ${snippet}` : `POST ${path} failed: ${res.status}`)
  }
  if (!trimmed) {
    throw new Error('Empty response from API')
  }
  try {
    return JSON.parse(trimmed) as T
  } catch (err: any) {
    const snippet = trimmed.slice(0, 200)
    throw new Error(snippet ? `Non-JSON response from API: ${snippet}` : err?.message || 'Invalid JSON response')
  }
}

async function fetchWorkers() {
  workersLoading.value = true
  try {
    const res = await fetch(`${apiBase}/workers`)
    if (res.ok) {
      workers.value = await res.json()
    }
  } finally {
    workersLoading.value = false
  }
}

function toS3Proxy(url: string) {
  if (!s3ProxyBase) return url
  const u = new URL(url)
  return `${s3ProxyBase}${u.pathname}${u.search}`
}
async function uploadToPresigned(url: string, file: File) {
  const proxyUrl = toS3Proxy(url)
  const res = await fetch(proxyUrl, {
    method: 'PUT',
    body: file,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload failed (${res.status}): ${text}`)
  }
}

async function uploadPayload() {
  if (!payloadFile.value || !objectKey.value) return
  uploading.value = true
  createdJobId.value = null
  try {
    const presign = await apiPost<{ url: string, objectKey: string }>(`/jobs/presign`, { objectKey: objectKey.value })
    await uploadToPresigned(presign.url, payloadFile.value)
    uploadedPayload.value = presign.objectKey
    objectKey.value = presign.objectKey
  } catch (e: any) {
    alert(`Payload upload error: ${e?.message || e}`)
  } finally {
    uploading.value = false
  }
}

async function uploadVerifier() {
  if (!verifierFile.value || !verifierObjectKey.value) return
  uploadingVerifier.value = true
  try {
    const presign = await apiPost<{ url: string, objectKey: string }>(`/jobs/presign`, { objectKey: verifierObjectKey.value })
    await uploadToPresigned(presign.url, verifierFile.value)
    uploadedVerifier.value = presign.objectKey
    verifierObjectKey.value = presign.objectKey
  } catch (e: any) {
    alert(`Verifier upload error: ${e?.message || e}`)
  } finally {
    uploadingVerifier.value = false
  }
}

function parseMetadata(): any | undefined {
  const raw = metadataJson.value.trim()
  if (!raw) return undefined
  try {
    const v = JSON.parse(raw)
    metadataError.value = ''
    return v
  } catch (e: any) {
    metadataError.value = 'Invalid JSON'
    return undefined
  }
}

function toBigIntSafe(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(v)
  if (typeof v === 'string' && v.trim()) {
    try { return BigInt(v.trim()) } catch { return null }
  }
  return null
}

async function createJob() {
  if (!walletReadyForJobs.value) {
    alert('Please register your wallet (name + email) before creating a job.')
    return
  }
  creating.value = true
  createdJobId.value = null
  try {
    const startSeconds = parseDateInputSeconds(startAtInput.value)
    const killSeconds = parseDateInputSeconds(killAtInput.value)
    if (!startSeconds || !killSeconds || killSeconds <= startSeconds) {
      alert('Please provide a valid start and kill time')
      return
    }
    const basePayload: OffchainJobBase = {
      orgId: orgId.value,
      jobType: jobType.value,
      objectKey: uploadedPayload.value!,
      entryCommand: entryCommand.value || undefined,
      verification: verification.value,
      priority: priority.value ?? 0,
      metadata: parseMetadata(),
      startAt: startSeconds,
      killAt: killSeconds,
      ...(verification.value === 'USER_PROGRAM' && uploadedVerifier.value
        ? { verifierObjectKey: uploadedVerifier.value, verifierCommand: verifierCommand.value || undefined }
        : {}),
    }

    if (!selectedWorkerId.value) {
      alert('Please choose a worker.')
      return
    }
    const workerId = selectedWorkerId.value

    const worker = workers.value.find(w => w.id === selectedWorkerId.value)
    const workerWallet = worker?.wallet
    if (!workerWallet) {
      alert('Selected worker has no wallet address registered yet. Please re-register worker.')
      return
    }
    await fetchQuote(workerWallet)
    if (!quotedReward.value || quotedReward.value <= 0n) {
      alert('Failed to get reward quote')
      return
    }

    const jmAddress = runtimeConfig.public.jobManagerAddress
    if (!jmAddress) {
      alert('Missing JobManager address in config')
      return
    }
    const provider = (window as any).ethereum
    const publicClient = createPublicClient({ chain: foundry, transport: custom(provider) })
    const walletClient = createWalletClient({ chain: foundry, transport: custom(provider), account: walletAddress.value as `0x${string}` })
    const tokenAddress = await publicClient.readContract({
      address: jmAddress as `0x${string}`,
      abi: JobManagerAbi,
      functionName: 'token',
    }) as `0x${string}`
    const tokenAbi = [
      { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
      { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
      { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }
    ] as const
    const signResp = await apiPost<any>(`/jobs/sign-create`, {
      requester: walletAddress.value,
      target: '0x' + '0'.repeat(64),
      difficulty: 0,
      worker: workerWallet,
      startAt: startSeconds,
      killAt: killSeconds,
    })
    const controllerReward = toBigIntSafe(signResp?.params?.reward) ?? toBigIntSafe(signResp?.quote?.reward)
    if (controllerReward != null && controllerReward > 0n) {
      quotedReward.value = controllerReward
    }
    const controllerDecimals = Number(signResp?.quote?.tokenDecimals)
    if (Number.isFinite(controllerDecimals)) {
      quotedRewardDecimals.value = controllerDecimals
    }
    const rewardUnits = quotedReward.value as bigint
    const jobParams = {
      ...signResp.params,
      reward: rewardUnits,
      orgId: toBigIntSafe(signResp?.params?.orgId) ?? signResp?.params?.orgId,
      difficulty: toBigIntSafe(signResp?.params?.difficulty) ?? signResp?.params?.difficulty,
      nonce: toBigIntSafe(signResp?.params?.nonce) ?? signResp?.params?.nonce,
      deadline: toBigIntSafe(signResp?.params?.deadline) ?? signResp?.params?.deadline,
      startTime: toBigIntSafe(signResp?.params?.startTime) ?? BigInt(startSeconds),
      killTime: toBigIntSafe(signResp?.params?.killTime) ?? BigInt(killSeconds),
    }

    const currentAllowance = (await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: tokenAbi,
      functionName: 'allowance',
      args: [walletAddress.value as `0x${string}`, jmAddress as `0x${string}`],
    })) as bigint
    if (currentAllowance !== rewardUnits) {
      const approveHash = await walletClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: tokenAbi,
        functionName: 'approve',
        args: [jmAddress as `0x${string}`, rewardUnits],
        chain: foundry,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash as `0x${string}` })
    }

    const permit = { value: 0n, deadline: 0n, v: 0, r: ('0x' + '0'.repeat(64)) as `0x${string}`, s: ('0x' + '0'.repeat(64)) as `0x${string}` }
    const txHash = await walletClient.writeContract({
      address: jmAddress as `0x${string}`,
      abi: JobManagerAbi,
      functionName: 'createJobWithControllerSig',
      args: [jobParams as any, signResp.signature as `0x${string}`, permit],
      chain: foundry,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })
    let chainJobId: string | null = null
    try {
      for (const log of receipt.logs ?? []) {
        try {
          const ev = decodeEventLog({
            abi: JobManagerAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'JobCreated',
          })
          chainJobId = (ev as any).args.jobId?.toString?.() ?? null
          break
        } catch {}
      }
    } catch {}

    const mergedMetadata = { ...(basePayload.metadata || {}), chainJobId: chainJobId ? Number(chainJobId) : undefined }
    const jobCreatePayload: OffchainJobCreate = {
      ...basePayload,
      metadata: mergedMetadata,
      workerId: workerId!,
      wallet: walletAddress.value!,
    }
    const resp = await apiPost<{ id: string }>(`/jobs`, jobCreatePayload)
    const newJobId = (resp as any).id
    createdJobId.value = newJobId
    if (newJobId) {
      const target = `/jobs/${encodeURIComponent(newJobId)}`
      try {
        await router.push(target)
      } catch (navErr) {
        console.error('Navigation error after job creation', navErr)
      }
    }
  } catch (e: any) {
    alert(`Create job error: ${e?.message || e}`)
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  fetchWorkers()
})

function refreshQuoteForSelection() {
  const worker = workers.value.find(w => w.id === selectedWorkerId.value)
  const workerWallet = worker?.wallet
  if (!workerWallet || !walletAddress.value) {
    quotedReward.value = null
    feePerHour.value = null
    baseRate.value = null
    perLevelMarkup.value = null
    distance.value = null
    return
  }
  void fetchQuote(workerWallet)
}

watch(storeUserOrgId, (v) => { if (v) orgId.value = v }, { immediate: true })

watch(payloadFile, (f) => {
  if (!f) return
  const name = f.name || 'payload'
  const ts = Date.now()
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dot = safe.lastIndexOf('.')
  const base = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''
  const suggested = `programs/${base}-${ts}${ext}`
  if (objectKey.value.startsWith('programs/')) {
    objectKey.value = suggested
  }
})

watch(verifierFile, (f) => {
  if (!f) return
  const name = f.name || 'verifier'
  const ts = Date.now()
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dot = safe.lastIndexOf('.')
  const base = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''
  const suggested = `verifiers/${base}-${ts}${ext}`
  if (verifierObjectKey.value.startsWith('verifiers/')) {
    verifierObjectKey.value = suggested
  }
})

watch(selectedWorkerId, async (id) => {
  if (!id) { quotedReward.value = null; feePerHour.value = null; return }
  refreshQuoteForSelection()
})

watch(startAtInput, (v) => {
  const startSeconds = parseDateInputSeconds(v)
  const killSeconds = parseDateInputSeconds(killAtInput.value)
  if (startSeconds && killSeconds && killSeconds <= startSeconds) {
    killAtInput.value = toInputDate(addMinutes(new Date(startSeconds * 1000), 30))
  }
  refreshQuoteForSelection()
})
watch(killAtInput, () => refreshQuoteForSelection())

</script>
