<template>
  <div class="pa-4">
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h5">My Jobs</h1>
      <NuxtLink to="/jobs/new">
        <v-btn color="primary" variant="tonal">Create Job</v-btn>
      </NuxtLink>
    </div>

    <v-alert v-if="!connected" type="info" variant="tonal" class="mb-4">
      Connect your wallet to view your jobs.
      <v-btn color="primary" class="ml-3" :loading="pending" @click="connect">Connect Wallet</v-btn>
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
  createdAt: string
}

const wallet = useWalletStore()
const { address, connected, pending } = storeToRefs(wallet)
const { connect } = wallet

const addressDisplay = computed(() => address.value || '—')
const jobs = ref<JobRow[]>([])
const loading = ref(false)

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
    const res = await fetch(`/api/jobs/user?userId=${encodeURIComponent(addr)}`)
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
</script>

<style scoped>
.gap-4 { gap: 16px; }
.flex-1-1 { flex: 1 1 320px; min-width: 280px; }
.ml-3 { margin-left: 12px; }
</style>
