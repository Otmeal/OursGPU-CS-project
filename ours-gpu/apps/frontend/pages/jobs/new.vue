<template>
  <div class="pa-4">
    <h1 class="text-h5 mb-4">Create Job</h1>

    <v-card class="mb-6" variant="tonal">
      <v-card-title>Payload</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap align-center gap-4">
          <v-file-input
            v-model="payloadFile"
            label="Program / Payload file"
            accept=".js,.py,.sh,.zip,.tar.gz,.txt,*/*"
            prepend-icon="mdi-file-upload"
            :disabled="uploading || creating"
            class="flex-1-1"
          />
          <v-text-field
            v-model="objectKey"
            label="Object Key (MinIO)"
            hint="e.g. programs/hash-miner-<timestamp>.js"
            persistent-hint
            :disabled="uploading || creating"
            class="flex-1-1"
          />
          <v-btn
            color="primary"
            :loading="uploading"
            :disabled="!payloadFile || !objectKey || creating"
            @click="uploadPayload"
          >
            Upload
          </v-btn>
        </div>
        <div class="mt-2 text-caption" v-if="uploadedPayload">
          Uploaded to: <code>{{ uploadedPayload }}</code>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-6" variant="tonal">
      <v-card-title>Job Details</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap gap-4">
          <v-text-field :model-value="userOrgNameDisplay" label="Organization" class="flex-1-1" readonly />
          <v-text-field v-model="jobType" label="Job Type" class="flex-1-1" />
          <v-text-field
            :model-value="quotedRewardDisplay"
            label="Staked Tokens (max)"
            class="flex-1-1"
            readonly
            hint="Computed from schedule and org pricing"
            persistent-hint
          />
          <v-select
            v-model="verification"
            :items="verificationItems"
            label="Verification"
            class="flex-1-1"
          />
          <v-text-field
            v-model.number="priority"
            type="number"
            label="Priority"
            class="flex-1-1"
          />
        </div>

        <v-textarea
          v-model="entryCommand"
          label="Entry Command"
          hint="Runs inside worker environment. $PAYLOAD_PATH is set to the uploaded file."
          persistent-hint
          rows="3"
          class="mt-2"
        />

        <div v-if="verification === 'USER_PROGRAM'" class="mt-4">
          <v-divider class="mb-4" />
          <h3 class="text-subtitle-1 mb-2">Custom Verifier</h3>
          <div class="d-flex flex-wrap gap-4 align-center">
            <v-file-input
              v-model="verifierFile"
              label="Verifier file (optional)"
              accept=".js,.py,.sh,.zip,.tar.gz,.txt,*/*"
              prepend-icon="mdi-file-upload"
              :disabled="uploadingVerifier || creating"
              class="flex-1-1"
            />
            <v-text-field
              v-model="verifierObjectKey"
              label="Verifier Object Key"
              hint="e.g. verifiers/hash-verifier-<timestamp>.js"
              persistent-hint
              :disabled="uploadingVerifier || creating"
              class="flex-1-1"
            />
            <v-btn
              color="primary"
              :loading="uploadingVerifier"
              :disabled="!verifierFile || !verifierObjectKey || creating"
              @click="uploadVerifier"
            >
              Upload Verifier
            </v-btn>
          </div>
          <v-text-field
            v-model="verifierCommand"
            label="Verifier Command"
            hint="Command to run verifier; $VERIFIER_PATH will point to uploaded file"
            persistent-hint
            class="mt-2"
          />
          <div class="mt-2 text-caption" v-if="uploadedVerifier">
            Uploaded verifier to: <code>{{ uploadedVerifier }}</code>
          </div>
        </div>

        <v-textarea
          v-model="metadataJson"
          class="mt-4"
          label="Metadata (JSON, optional)"
          rows="3"
          :error="metadataError !== ''"
          :error-messages="metadataError"
        />
      </v-card-text>
    </v-card>

    <v-card class="mb-6" variant="tonal">
      <v-card-title>Schedule</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap gap-4">
          <v-text-field
            v-model="startAtInput"
            type="datetime-local"
            label="Start Time"
            class="flex-1-1"
            :disabled="creating"
          />
          <v-text-field
            v-model="killAtInput"
            type="datetime-local"
            label="Kill Time"
            class="flex-1-1"
            :disabled="creating"
          />
        </div>
        <div class="mt-2 text-caption">
          Duration: {{ durationDisplay }}
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-6" variant="tonal">
      <v-card-title>Pricing Preview</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap gap-4">
          <v-text-field
            :model-value="feePerHourDisplay"
            label="Fee / hour"
            class="flex-1-1"
            readonly
          />
          <v-text-field
            :model-value="quotedRewardDisplay"
            label="Staked Tokens (max)"
            class="flex-1-1"
            readonly
          />
          <v-text-field
            :model-value="distanceDisplay"
            label="Org Distance"
            class="flex-1-1"
            readonly
          />
          <v-text-field
            :model-value="baseRateDisplay"
            label="baseRate (4dp)"
            class="flex-1-1"
            readonly
          />
          <v-text-field
            :model-value="perLevelMarkupDisplay"
            label="perLevelMarkup (4dp)"
            class="flex-1-1"
            readonly
          />
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-6" variant="tonal">
      <v-card-title>Dispatch</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap gap-4 align-center">
          <v-select
            v-model="selectedWorkerId"
            :items="workerItems"
            label="Choose Worker"
            :loading="workersLoading"
            clearable
            class="flex-1-1"
          />
          <v-btn
            color="primary"
            :loading="creating"
            :disabled="creating || !objectKey || !uploadedPayload || !selectedWorkerId || !walletReadyForJobs"
            @click="createJob"
          >
            Create Job
          </v-btn>
        </div>
        <div class="mt-2" v-if="!walletAddress">
          <v-alert type="info" variant="tonal">
            Connect your wallet to create a job.
          </v-alert>
        </div>
        <div class="mt-2" v-else-if="registrationChecked && !walletRegistered">
          <v-alert type="warning" variant="tonal">
            Please finish wallet registration (name + email) from the top-right connect menu before creating jobs.
          </v-alert>
        </div>
        <div class="mt-3" v-if="createdJobId">
          <v-alert type="success" variant="tonal">
            Job created: <code>{{ createdJobId }}</code>
          </v-alert>
        </div>
      </v-card-text>
    </v-card>
  </div>
  
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWalletStore } from '@/stores/wallet'
import { createPublicClient, createWalletClient, custom, decodeEventLog, formatUnits } from 'viem'
import { foundry } from 'viem/chains'
import { JobManagerAbi } from '@ours-gpu/shared/contracts/jobManager'
import { OrgRegistryAbi } from '@ours-gpu/shared/contracts/orgRegistry'
import { orgTupleToObject } from '@/utils/orgRegistry'

type WorkerRow = { id: string, orgId: string, concurrency: number, running: number }

// Types for off-chain job creation payloads sent to controller
type OffchainJobBase = {
  orgId: string
  jobType: string
  objectKey: string
  entryCommand?: string
  verification: 'BUILTIN_HASH' | 'USER_PROGRAM'
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

function toInputDate(d: Date) {
  const pad = (v: number) => v.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function parseDateInputSeconds(v: string | null | undefined): number | null {
  if (!v) return null
  const ms = Date.parse(v)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

// Form state
const orgId = ref('org-1')
const jobType = ref('hash_mining')
const verification = ref<'BUILTIN_HASH' | 'USER_PROGRAM'>('BUILTIN_HASH')
const priority = ref<number>(0)
const metadataJson = ref('')
const metadataError = ref('')
const startAtInput = ref(toInputDate(addMinutes(new Date(), 3)))
const killAtInput = ref(toInputDate(addMinutes(new Date(), 8)))
const feePerHour = ref<bigint | null>(null)
const distance = ref<bigint | null>(null)
const baseRate = ref<bigint | null>(null)
const perLevelMarkup = ref<bigint | null>(null)
// Chain-computed reward (raw units)
const quotedReward = ref<bigint | null>(null)
const quotedRewardDecimals = ref<number>(18)
const quotedRewardDisplay = computed(() => {
  if (quotedReward.value == null) return '—'
  try { return formatUnits(quotedReward.value, quotedRewardDecimals.value) } catch { return quotedReward.value.toString() }
})
const feePerHourDisplay = computed(() => {
  if (feePerHour.value == null) return '—'
  try { return `${formatUnits(feePerHour.value, quotedRewardDecimals.value)} / hr` } catch { return feePerHour.value.toString() }
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
const durationSeconds = computed(() => {
  const s = parseDateInputSeconds(startAtInput.value)
  const t = parseDateInputSeconds(killAtInput.value)
  if (!s || !t || t <= s) return 0
  return t - s
})
const durationDisplay = computed(() => {
  if (!durationSeconds.value) return '—'
  const hours = durationSeconds.value / 3600
  const mins = Math.round((durationSeconds.value % 3600) / 60)
  if (hours >= 1) return `${hours.toFixed(2)} hours`
  return `${mins} minutes`
})

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
const workers = ref<(WorkerRow & { wallet?: string | null, orgName?: string | null })[]>([])
const workersLoading = ref(false)
const selectedWorkerId = ref<string | null>(null)

// Result
const creating = ref(false)
const createdJobId = ref<string | null>(null)

// Wallet (required to create jobs)
const wallet = useWalletStore()
const {
  address: walletAddress,
  userOrgId: storeUserOrgId,
  userOrgName,
  walletRegistered,
  registrationChecked,
} = storeToRefs(wallet)
const { connect } = wallet
const walletReadyForJobs = computed(() => !!walletAddress.value && walletRegistered.value)

const verificationItems = [
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
  // Read directly from OrgRegistry: fee = calculateFee(userOrg, nodeOrg)
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
    // Resolve OrgRegistry and Token addresses from JobManager
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

    // Read orgs for requester and worker
    const [userOrg, workerOrg] = await Promise.all([
      publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'userOrganizations', args: [walletAddress.value as `0x${string}`] }) as Promise<bigint>,
      publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'nodeOrganizations', args: [workerWallet as `0x${string}`] }) as Promise<bigint>,
    ])

    // Always store numeric user orgId for payloads
    orgId.value = userOrg.toString()

    // Resolve and cache names for user + selected worker
    try {
      const [userOrgInfo, workerOrgInfo] = await Promise.all([
        publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'organizations', args: [userOrg] }) as Promise<any>,
        publicClient.readContract({ address: orgRegistry, abi: OrgRegistryAbi, functionName: 'organizations', args: [workerOrg] }) as Promise<any>,
      ])

      console.log('User org info:', userOrgInfo, 'Worker org info:', workerOrgInfo)
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
    console.log(`Quote for userOrg=${userOrg} workerOrg=${workerOrg}: ${fee.toString()}`)
    const dist = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'getDistanceToLCA',
      args: [workerOrg, userOrg],
    }) as bigint
    distance.value = dist
    const duration = BigInt(killSeconds - startSeconds)
    quotedReward.value = duration === 0n ? 0n : ((fee * duration + 3599n) / 3600n)
    // Read token decimals to format smallest-unit fee for display
    const erc20Abi = [
      { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8', name: '' }] },
    ] as const
    const d = await publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }) as number
    quotedRewardDecimals.value = Number(d) || 18
  } catch (e) {
    // On failure, clear quote but do not disrupt UX
    quotedReward.value = null
    feePerHour.value = null
  }
}

// Helpers: POST JSON to controller via /api
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
  // Convert absolute presigned URL (e.g., http://localhost:9000/bucket/key?...)
  // into our nginx path: /s3/bucket/key?... so browser avoids CORS.
  if (!s3ProxyBase) return url
  const u = new URL(url)
  return `${s3ProxyBase}${u.pathname}${u.search}`
}
async function uploadToPresigned(url: string, file: File) {
  const proxyUrl = toS3Proxy(url)
  const res = await fetch(proxyUrl, {
    method: 'PUT',
    // No special headers to keep SigV4 valid (host-only signed)
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

    // 1) Resolve worker wallet
    const worker = workers.value.find(w => w.id === selectedWorkerId.value)
    const workerWallet = worker?.wallet
    if (!workerWallet) {
      alert('Selected worker has no wallet address registered yet. Please re-register worker.')
      return
    }
    // Fetch chain-computed reward quote
    await fetchQuote(workerWallet)
    if (!quotedReward.value || quotedReward.value <= 0n) {
      alert('Failed to get reward quote')
      return
    }

    // 2) Prep chain clients and resolve addresses
    const jmAddress = runtimeConfig.public.jobManagerAddress
    if (!jmAddress) {
      alert('Missing JobManager address in config')
      return
    }
    const provider = (window as any).ethereum
    // viem clients
    const publicClient = createPublicClient({ chain: foundry, transport: custom(provider) })
    const walletClient = createWalletClient({ chain: foundry, transport: custom(provider), account: walletAddress.value as `0x${string}` })
    // Resolve Token address from JobManager
    const tokenAddress = await publicClient.readContract({
      address: jmAddress as `0x${string}`,
      abi: JobManagerAbi,
      functionName: 'token',
    }) as `0x${string}`
    // token abi for approve/allowance
    const tokenAbi = [
      { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
      { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
      { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }
    ] as const
    // 3) Request controller signature/quote to get the exact stake needed
    const signResp = await apiPost<any>(`/jobs/sign-create`, {
      requester: walletAddress.value,
      // omit orgId to let backend resolve from chain
      target: '0x' + '0'.repeat(64),
      difficulty: 0,
      worker: workerWallet,
      startAt: startSeconds,
      killAt: killSeconds,
    })
    // Align local quote with controller-calculated reward/decimals
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

    // 4) Approve reward to JobManager to match the exact stake (force refresh if mismatch)
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

    // 5) Call createJobWithControllerSig via viem
    const permit = { value: 0n, deadline: 0n, v: 0, r: ('0x' + '0'.repeat(64)) as `0x${string}`, s: ('0x' + '0'.repeat(64)) as `0x${string}` }
    const txHash = await walletClient.writeContract({
      address: jmAddress as `0x${string}`,
      abi: JobManagerAbi,
      functionName: 'createJobWithControllerSig',
      args: [jobParams as any, signResp.signature as `0x${string}`, permit],
      chain: foundry,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })
    // Parse event for on-chain jobId
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
          // If decoding succeeds with the specified event name, we got the right log
          chainJobId = (ev as any).args.jobId?.toString?.() ?? null
          break
        } catch {}
      }
    } catch {}

    // 6) Create off-chain job record for scheduling/IO, embedding chain job id in metadata
    const mergedMetadata = { ...(basePayload.metadata || {}), chainJobId: chainJobId ? Number(chainJobId) : undefined }
    const jobCreatePayload: OffchainJobCreate = {
      ...basePayload,
      metadata: mergedMetadata,
      workerId: workerId!,
      wallet: walletAddress.value!,
    }
    const resp = await apiPost<{ id: string }>(`/jobs`, jobCreatePayload)
    createdJobId.value = (resp as any).id
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

// Fetch user's org + name when wallet connects
// Sync local orgId used for job payloads with store's resolved userOrgId
watch(storeUserOrgId, (v) => { if (v) orgId.value = v }, { immediate: true })

// When a file is chosen, suggest an objectKey if the user hasn't customized much
watch(payloadFile, (f) => {
  if (!f) return
  const name = f.name || 'payload'
  const ts = Date.now()
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dot = safe.lastIndexOf('.')
  const base = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''
  const suggested = `programs/${base}-${ts}${ext}`
  // only auto-update if objectKey looks like our previous suggestion
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

// Pre-fetch reward quote whenever worker selection changes
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

<style scoped>
.gap-4 { gap: 16px; }
.flex-1-1 { flex: 1 1 300px; }
</style>
