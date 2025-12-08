<template>
  <v-card class="mb-4" variant="flat">
    <v-card-title class="text-subtitle-1">Timing</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap" style="gap: 24px;">
        <div>
          <div class="text-caption text-medium-emphasis">Scheduled Start</div>
          <div>{{ formatTimestamp(job?.startAt) }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Termination Deadline</div>
          <div>{{ formatTimestamp(job?.killAt) }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Execution Started</div>
          <div>{{ formatTimestamp(job?.executedAt) }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Execution Finished</div>
          <div>{{ formatTimestamp(job?.endAt) }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Execution Duration</div>
          <div>{{ formatDuration(job?.executedSeconds) }}</div>
        </div>
      </div>
      <div class="d-flex flex-wrap mt-3" style="gap: 24px;">
        <div>
          <div class="text-caption text-medium-emphasis">Created</div>
          <div>{{ formatTimestamp(job?.createdAt) }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Last Updated</div>
          <div>{{ formatTimestamp(job?.updatedAt) }}</div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { JobDetail } from '@/types/jobs'
import { formatDuration, formatTimestamp } from '@/utils/formatters'

defineProps<{
  job: JobDetail | null
}>()
</script>
