<template>
  <div class="pa-4">
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h5">My Jobs</h1>
      <v-btn
        color="primary"
        variant="tonal"
        :to="connected ? '/jobs/new' : undefined"
        :disabled="!connected"
      >
        Create Job
      </v-btn>
    </div>

    <v-alert v-if="!connected" type="info" variant="tonal" class="mb-4">
      Connect your wallet to view your jobs.
      <v-btn color="primary" class="ml-3" :loading="pending" @click="connectAndMaybeRegister">
        Connect Wallet
      </v-btn>
    </v-alert>

    <div class="d-flex flex-wrap gap-4 align-center mb-4">
      <v-text-field
        v-model="addressDisplay"
        label="Wallet"
        readonly
        class="flex-1-1"
      />
      <v-btn color="primary" :loading="loading" :disabled="!connected" @click="fetchJobs">Refresh</v-btn>
    </div>

    <v-card variant="flat">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th class="text-left">Job ID</th>
            <th class="text-left">Type</th>
            <th class="text-left">Status</th>
            <th class="text-left">Worker</th>
            <th class="text-left">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.id">
            <td>
              <NuxtLink :to="`/jobs/${j.id}`">
                <code>{{ j.id }}</code>
              </NuxtLink>
            </td>
            <td>{{ j.jobType }}</td>
            <td>
              <v-chip size="small" :color="statusColor(j.status)" variant="tonal">
                {{ j.status }}
              </v-chip>
            </td>
            <td><code>{{ j.workerId || '—' }}</code></td>
            <td>{{ formatTs(j.createdAt) }}</td>
          </tr>
          <tr v-if="!loading && jobs.length === 0">
            <td colspan="5" class="text-disabled">No jobs found</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog v-model="registrationDialog" max-width="480">
      <v-card>
        <v-card-title>Complete wallet registration</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            Provide a name and email to link this wallet before viewing jobs.
          </p>
          <v-alert
            v-if="registrationError"
            type="error"
            variant="tonal"
            class="mb-3"
          >
            {{ registrationError }}
          </v-alert>
          <v-text-field
            v-model="regName"
            label="Name"
            density="comfortable"
            required
          />
          <v-text-field
            v-model="regEmail"
            label="Email"
            density="comfortable"
            required
            type="email"
          />
          <v-text-field
            v-model="regPepper"
            label="Pepper version (optional)"
            density="comfortable"
            type="number"
            min="1"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            :loading="registering"
            :disabled="!canSubmit"
            @click="submitRegistration"
          >
            Register
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWalletStore } from '@/stores/wallet'

type JobRow = {
  id: string
  jobType: string
  status: 'REQUESTED'|'SCHEDULED'|'PROCESSING'|'VERIFYING'|'DONE'|'FAILED'
  workerId?: string | null
  walletId?: string | null
  createdAt: string
}

const runtimeConfig = useRuntimeConfig()
const apiBase = (runtimeConfig.public.apiBase || '/api').replace(/\/$/, '')

const wallet = useWalletStore()
const {
  address,
  connected,
  pending,
  walletRegistered,
  registrationChecked,
  registrationError,
  registering,
} = storeToRefs(wallet)
const { connect, registerWallet, refreshWalletRegistration } = wallet

const addressDisplay = computed(() => address.value || '—')
const jobs = ref<JobRow[]>([])
const loading = ref(false)
const registrationDialog = ref(false)
const regName = ref('')
const regEmail = ref('')
const regPepper = ref<string>('')

const canSubmit = computed(() => !!regName.value.trim() && !!regEmail.value.trim())
const walletReady = computed(() => connected.value && walletRegistered.value)

function formatTs(ts: string) {
  try { return new Date(ts).toLocaleString() } catch { return ts }
}
function statusColor(s: JobRow['status']) {
  switch (s) {
    case 'DONE': return 'green'
    case 'FAILED': return 'red'
    case 'PROCESSING': return 'blue'
    case 'VERIFYING': return 'purple'
    case 'SCHEDULED': return 'orange'
    default: return 'grey'
  }
}

async function fetchJobs() {
  const addr = (address.value || '').trim().toLowerCase()
  if (!addr) {
    jobs.value = []
    return
  }
  loading.value = true
  try {
    const res = await fetch(`${apiBase}/jobs/wallet?walletId=${encodeURIComponent(addr)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    jobs.value = await res.json()
  } catch (e) {
    console.error('Fetch jobs failed', e)
    jobs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (connected.value) fetchJobs()
})
watch(connected, (c) => { if (c) fetchJobs(); else jobs.value = [] })
watch(address, () => { if (connected.value) fetchJobs() })

watch(
  [connected, registrationChecked, walletRegistered, address],
  ([isConnected, checked, registered]) => {
    registrationDialog.value = Boolean(isConnected && checked && !registered)
    if (isConnected && registered) {
      void fetchJobs()
    }
  },
)

async function connectAndMaybeRegister() {
  await connect()
  await refreshWalletRegistration()
}

async function submitRegistration() {
  if (!canSubmit.value) return
  const pepperNum =
    regPepper.value && !Number.isNaN(Number(regPepper.value))
      ? Number(regPepper.value)
      : undefined
  try {
    await registerWallet({
      name: regName.value.trim(),
      email: regEmail.value.trim(),
      pepperVersion: pepperNum,
    })
    await refreshWalletRegistration()
  } catch {
    // error surfaced via registrationError alert
  }
}
</script>

<style scoped>
.gap-4 { gap: 16px; }
.flex-1-1 { flex: 1 1 320px; min-width: 280px; }
.ml-3 { margin-left: 12px; }
</style>
