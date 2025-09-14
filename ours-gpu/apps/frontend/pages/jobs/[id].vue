<template>
  <div class="pa-4">
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h1 class="text-h5 mb-1">Job Detail</h1>
        <div class="text-caption text-medium-emphasis">ID: <code>{{ id }}</code></div>
      </div>
      <div>
        <NuxtLink to="/jobs">
          <v-btn variant="tonal">Back to Jobs</v-btn>
        </NuxtLink>
        <v-btn class="ml-3" color="primary" :loading="loading" @click="fetchJob">Refresh</v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-card class="mb-4" variant="flat">
      <v-card-title class="text-subtitle-1">Overview</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap gap-6">
          <div>
            <div class="text-caption text-medium-emphasis">Status</div>
            <v-chip size="small" :color="statusColor(job?.status)" variant="tonal">
              {{ job?.status || '—' }}
            </v-chip>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Type</div>
            <div>{{ job?.jobType || '—' }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Worker</div>
            <code>{{ job?.workerId || '—' }}</code>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Created</div>
            <div>{{ formatTs(job?.createdAt) }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Verification</div>
            <div>{{ job?.verification || '—' }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4" variant="tonal">
      <v-card-title class="text-subtitle-1">Result</v-card-title>
      <v-card-text>
        <div class="d-flex flex-column gap-3">
          <div v-if="job?.outputObjectKey">
            <div class="text-caption text-medium-emphasis">Saved as</div>
            <code>{{ job.outputObjectKey }}</code>
            <div class="mt-2">
              <a v-if="job?.outputGetUrl" :href="job.outputGetUrl" target="_blank" rel="noopener noreferrer">
                <v-btn color="primary" variant="elevated">Download Result</v-btn>
              </a>
              <span v-else class="text-medium-emphasis">No download URL</span>
            </div>
          </div>
          <div v-if="job?.solution">
            <div class="text-caption text-medium-emphasis">Inline preview</div>
            <pre class="result-pre">{{ job.solution }}</pre>
          </div>
          <div v-if="!job?.outputObjectKey && !job?.solution" class="text-medium-emphasis">No result yet.</div>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4" variant="flat">
      <v-card-title class="text-subtitle-1">Metrics</v-card-title>
      <v-card-text>
        <div v-if="metrics">
          <pre class="metrics-pre">{{ metricsPretty }}</pre>
        </div>
        <div v-else class="text-medium-emphasis">No metrics reported.</div>
      </v-card-text>
    </v-card>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel>
        <v-expansion-panel-title>Raw Job JSON</v-expansion-panel-title>
        <v-expansion-panel-text>
          <pre class="raw-pre">{{ job }}</pre>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
  
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'

type JobDetail = {
  id: string
  orgId: string
  jobType: string
  status: 'REQUESTED'|'SCHEDULED'|'PROCESSING'|'VERIFYING'|'DONE'|'FAILED'
  objectKey: string
  outputObjectKey?: string | null
  metadata?: any
  priority: number
  workerId?: string | null
  userId?: string | null
  entryCommand?: string | null
  verification: 'BUILTIN_HASH' | 'USER_PROGRAM'
  verifierObjectKey?: string | null
  verifierCommand?: string | null
  createdAt: string
  updatedAt: string
  // Runtime fields
  solution?: string
  metricsJson?: string
  outputGetUrl?: string
}

const route = useRoute()
const id = computed(() => String(route.params.id || ''))
const job = ref<JobDetail | null>(null)
const loading = ref(false)
const error = ref('')
let timer: any = null

const metrics = computed(() => {
  const m = job.value?.metricsJson
  if (!m) return null
  try { return JSON.parse(m) } catch { return m }
})
const metricsPretty = computed(() => {
  const m = metrics.value
  if (!m) return ''
  try { return typeof m === 'string' ? m : JSON.stringify(m, null, 2) } catch { return String(m) }
})

function formatTs(ts?: string) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleString() } catch { return ts }
}
function statusColor(s?: JobDetail['status']) {
  switch (s) {
    case 'DONE': return 'green'
    case 'FAILED': return 'red'
    case 'PROCESSING': return 'blue'
    case 'VERIFYING': return 'purple'
    case 'SCHEDULED': return 'orange'
    default: return 'grey'
  }
}

async function fetchJob() {
  if (!id.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id.value)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    job.value = await res.json()
  } catch (e: any) {
    error.value = e?.message || 'Failed to load job'
  } finally {
    loading.value = false
  }
}

function setupAutoRefresh() {
  clearInterval(timer)
  timer = setInterval(() => {
    const s = job.value?.status
    if (s === 'DONE' || s === 'FAILED') return
    fetchJob()
  }, 4000)
}

onMounted(async () => {
  await fetchJob()
  setupAutoRefresh()
})
onBeforeUnmount(() => { clearInterval(timer) })
</script>

<style scoped>
.gap-6 { gap: 24px; }
.ml-3 { margin-left: 12px; }
.result-pre, .metrics-pre, .raw-pre {
  background: rgba(0,0,0,0.04);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
.raw-pre { max-height: 360px; overflow: auto; }
</style>
