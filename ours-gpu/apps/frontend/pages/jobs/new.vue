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
          <v-text-field v-model="orgId" label="Org ID" class="flex-1-1" />
          <v-text-field v-model="jobType" label="Job Type" class="flex-1-1" />
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
      <v-card-title>Dispatch</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap gap-4 align-end">
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
            :disabled="creating || !objectKey || !uploadedPayload || !selectedWorkerId || !walletAddress"
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

type WorkerRow = { id: string, orgId: string, concurrency: number, running: number }

// Form state
const orgId = ref('org-1')
const jobType = ref('hash_mining')
const verification = ref<'BUILTIN_HASH' | 'USER_PROGRAM'>('BUILTIN_HASH')
const priority = ref<number>(0)
const metadataJson = ref('')
const metadataError = ref('')

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

// Wallet (required to create jobs)
const wallet = useWalletStore()
const { address: walletAddress } = storeToRefs(wallet)
const { connect } = wallet

const verificationItems = [
  { title: 'Built-in Hash', value: 'BUILTIN_HASH' },
  { title: 'User Program', value: 'USER_PROGRAM' },
]

const workerItems = computed(() => workers.value.map(w => ({ title: `${w.id} (org=${w.orgId}, running=${w.running}/${w.concurrency})`, value: w.id })))

// Helpers: POST JSON to controller via /api
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function fetchWorkers() {
  workersLoading.value = true
  try {
    const res = await fetch('/api/workers')
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
  try {
    const u = new URL(url)
    return `/s3${u.pathname}${u.search}`
  } catch {
    // If already path-like, just prefix
    return `/s3${url}`
  }
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

async function createJob() {
  if (!uploadedPayload.value) {
    alert('Please upload payload first.')
    return
  }
  if (!walletAddress.value) {
    alert('Connect your wallet to create a job.')
    try { await connect() } catch {}
    return
  }
  if (!orgId.value || !jobType.value) {
    alert('Please fill in Org ID and Job Type.')
    return
  }
  if (verification.value === 'USER_PROGRAM' && (!uploadedVerifier.value || !verifierCommand.value)) {
    if (!confirm('USER_PROGRAM selected but verifier file/command not fully set. Continue?')) return
  }
  creating.value = true
  createdJobId.value = null
  try {
    const dto: any = {
      orgId: orgId.value,
      jobType: jobType.value,
      objectKey: uploadedPayload.value,
      entryCommand: entryCommand.value || undefined,
      verification: verification.value,
      priority: priority.value ?? 0,
      metadata: parseMetadata(),
    }
    if (verification.value === 'USER_PROGRAM' && uploadedVerifier.value) {
      dto.verifierObjectKey = uploadedVerifier.value
      dto.verifierCommand = verifierCommand.value || undefined
    }

    if (!selectedWorkerId.value) {
      alert('Please choose a worker.')
      return
    }
    dto.workerId = selectedWorkerId.value
    // Attach user wallet if connected
    if (walletAddress.value) {
      dto.userWallet = walletAddress.value
    }

    const resp = await apiPost<{ id: string }>(`/jobs`, dto)
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

</script>

<style scoped>
.gap-4 { gap: 16px; }
.flex-1-1 { flex: 1 1 300px; }
</style>
