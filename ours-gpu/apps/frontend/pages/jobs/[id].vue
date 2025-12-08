<template>
  <div class="pa-4">
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h1 class="mb-1">Job Detail</h1>
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

    <JobOverviewCard :job="job" />
    <JobTimingCard :job="job" />
    <JobTokensCard :job="job" />
    <JobResultCard :job="job" />
    <JobMetricsCard :metrics="metrics" :metrics-pretty="metricsPretty" />
    <JobRawPanel :job="job" />
  </div>
  
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import JobOverviewCard from '@/components/jobs/JobOverviewCard.vue'
import JobTimingCard from '@/components/jobs/JobTimingCard.vue'
import JobTokensCard from '@/components/jobs/JobTokensCard.vue'
import JobResultCard from '@/components/jobs/JobResultCard.vue'
import JobMetricsCard from '@/components/jobs/JobMetricsCard.vue'
import JobRawPanel from '@/components/jobs/JobRawPanel.vue'
import type { JobDetail } from '@/types/jobs'

const route = useRoute()
const id = computed(() => String(route.params.id || ''))
const runtimeConfig = useRuntimeConfig()
const apiBase = (runtimeConfig.public.apiBase || '/api').replace(/\/$/, '')
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
async function fetchJob() {
  if (!id.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${apiBase}/jobs/${encodeURIComponent(id.value)}`)
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
.ml-3 { margin-left: 12px; }
</style>
