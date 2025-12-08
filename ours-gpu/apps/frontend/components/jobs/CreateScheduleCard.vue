<template>
  <v-card class="mb-6 soviet-card schedule-card" variant="flat">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap" style="gap: 8px;">
      <span>Schedule</span>
      <v-chip size="small" variant="tonal" class="text-caption font-weight-medium soviet-chip schedule-duration-chip">
        Duration {{ durationDisplay }}
      </v-chip>
    </v-card-title>
    <v-card-text>
      <div class="schedule-grid">
        <div>
          <div class="d-flex flex-wrap" style="gap: 16px;">
            <v-text-field
              :model-value="startAtInput"
              type="datetime-local"
              label="Start Time"
              class="flex-1-1 soviet-input"
              :min="minStartInput"
              :error="!!scheduleError"
              :error-messages="scheduleError ? [scheduleError] : []"
              :disabled="creating"
              @update:model-value="emit('update:startAtInput', $event || '')"
            />
            <v-text-field
              :model-value="killAtInput"
              type="datetime-local"
              label="Kill Time"
              class="flex-1-1 soviet-input"
              :error="!!scheduleError"
              :error-messages="scheduleError ? [scheduleError] : []"
              :disabled="creating"
              @update:model-value="emit('update:killAtInput', $event || '')"
            />
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            Times use your local timezone.
          </div>
        </div>

        <div>
          <div class="d-flex justify-space-between align-end flex-wrap timeline-meta">
            <div>
              <div class="text-caption text-medium-emphasis">Start</div>
              <div class="text-body-2 font-weight-medium">{{ startLabel }}</div>
              <div class="text-caption text-medium-emphasis">{{ startRelative }}</div>
            </div>
            <div class="text-right">
              <div class="text-caption text-medium-emphasis">End</div>
              <div class="text-body-2 font-weight-medium">{{ killLabel }}</div>
              <div class="text-caption text-medium-emphasis">{{ killRelative }}</div>
            </div>
          </div>

          <div class="timeline-shell" :class="{ 'timeline-shell--empty': !hasSchedule }">
            <div class="timeline-rail"></div>
            <div
              v-for="job in otherJobWindows"
              :key="job.id"
              class="other-job"
              :class="job.statusClass"
              :style="job.style"
              :title="`Job ${job.id} — ${job.startSeconds}s to ${job.killSeconds}s`"
            >
              <span class="other-job__label">Job {{ job.id.slice(0, 6) }}</span>
            </div>
            <div v-if="hasSchedule" class="job-window" :style="jobWindowStyle">
              <span class="job-window__label">Job window</span>
            </div>
            <div
              v-if="hasSchedule && nowPercent !== null"
              class="now-indicator"
              :class="`now-indicator--${scheduleState}`"
              :style="{ left: `${nowPercent}%` }"
            >
              <div class="now-line"></div>
              <div class="now-dot"></div>
              <div class="now-tag">Now</div>
            </div>
          </div>

          <div class="d-flex justify-space-between align-center mt-2 flex-wrap text-caption" style="gap: 8px;">
            <div class="text-medium-emphasis">{{ stateHeadline }}</div>
            <div class="text-medium-emphasis">
              {{ runtimeLabel }}: <span class="font-weight-medium text-high-emphasis">{{ remainingDisplay }}</span>
            </div>
          </div>
          <v-alert
            v-if="scheduleError"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ scheduleError }}
          </v-alert>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatDurationDisplay, parseDateInputSeconds, toInputDate } from '@/utils/time'

const emit = defineEmits<{
  (e: 'update:startAtInput', value: string): void
  (e: 'update:killAtInput', value: string): void
}>()

const props = defineProps<{
  startAtInput: string
  killAtInput: string
  creating: boolean
  durationDisplay: string
  scheduleError?: string | null
  otherJobs?: {
    id: string
    startSeconds: number
    killSeconds: number
    status?: string | null
  }[]
}>()

const nowSeconds = ref(Math.floor(Date.now() / 1000))
let tickHandle: number | undefined

onMounted(() => {
  tickHandle = window.setInterval(() => {
    nowSeconds.value = Math.floor(Date.now() / 1000)
  }, 30000)
})

onBeforeUnmount(() => {
  if (tickHandle != null) {
    window.clearInterval(tickHandle)
  }
})

const startSeconds = computed(() => parseDateInputSeconds(props.startAtInput))
const killSeconds = computed(() => parseDateInputSeconds(props.killAtInput))
const hasSchedule = computed(() =>
  startSeconds.value != null && killSeconds.value != null && killSeconds.value > startSeconds.value,
)
const normalizedOtherJobs = computed(() =>
  (props.otherJobs ?? []).filter(j => Number.isFinite(j.startSeconds) && Number.isFinite(j.killSeconds)),
)

const durationLabel = computed(() => (props.durationDisplay === '—' ? 'the selected window' : props.durationDisplay))

const startLabel = computed(() => formatDateTime(startSeconds.value))
const killLabel = computed(() => formatDateTime(killSeconds.value))
const startRelative = computed(() => formatRelativeToNow(startSeconds.value))
const killRelative = computed(() => formatRelativeToNow(killSeconds.value))

const scheduleState = computed<'before' | 'active' | 'after' | 'invalid'>(() => {
  if (!hasSchedule.value) return 'invalid'
  const now = nowSeconds.value
  if (startSeconds.value != null && now < startSeconds.value) return 'before'
  if (killSeconds.value != null && now > killSeconds.value) return 'after'
  return 'active'
})

const minStartInput = computed(() => toInputDate(new Date(nowSeconds.value * 1000)))

const rangeStartSeconds = computed(() => {
  if (!hasSchedule.value) return null
  const starts = [nowSeconds.value, startSeconds.value!]
  for (const job of normalizedOtherJobs.value) {
    starts.push(job.startSeconds)
  }
  return Math.min(...starts)
})
const rangeEndSeconds = computed(() => {
  if (!hasSchedule.value) return null
  let end = killSeconds.value!
  for (const job of normalizedOtherJobs.value) {
    if (job.killSeconds > end) end = job.killSeconds
  }
  return end
})
const rangeSpanSeconds = computed(() => {
  if (!hasSchedule.value) return null
  const start = rangeStartSeconds.value
  const end = rangeEndSeconds.value
  if (start == null || end == null) return null
  const span = end - start
  return span > 0 ? span : null
})

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const startPercent = computed(() => {
  if (!hasSchedule.value || rangeSpanSeconds.value == null || rangeStartSeconds.value == null) return 0
  return clampPercent(((startSeconds.value! - rangeStartSeconds.value) / rangeSpanSeconds.value) * 100)
})

const jobWidthPercent = computed(() => {
  if (!hasSchedule.value || rangeSpanSeconds.value == null) return 0
  const pct = clampPercent(((killSeconds.value! - startSeconds.value!) / rangeSpanSeconds.value) * 100)
  return Math.max(4, pct)
})

const nowPercent = computed(() => {
  if (!hasSchedule.value || rangeSpanSeconds.value == null || rangeStartSeconds.value == null) return null
  return clampPercent(((nowSeconds.value - rangeStartSeconds.value) / rangeSpanSeconds.value) * 100)
})

const jobWindowStyle = computed(() => {
  const width = Math.min(jobWidthPercent.value, Math.max(0, 100 - startPercent.value))
  return {
    width: `${width}%`,
    left: `${startPercent.value}%`,
  }
})
const otherJobWindows = computed(() => {
  if (!hasSchedule.value || rangeSpanSeconds.value == null || rangeStartSeconds.value == null) return []
  return normalizedOtherJobs.value.map((job) => {
    const startPct = clampPercent(((job.startSeconds - rangeStartSeconds.value!) / rangeSpanSeconds.value!) * 100)
    const widthPct = clampPercent(((job.killSeconds - job.startSeconds) / rangeSpanSeconds.value!) * 100)
    const width = Math.min(Math.max(3, widthPct), Math.max(0, 100 - startPct))
    return {
      ...job,
      style: {
        left: `${startPct}%`,
        width: `${width}%`,
      },
      statusClass: statusToClass(job.status),
    }
  })
})

const remainingDisplay = computed(() => {
  if (!hasSchedule.value || killSeconds.value == null || startSeconds.value == null) return '—'
  if (scheduleState.value === 'before') {
    return formatDurationDisplay(killSeconds.value - startSeconds.value)
  }
  if (scheduleState.value === 'active') {
    return formatDurationDisplay(Math.max(0, killSeconds.value - nowSeconds.value))
  }
  return formatDurationDisplay(killSeconds.value - startSeconds.value)
})

const runtimeLabel = computed(() => {
  if (!hasSchedule.value) return 'Runtime'
  if (scheduleState.value === 'before') return 'Planned runtime'
  if (scheduleState.value === 'active') return 'Time left'
  return 'Ran for'
})

const stateHeadline = computed(() => {
  if (!hasSchedule.value) return 'Pick start and kill times to preview the run.'
  if (scheduleState.value === 'before') return `Starts ${startRelative.value}, then runs ${durationLabel.value}.`
  if (scheduleState.value === 'active') return `${remainingDisplay.value} left in this run.`
  return `Ended ${killRelative.value}.`
})

function formatDateTime(seconds: number | null): string {
  if (seconds == null) return 'Not set'
  const dt = new Date(seconds * 1000)
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeToNow(targetSeconds: number | null): string {
  if (targetSeconds == null) return 'Pick a time'
  const diff = targetSeconds - nowSeconds.value
  const abs = Math.abs(diff)
  const suffix = diff < 0 ? ' ago' : ''
  if (abs < 60) return diff >= 0 ? 'in <1m' : '<1m ago'
  if (abs < 3600) return `${diff >= 0 ? 'in ' : ''}${Math.round(abs / 60)}m${suffix}`
  if (abs < 86400) return `${diff >= 0 ? 'in ' : ''}${Math.round(abs / 3600)}h${suffix}`
  return `${diff >= 0 ? 'in ' : ''}${Math.round(abs / 86400)}d${suffix}`
}

function statusToClass(status?: string | null): string {
  const s = String(status || '').toUpperCase()
  if (s === 'PROCESSING' || s === 'VERIFYING') return 'other-job--active'
  return 'other-job--pending'
}
</script>
